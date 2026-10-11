import { resolve } from "node:path";
import { z } from "zod";
import { writeFileAtomicAsync } from "@/shared/atomicFileAsync";
import {
  ENVIRONMENT_STORE_MAX_ENVIRONMENTS,
  environmentChildDesktopIdSchema,
  environmentCredentialRefSchema,
  environmentDesiredSchema,
  environmentHostKeyFingerprintSchema,
  environmentLabelSchema,
  environmentLegacyConnectionIdSchema,
  environmentPortSchema,
  environmentRecordSchema,
  environmentRuntimeSchema,
  environmentTargetSchema,
  environmentTrustSchema,
  type EnvironmentLegacyConnectionId,
  type EnvironmentProjection,
  type EnvironmentRecord,
  type EnvironmentRuntime,
  type EnvironmentTrust,
} from "@/shared/environments";
import { mintEnvironmentId, nextEnvironmentRevision } from "./environmentIdentity";
import { environmentProjection, environmentProjections } from "./environmentProjection";
import {
  environmentsFilePath,
  parseEnvironmentStoreFile,
  readEnvironmentStoreFileText,
  serializeEnvironmentStoreFile,
} from "./environmentStoreFile";
import {
  EnvironmentChildIdentityChangedError,
  EnvironmentIdentifierCollisionError,
  EnvironmentLegacyConnectionConflictError,
  EnvironmentNotFoundError,
  EnvironmentRevisionConflictError,
  EnvironmentStoreBusyError,
  EnvironmentStoreClosedError,
  EnvironmentStoreLimitError,
  EnvironmentStoreLockedError,
  EnvironmentTrustChangedError,
  EnvironmentTrustMismatchError,
} from "./environmentStoreErrors";

/**
 * The live root lease capability. The composition that owns the host data root
 * passes its lease; the store never opens a root of its own and never releases
 * the lease. One store per leased root is the writer discipline (enforced
 * in-process and, across processes, by the host lease itself).
 */
export interface EnvironmentStoreLease {
  readonly paths: { readonly dataRoot: string };
  readonly generation: string;
  assertActive(expectedGeneration?: string): void;
}

export interface EnvironmentStoreOptions {
  lease: EnvironmentStoreLease;
  now?: () => number;
  mintEnvironmentId?: () => string;
}

const environmentCreateInputSchema = z.strictObject({
  label: environmentLabelSchema,
  target: environmentTargetSchema,
  port: environmentPortSchema.optional(),
  credentialRef: environmentCredentialRefSchema.optional(),
  runtime: environmentRuntimeSchema,
  trust: environmentTrustSchema.optional(),
  desired: environmentDesiredSchema.optional(),
  legacyConnectionId: environmentLegacyConnectionIdSchema.optional(),
});
export type EnvironmentCreateInput = z.infer<typeof environmentCreateInputSchema>;

const environmentUpdatePatchSchema = z.strictObject({
  label: environmentLabelSchema.optional(),
  target: environmentTargetSchema.optional(),
  port: environmentPortSchema.nullable().optional(),
  credentialRef: environmentCredentialRefSchema.nullable().optional(),
  desired: environmentDesiredSchema.optional(),
});
export type EnvironmentUpdatePatch = z.infer<typeof environmentUpdatePatchSchema>;

export interface EnvironmentUpdateInput {
  readonly environmentId: string;
  readonly expectedRevision: number;
  readonly patch: EnvironmentUpdatePatch;
}

export interface EnvironmentCasInput {
  readonly environmentId: string;
  readonly expectedRevision: number;
}

export interface RecordChildIdentityInput extends EnvironmentCasInput {
  readonly desktopId: string;
  /**
   * Only an explicit manage-authorized operator re-establishment may pass true.
   * A verified connect that observes a different child desktopId must fail
   * closed with {@link EnvironmentChildIdentityChangedError}.
   */
  readonly acceptChangedIdentity?: boolean;
}

export interface RecordObservedTrustInput extends EnvironmentCasInput {
  readonly observedFingerprint: string;
  /** Set only by an explicit manage re-trust after a TOFU change. */
  readonly acceptChangedFingerprint?: boolean;
}

export interface PinTrustInput extends EnvironmentCasInput {
  readonly hostKeyFingerprint: string;
  readonly observedFingerprint?: string;
}

export interface SetRuntimeInput extends EnvironmentCasInput {
  readonly runtime: EnvironmentRuntime;
}

export interface AdoptLegacyConnectionInput extends EnvironmentCasInput {
  readonly legacyConnectionId: EnvironmentLegacyConnectionId;
}

const casInputSchema = z.strictObject({
  environmentId: z.uuid(),
  expectedRevision: z.number().int().min(1),
});

const recordChildIdentityInputSchema = casInputSchema.extend({
  desktopId: environmentChildDesktopIdSchema,
  acceptChangedIdentity: z.boolean().optional(),
});

const recordObservedTrustInputSchema = casInputSchema.extend({
  observedFingerprint: environmentHostKeyFingerprintSchema,
  acceptChangedFingerprint: z.boolean().optional(),
});

const pinTrustInputSchema = casInputSchema.extend({
  hostKeyFingerprint: environmentHostKeyFingerprintSchema,
  observedFingerprint: environmentHostKeyFingerprintSchema.optional(),
});

const setRuntimeInputSchema = casInputSchema.extend({
  runtime: environmentRuntimeSchema,
});

const adoptLegacyConnectionInputSchema = casInputSchema.extend({
  legacyConnectionId: environmentLegacyConnectionIdSchema,
});

export const environmentUpdateInputSchema = casInputSchema.extend({
  patch: environmentUpdatePatchSchema,
});

/** In-process single-writer guard, keyed by the canonical store path. */
const openEnvironmentStorePaths = new Set<string>();

/**
 * Admission bound for serialized mutations. The queue is deliberately small
 * (a burst above this is not normal configuration traffic): an over-limit
 * mutation refuses with {@link EnvironmentStoreBusyError} so the caller can
 * retry after admitted operations settle, instead of retaining unbounded
 * callbacks behind stalled storage.
 */
export const ENVIRONMENT_STORE_MAX_PENDING_MUTATIONS = 64;

function sameTrust(left: EnvironmentTrust, right: EnvironmentTrust): boolean {
  if (left.state !== right.state) return false;
  if (left.state === "pinned" && right.state === "pinned") {
    return (
      left.hostKeyFingerprint === right.hostKeyFingerprint &&
      left.observedFingerprint === right.observedFingerprint
    );
  }
  if (left.state === "observed" && right.state === "observed") {
    return left.observedFingerprint === right.observedFingerprint;
  }
  return true;
}

function sameConfiguration(left: EnvironmentRecord, right: EnvironmentRecord): boolean {
  return (
    left.label === right.label &&
    left.target === right.target &&
    left.port === right.port &&
    left.credentialRef === right.credentialRef &&
    sameTrust(left.trust, right.trust) &&
    left.runtime.hash === right.runtime.hash &&
    left.runtime.appVersion === right.runtime.appVersion &&
    left.childIdentity?.desktopId === right.childIdentity?.desktopId &&
    left.legacyConnectionIds.length === right.legacyConnectionIds.length &&
    left.legacyConnectionIds.every((id, index) => id === right.legacyConnectionIds[index]) &&
    left.desired === right.desired
  );
}

/**
 * Durable, CAS-revisioned environment records for one leased host data root.
 *
 * - One writer per composition: a second {@link EnvironmentStore.open} for the
 *   same root refuses in-process; cross-process exclusion is the host lease.
 * - Mutations are serialized through one promise queue and awaited: every
 *   write is a complete async atomic file replacement (atomic visibility, not
 *   a power-loss fsync claim), and the in-memory generation is published only
 *   after that write resolves. A failed write therefore leaves the previous
 *   valid generation in memory and on disk.
 * - Admission is bounded: at most
 *   {@link ENVIRONMENT_STORE_MAX_PENDING_MUTATIONS} mutations may be pending;
 *   beyond that the store refuses with a typed busy error instead of growing
 *   an unbounded queue, and reads refuse over-size files without allocating.
 * - Reads are redacted through {@link EnvironmentProjection}; the store never
 *   returns raw records to remote callers.
 * - `close()` rejects new mutations, joins every admitted one (including a
 *   write stalled on storage), and only then releases the in-process writer
 *   slot. It never releases the host lease.
 */
export class EnvironmentStore {
  private records: Map<string, EnvironmentRecord>;
  private pending: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private closing = false;
  private writerReleased = false;

  private constructor(
    private readonly options: EnvironmentStoreOptions,
    private readonly storePath: string,
    private readonly writerKey: string,
    records: readonly EnvironmentRecord[],
  ) {
    this.records = new Map(records.map((record) => [record.environmentId, record]));
  }

  static async open(options: EnvironmentStoreOptions): Promise<EnvironmentStore> {
    options.lease.assertActive(options.lease.generation);
    const storePath = environmentsFilePath(options.lease.paths.dataRoot);
    const writerKey = resolve(storePath);
    if (openEnvironmentStorePaths.has(writerKey)) {
      throw new EnvironmentStoreLockedError();
    }
    openEnvironmentStorePaths.add(writerKey);
    try {
      const text = await readEnvironmentStoreFileText(storePath);
      const records: readonly EnvironmentRecord[] =
        text === undefined ? [] : parseEnvironmentStoreFile(text);
      options.lease.assertActive(options.lease.generation);
      return new EnvironmentStore(options, storePath, writerKey, records);
    } catch (error) {
      openEnvironmentStorePaths.delete(writerKey);
      throw error;
    }
  }

  /**
   * The leased host data root. Host-internal (derived trust material, future
   * proxy paths); never part of a client projection.
   */
  get dataRoot(): string {
    return this.options.lease.paths.dataRoot;
  }

  /** Host-internal records (contain private references); never serialize to clients. */
  listRecords(): readonly EnvironmentRecord[] {
    this.assertReadable();
    return Object.freeze(this.sortedRecords().map((record) => structuredClone(record)));
  }

  getRecord(environmentId: string): EnvironmentRecord | undefined {
    this.assertReadable();
    const record = this.records.get(environmentId);
    return record === undefined ? undefined : structuredClone(record);
  }

  listPublic(): readonly EnvironmentProjection[] {
    this.assertReadable();
    return environmentProjections(this.sortedRecords());
  }

  getPublic(environmentId: string): EnvironmentProjection | undefined {
    this.assertReadable();
    const record = this.records.get(environmentId);
    return record === undefined ? undefined : environmentProjection(record);
  }

  async create(input: EnvironmentCreateInput): Promise<EnvironmentRecord> {
    const parsed = environmentCreateInputSchema.parse(input);
    return this.enqueue(() => {
      if (this.records.size >= ENVIRONMENT_STORE_MAX_ENVIRONMENTS) {
        throw new EnvironmentStoreLimitError(
          "environment-count",
          ENVIRONMENT_STORE_MAX_ENVIRONMENTS,
        );
      }
      if (parsed.legacyConnectionId !== undefined) {
        this.assertLegacyConnectionAdoptable(parsed.legacyConnectionId, undefined);
      }
      const environmentId = this.mintUniqueId(parsed.legacyConnectionId);
      const now = this.now();
      const record = environmentRecordSchema.parse({
        environmentId,
        revision: 1,
        label: parsed.label,
        target: parsed.target,
        ...(parsed.port === undefined ? {} : { port: parsed.port }),
        ...(parsed.credentialRef === undefined ? {} : { credentialRef: parsed.credentialRef }),
        trust: parsed.trust ?? { state: "unknown" },
        runtime: parsed.runtime,
        legacyConnectionIds:
          parsed.legacyConnectionId === undefined ? [] : [parsed.legacyConnectionId],
        desired: parsed.desired ?? "enabled",
        createdAt: now,
        updatedAt: now,
      });
      return this.commit(record);
    });
  }

  async update(input: EnvironmentUpdateInput): Promise<EnvironmentRecord> {
    const parsed = environmentUpdateInputSchema.parse(input);
    const patch = parsed.patch;
    return this.enqueue(() => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertRevision(current, parsed.expectedRevision);
      const { port: currentPort, credentialRef: currentCredentialRef, ...base } = current;
      const port =
        patch.port === undefined ? currentPort : patch.port === null ? undefined : patch.port;
      const credentialRef =
        patch.credentialRef === undefined
          ? currentCredentialRef
          : patch.credentialRef === null
            ? undefined
            : patch.credentialRef;
      const next = environmentRecordSchema.parse({
        ...base,
        label: patch.label ?? current.label,
        target: patch.target ?? current.target,
        ...(port === undefined ? {} : { port }),
        ...(credentialRef === undefined ? {} : { credentialRef }),
        desired: patch.desired ?? current.desired,
        revision: nextEnvironmentRevision(current.revision),
        updatedAt: this.now(),
      });
      if (sameConfiguration(current, next)) return structuredClone(current);
      return this.commit(next);
    });
  }

  async setRuntime(input: SetRuntimeInput): Promise<EnvironmentRecord> {
    const parsed = setRuntimeInputSchema.parse(input);
    return this.enqueue(() => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertRevision(current, parsed.expectedRevision);
      if (
        current.runtime.hash === parsed.runtime.hash &&
        current.runtime.appVersion === parsed.runtime.appVersion
      ) {
        return structuredClone(current);
      }
      return this.commit(this.revisedRecord(current, { runtime: parsed.runtime }));
    });
  }

  /**
   * Record the child desktopId after a verified connect. The first recording
   * wins; a later verified identity that differs fails closed unless the
   * caller passes `acceptChangedIdentity` (manage-authorized re-establishment).
   */
  async recordChildIdentity(input: RecordChildIdentityInput): Promise<EnvironmentRecord> {
    const parsed = recordChildIdentityInputSchema.parse(input);
    return this.enqueue(() => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertRevision(current, parsed.expectedRevision);
      const recorded = current.childIdentity?.desktopId;
      if (recorded === parsed.desktopId) return structuredClone(current);
      if (recorded !== undefined && parsed.acceptChangedIdentity !== true) {
        throw new EnvironmentChildIdentityChangedError(
          parsed.environmentId,
          recorded,
          parsed.desktopId,
        );
      }
      return this.commit(
        this.revisedRecord(current, { childIdentity: { desktopId: parsed.desktopId } }),
      );
    });
  }

  /**
   * Record the fingerprint observed on a verified connect. A change from the
   * recorded observation needs an explicit manage re-trust; a fingerprint that
   * contradicts a pin is refused outright.
   */
  async recordObservedTrust(input: RecordObservedTrustInput): Promise<EnvironmentRecord> {
    const parsed = recordObservedTrustInputSchema.parse(input);
    return this.enqueue(() => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertRevision(current, parsed.expectedRevision);
      const trust = current.trust;
      if (trust.state === "pinned" && trust.hostKeyFingerprint === parsed.observedFingerprint) {
        return structuredClone(current);
      }
      if (trust.state === "pinned") {
        throw new EnvironmentTrustMismatchError(parsed.environmentId);
      }
      if (trust.state === "observed") {
        if (trust.observedFingerprint === parsed.observedFingerprint) {
          return structuredClone(current);
        }
        if (parsed.acceptChangedFingerprint !== true) {
          throw new EnvironmentTrustChangedError(parsed.environmentId);
        }
      }
      return this.commit(
        this.revisedRecord(current, {
          trust: { state: "observed", observedFingerprint: parsed.observedFingerprint },
        }),
      );
    });
  }

  /** Explicit manage action: accept (or re-accept) a host-key pin. */
  async pinTrust(input: PinTrustInput): Promise<EnvironmentRecord> {
    const parsed = pinTrustInputSchema.parse(input);
    return this.enqueue(() => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertRevision(current, parsed.expectedRevision);
      const trust: EnvironmentTrust = {
        state: "pinned",
        hostKeyFingerprint: parsed.hostKeyFingerprint,
        ...(parsed.observedFingerprint === undefined
          ? {}
          : { observedFingerprint: parsed.observedFingerprint }),
      };
      if (sameTrust(current.trust, trust)) return structuredClone(current);
      return this.commit(this.revisedRecord(current, { trust }));
    });
  }

  /** Explicit manage action: drop a pin or observation back to `unknown`. */
  async clearTrust(input: EnvironmentCasInput): Promise<EnvironmentRecord> {
    const parsed = casInputSchema.parse(input);
    return this.enqueue(() => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertRevision(current, parsed.expectedRevision);
      if (current.trust.state === "unknown") return structuredClone(current);
      return this.commit(this.revisedRecord(current, { trust: { state: "unknown" } }));
    });
  }

  /**
   * Explicit, per-environment legacy adoption. An environment adopts at most
   * one legacy connection id, and no two environments may adopt the same one;
   * the child data mapping is preserved by the future controller, never merged
   * by the store, and no device identity path is ever uploaded here.
   */
  async adoptLegacyConnection(input: AdoptLegacyConnectionInput): Promise<EnvironmentRecord> {
    const parsed = adoptLegacyConnectionInputSchema.parse(input);
    return this.enqueue(() => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertAdoptableRecord(current, parsed);
      if (current.legacyConnectionIds.includes(parsed.legacyConnectionId)) {
        return structuredClone(current);
      }
      return this.commit(
        this.revisedRecord(current, { legacyConnectionIds: [parsed.legacyConnectionId] }),
      );
    });
  }

  /**
   * Synchronous, side-effect-free admission check for an adoption. Route
   * callers use it to refuse an invalid legacy id *before* any live-custody
   * side effect (disconnect/abort); the enqueued mutation still re-runs it.
   */
  assertAdoptable(input: AdoptLegacyConnectionInput): void {
    const parsed = adoptLegacyConnectionInputSchema.parse(input);
    this.assertReadable();
    this.assertAdoptableRecord(this.requireRecord(parsed.environmentId), parsed);
  }

  async delete(input: EnvironmentCasInput): Promise<void> {
    const parsed = casInputSchema.parse(input);
    return this.enqueue(async () => {
      const current = this.requireRecord(parsed.environmentId);
      this.assertRevision(current, parsed.expectedRevision);
      const records = new Map(this.records);
      records.delete(parsed.environmentId);
      await this.persist(records);
      this.records = records;
    });
  }

  /**
   * End admission of new mutations, join every admitted mutation, then release
   * the in-process writer slot. The host lease is not released here.
   */
  async close(): Promise<void> {
    this.closing = true;
    await this.pending;
    if (!this.writerReleased) {
      this.writerReleased = true;
      openEnvironmentStorePaths.delete(this.writerKey);
    }
  }

  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new EnvironmentStoreClosedError());
    try {
      this.assertLease();
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.pendingCount >= ENVIRONMENT_STORE_MAX_PENDING_MUTATIONS) {
      return Promise.reject(new EnvironmentStoreBusyError(ENVIRONMENT_STORE_MAX_PENDING_MUTATIONS));
    }
    this.pendingCount += 1;
    const run = this.pending.then(async () => {
      this.assertLease();
      return await operation();
    });
    const settle = (): void => {
      this.pendingCount -= 1;
    };
    this.pending = run.then(settle, settle);
    return run;
  }

  /**
   * Persist the complete next generation, then publish it in memory. The
   * await is the commit point: a rejected write publishes nothing, so callers
   * and readers keep observing the previous valid generation.
   */
  private async commit(next: EnvironmentRecord): Promise<EnvironmentRecord> {
    const records = new Map(this.records);
    records.set(next.environmentId, next);
    await this.persist(records);
    this.records = records;
    return structuredClone(next);
  }

  private revisedRecord(
    current: EnvironmentRecord,
    changes: Partial<EnvironmentRecord>,
  ): EnvironmentRecord {
    return environmentRecordSchema.parse({
      ...current,
      ...changes,
      revision: nextEnvironmentRevision(current.revision),
      updatedAt: this.now(),
    });
  }

  private async persist(records: ReadonlyMap<string, EnvironmentRecord>): Promise<void> {
    this.assertLease();
    await writeFileAtomicAsync(
      this.storePath,
      serializeEnvironmentStoreFile([...records.values()]),
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
  }

  private requireRecord(environmentId: string): EnvironmentRecord {
    const record = this.records.get(environmentId);
    if (record === undefined) throw new EnvironmentNotFoundError(environmentId);
    return record;
  }

  private assertRevision(record: EnvironmentRecord, expectedRevision: number): void {
    if (record.revision !== expectedRevision) {
      throw new EnvironmentRevisionConflictError(
        record.environmentId,
        expectedRevision,
        record.revision,
      );
    }
  }

  /**
   * The two id namespaces are globally disjoint: a legacy connection id may
   * equal neither any record's `environmentId` (including this environment's
   * own) nor another environment's adopted legacy id. Without the first check,
   * two environments would dial the same remote connection id and a real
   * manager would replace one tunnel with the other's.
   */
  private assertAdoptableRecord(
    current: EnvironmentRecord,
    parsed: z.infer<typeof adoptLegacyConnectionInputSchema>,
  ): void {
    this.assertRevision(current, parsed.expectedRevision);
    if (current.legacyConnectionIds.includes(parsed.legacyConnectionId)) return;
    if (current.legacyConnectionIds.length > 0) {
      throw new EnvironmentLegacyConnectionConflictError(
        parsed.legacyConnectionId,
        "already-adopted",
      );
    }
    this.assertLegacyConnectionAdoptable(parsed.legacyConnectionId, parsed.environmentId);
  }

  private assertLegacyConnectionAdoptable(
    legacyConnectionId: string,
    ownEnvironmentId: string | undefined,
  ): void {
    for (const record of this.records.values()) {
      if (record.environmentId === legacyConnectionId) {
        throw new EnvironmentLegacyConnectionConflictError(
          legacyConnectionId,
          "collides-with-environment-id",
        );
      }
      if (record.environmentId === ownEnvironmentId) continue;
      if (record.legacyConnectionIds.includes(legacyConnectionId)) {
        throw new EnvironmentLegacyConnectionConflictError(
          legacyConnectionId,
          "adopted-by-another",
        );
      }
    }
  }

  /** Every legacy mapping this store has adopted, across all records. */
  private adoptedLegacyConnectionIds(): Set<string> {
    const ids = new Set<string>();
    for (const record of this.records.values()) {
      for (const legacyConnectionId of record.legacyConnectionIds) ids.add(legacyConnectionId);
    }
    return ids;
  }

  /**
   * Mint an environment id that collides with no environment id, no adopted
   * legacy mapping, and (for a create that adopts one) not with the legacy id
   * it is about to adopt.
   */
  private mintUniqueId(avoidLegacyConnectionId?: string): string {
    const adopted = this.adoptedLegacyConnectionIds();
    const collides = (candidate: string): boolean =>
      this.records.has(candidate) ||
      adopted.has(candidate) ||
      candidate === avoidLegacyConnectionId;
    let candidate = mintEnvironmentId(this.options.mintEnvironmentId);
    for (let attempt = 0; attempt < 8 && collides(candidate); attempt += 1) {
      candidate = mintEnvironmentId(this.options.mintEnvironmentId);
    }
    if (collides(candidate)) {
      throw new EnvironmentIdentifierCollisionError(candidate);
    }
    return candidate;
  }

  private sortedRecords(): EnvironmentRecord[] {
    return [...this.records.values()].sort((left, right) =>
      left.environmentId < right.environmentId
        ? -1
        : left.environmentId > right.environmentId
          ? 1
          : 0,
    );
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private assertLease(): void {
    this.options.lease.assertActive(this.options.lease.generation);
  }

  private assertReadable(): void {
    if (this.closing) throw new EnvironmentStoreClosedError();
    this.assertLease();
  }
}
