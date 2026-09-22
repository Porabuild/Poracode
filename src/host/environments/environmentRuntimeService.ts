import { z } from "zod";
import {
  environmentCredentialRefSchema,
  environmentDesiredSchema,
  environmentHostKeyFingerprintSchema,
  environmentIdSchema,
  environmentLabelSchema,
  environmentLegacyConnectionIdSchema,
  environmentPortSchema,
  environmentProxyPrefix,
  environmentTargetSchema,
  type EnvironmentPublicProjection,
  type EnvironmentRecord,
  type EnvironmentRuntime,
} from "@/shared/environments";
import type { RemoteEnvironmentDescriptor } from "@/shared/remote/protocol";
import {
  sshConnectionConfigSchema,
  type SshConnectPayload,
  type SshConnectResult,
  type SshConnectionConfig,
} from "@/shared/ssh";
import { SSH_TUNNEL_READY_TIMEOUT_MS, waitForRemoteEndpoint } from "@/shared/sshBootstrap";
import type { SshConnectOptions } from "@/host/ssh/sshEnvironmentController";
import {
  EnvironmentStore,
  environmentUpdateInputSchema,
  type EnvironmentUpdateInput,
  type EnvironmentUpdatePatch,
} from "./EnvironmentStore";
import { environmentProjection } from "./environmentProjection";
import {
  EnvironmentOperationCoordinator,
  type EnvironmentOperationContext,
} from "./environmentOperationCoordinator";
import {
  createOpenSshCredentialResolver,
  type EnvironmentCredentialResolver,
} from "./environmentCredentialCustody";
import type { EnvironmentTrustAuthority } from "./environmentTrustAuthority";
import {
  EnvironmentTrustPreparation,
  type EnvironmentTrustContext,
} from "./environmentTrustPreparation";
import { EnvironmentStartupReconnects } from "./environmentStartupReconnects";
import {
  EnvironmentObservedState,
  isEnvironmentCancellation,
  type EnvironmentVerifiedTarget,
  type VerifiedTargetState,
} from "./environmentObservedState";
import {
  pinTrust,
  recordChildIdentity,
  recordObservedTrust,
  setRuntime,
} from "./environmentRuntimeWrites";
import {
  ENVIRONMENT_UPGRADE_UNAVAILABLE_DETAIL,
  EnvironmentRuntimeError,
  environmentAbortError,
  environmentRuntimeError,
} from "./environmentRuntimeErrors";

/**
 * Host-owned environment lifecycle service (ADR §8, C1 runtime slice).
 *
 * It sits on the durable CAS store and the existing SSH manager/controller and
 * owns observed runtime state only: desired-enabled startup reconnect, trust
 * confirmation before any install/exec, authenticated connect/pairing,
 * explicit owner-authorized upgrade, and verified child targets for the future
 * parent proxy. Nothing here is wired into a composition or route yet; the
 * capability must not be advertised until that lane lands.
 *
 * Trust preparation, the startup/retry schedule, the observed-state/custody
 * owner, and the runtime-owned CAS writes live in their own modules; this
 * service keeps the public lifecycle and the SSH command flow.
 */

/** The SSH verbs the service consumes (SshConnectionManager satisfies this). */
export interface EnvironmentSshTransport {
  connect(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult>;
  upgrade?(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult>;
  disconnect(connectionId: string): Promise<void>;
  onTunnelExit?(listener: (connectionId: string) => void): () => void;
}

export type EnvironmentDescriptorReader = (
  endpoint: string,
  signal: AbortSignal,
) => Promise<RemoteEnvironmentDescriptor>;

export interface EnvironmentStartupOptions {
  /** Maximum simultaneous desired-enabled reconnects (default 2). */
  readonly concurrency?: number;
  /** Bounded retry attempts per environment reconnect episode (default 5). */
  readonly maxAttempts?: number;
  readonly backoffBaseMs?: number;
  readonly backoffMaxMs?: number;
  /** Test seam; defaults to a timer bounded by the service lifecycle. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface EnvironmentRuntimeServiceOptions {
  readonly store: EnvironmentStore;
  readonly ssh: EnvironmentSshTransport;
  readonly trust: EnvironmentTrustAuthority;
  /**
   * The host's installed runtime. The service never accepts a client-supplied
   * URL or hash; every provisioned/upgraded runtime comes from here.
   */
  readonly runtimeProvider: () => Promise<EnvironmentRuntime>;
  readonly credentials?: EnvironmentCredentialResolver;
  readonly descriptorReader?: EnvironmentDescriptorReader;
  readonly fetchImpl?: typeof fetch;
  readonly startup?: EnvironmentStartupOptions;
}

const environmentServiceCreateInputSchema = z.strictObject({
  label: environmentLabelSchema,
  target: environmentTargetSchema,
  port: environmentPortSchema.optional(),
  credentialRef: environmentCredentialRefSchema.optional(),
  desired: environmentDesiredSchema.optional(),
  legacyConnectionId: environmentLegacyConnectionIdSchema.optional(),
});
export type EnvironmentServiceCreateInput = z.infer<typeof environmentServiceCreateInputSchema>;

const environmentServiceDeleteInputSchema = z.strictObject({
  environmentId: environmentIdSchema,
  expectedRevision: z.number().int().min(1),
});

const environmentServiceAdoptLegacyInputSchema = z.strictObject({
  environmentId: environmentIdSchema,
  expectedRevision: z.number().int().min(1),
  legacyConnectionId: environmentLegacyConnectionIdSchema,
});

const environmentServiceAcceptTrustInputSchema = z.strictObject({
  environmentId: environmentIdSchema,
  expectedRevision: z.number().int().min(1),
  fingerprint: environmentHostKeyFingerprintSchema,
});

const environmentServiceUpgradeInputSchema = z.strictObject({
  environmentId: environmentIdSchema,
  expectedRevision: z.number().int().min(1).optional(),
  signal: z.instanceof(AbortSignal).optional(),
});

export interface EnvironmentServiceAcceptTrustInput {
  readonly environmentId: string;
  readonly expectedRevision: number;
  readonly fingerprint: string;
}

export interface EnvironmentServiceUpgradeInput {
  readonly environmentId: string;
  readonly expectedRevision?: number;
  readonly signal?: AbortSignal;
}

export interface EnvironmentPairingResult {
  readonly environmentId: string;
  /** Parent proxy prefix; a loopback tunnel URL/port is never exposed. */
  readonly endpoint: string;
  readonly pairingCredential: string;
  readonly childDesktopId: string;
}

/**
 * `EnvironmentVerifiedTarget` moved to `environmentObservedState.ts` with the
 * state it fences on; re-exported here because it is part of this service's
 * existing public surface.
 */
export type { EnvironmentVerifiedTarget };

const DEFAULT_STARTUP: Required<Omit<EnvironmentStartupOptions, "sleep">> = {
  concurrency: 2,
  maxAttempts: 5,
  backoffBaseMs: 1_000,
  backoffMaxMs: 30_000,
};

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(environmentAbortError(signal.reason));
  void promise.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(environmentAbortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export class EnvironmentRuntimeService {
  private readonly store: EnvironmentStore;
  private readonly ssh: EnvironmentSshTransport;
  private readonly trust: EnvironmentTrustAuthority;
  private readonly credentials: EnvironmentCredentialResolver;
  private readonly runtimeProvider: () => Promise<EnvironmentRuntime>;
  private readonly descriptorReader: EnvironmentDescriptorReader;
  private readonly startupOptions: Required<Omit<EnvironmentStartupOptions, "sleep">>;
  private readonly operations = new EnvironmentOperationCoordinator();
  private readonly observed: EnvironmentObservedState;
  private readonly lifecycle = new AbortController();
  private readonly trustPreparation: EnvironmentTrustPreparation;
  private readonly reconnects: EnvironmentStartupReconnects;
  private readonly detachTunnelExit: (() => void) | null;
  private pairingCounter = 0;
  private started = false;
  private disposed = false;
  private disposeStarted: Promise<void> | null = null;

  constructor(options: EnvironmentRuntimeServiceOptions) {
    this.store = options.store;
    this.ssh = options.ssh;
    this.trust = options.trust;
    this.credentials = options.credentials ?? createOpenSshCredentialResolver();
    this.runtimeProvider = options.runtimeProvider;
    this.descriptorReader = options.descriptorReader ?? this.defaultDescriptorReader(options);
    this.observed = new EnvironmentObservedState(this.store);
    this.startupOptions = {
      concurrency: options.startup?.concurrency ?? DEFAULT_STARTUP.concurrency,
      maxAttempts: options.startup?.maxAttempts ?? DEFAULT_STARTUP.maxAttempts,
      backoffBaseMs: options.startup?.backoffBaseMs ?? DEFAULT_STARTUP.backoffBaseMs,
      backoffMaxMs: options.startup?.backoffMaxMs ?? DEFAULT_STARTUP.backoffMaxMs,
    };
    this.trustPreparation = new EnvironmentTrustPreparation({
      store: this.store,
      trust: this.trust,
      recordObservedTrust: (environmentId, observedFingerprint) =>
        recordObservedTrust(this.store, environmentId, observedFingerprint),
      pinTrust: (environmentId, expectedRevision, fingerprint) =>
        pinTrust(this.store, environmentId, expectedRevision, fingerprint),
    });
    this.reconnects = new EnvironmentStartupReconnects({
      signal: this.lifecycle.signal,
      options: {
        concurrency: this.startupOptions.concurrency,
        maxAttempts: this.startupOptions.maxAttempts,
        backoffBaseMs: this.startupOptions.backoffBaseMs,
        backoffMaxMs: this.startupOptions.backoffMaxMs,
        ...(options.startup?.sleep === undefined ? {} : { sleep: options.startup.sleep }),
      },
      runAttempt: async (environmentId) => {
        // A mutation that is currently admitted is the one cancelling (or
        // reconfiguring) this loop. Never queue a retry behind it: the
        // mutation's work may join this loop, and a queued attempt would wait
        // on the mutation in turn. The loop backs off and retries once the
        // mutation settled (or exits when its signal was aborted).
        const current = this.operations.current(environmentId);
        if (current !== undefined && current.kind === "mutation") {
          throw new EnvironmentRuntimeError("environment/cancelled");
        }
        await this.connectHostOwned(environmentId);
      },
    });
    const detach = this.ssh.onTunnelExit?.((connectionId) =>
      this.observed.handleTunnelExit(connectionId),
    );
    this.detachTunnelExit = detach ?? null;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  listPublic(): readonly EnvironmentPublicProjection[] {
    return Object.freeze(
      this.store.listPublic().map((projection) => this.observed.overlay(projection)),
    );
  }

  getPublic(environmentId: string): EnvironmentPublicProjection | undefined {
    const projection = this.store.getPublic(environmentId);
    return projection === undefined ? undefined : this.observed.overlay(projection);
  }

  // -------------------------------------------------------------------------
  // Durable mutations (CAS + serialized operation generations)
  // -------------------------------------------------------------------------

  async create(input: EnvironmentServiceCreateInput): Promise<EnvironmentPublicProjection> {
    const parsed = environmentServiceCreateInputSchema.parse(input);
    return this.bounded(async () => {
      this.assertNotDisposed();
      // The runtime selection is resolved by the host, never supplied by a client.
      const runtime = await this.runtimeProvider();
      const record = await this.storeMutation(() => this.store.create({ ...parsed, runtime }));
      this.observed.transition(record.environmentId, { state: "disconnected" });
      // The admitted write is the commit point: once it resolved, the durable
      // record exists and the caller must receive the committed projection.
      // `create` is deliberately not coordinator work, so a disposal that
      // closes the store while this call is between its write and its
      // post-read must not turn a committed create into `store-unavailable`
      // (F-1). Build the projection from the committed record instead of
      // re-reading a store that may already be closing for reads.
      return this.observed.overlay(environmentProjection(record));
    });
  }

  async update(input: EnvironmentUpdateInput): Promise<EnvironmentPublicProjection> {
    const parsed = environmentUpdateInputSchema.parse(input);
    const environmentId = parsed.environmentId;
    return this.bounded(() =>
      this.operations.runExclusive(
        environmentId,
        environmentAbortError("The environment configuration changed."),
        async () => {
          const before = this.requireRecord(environmentId);
          // Authoritative re-validation inside the serialized work: the
          // validate hook below races with nothing, but this stays the source
          // of truth against the small validate→abort window.
          this.assertRevision(before, parsed.expectedRevision);
          const patch: EnvironmentUpdatePatch = parsed.patch;
          const connectionRelevant =
            patch.target !== undefined ||
            patch.port !== undefined ||
            patch.credentialRef !== undefined;
          const disabling = patch.desired === "disabled" && before.desired !== "disabled";
          const enabling = patch.desired === "enabled" && before.desired === "disabled";
          if (disabling) {
            // A disabled environment must not keep a host retry owner alive.
            await this.reconnects.cancel(environmentId);
          }
          if (connectionRelevant || disabling) {
            this.observed.invalidateTarget(environmentId, "The environment configuration changed.");
            try {
              await this.ssh.disconnect(connectionIdFor(before));
            } catch (error) {
              // Custody is retained: the record is unchanged and the join can
              // be retried. The observed state must not claim disconnected.
              const runtimeError = environmentRuntimeError(error);
              this.observed.fail(environmentId, runtimeError);
              throw runtimeError;
            }
            this.observed.releaseIfOwned(connectionIdFor(before), environmentId);
            this.observed.transition(environmentId, { state: "disconnected" });
          }
          let record: EnvironmentRecord;
          try {
            record = await this.storeMutation(() => this.store.update(parsed));
          } catch (error) {
            // The live tunnel was already stopped, so the observed truth is
            // disconnected even though the durable patch did not apply.
            if (connectionRelevant || disabling) {
              this.observed.transition(environmentId, { state: "disconnected" });
            }
            throw environmentRuntimeError(error);
          }
          if (record.desired === "disabled") {
            this.observed.transition(environmentId, { state: "disconnected" });
          } else if (connectionRelevant || enabling) {
            this.reconnects.schedule(environmentId);
          }
          return this.observed.requirePublic(environmentId);
        },
        () => this.assertRevision(this.requireRecord(environmentId), parsed.expectedRevision),
      ),
    );
  }

  async delete(input: {
    readonly environmentId: string;
    readonly expectedRevision: number;
  }): Promise<void> {
    const parsed = environmentServiceDeleteInputSchema.parse(input);
    const environmentId = parsed.environmentId;
    await this.bounded(() =>
      this.operations.runExclusive(
        environmentId,
        environmentAbortError("The environment was deleted."),
        async () => {
          const record = this.requireRecord(environmentId);
          this.assertRevision(record, parsed.expectedRevision);
          await this.reconnects.cancel(environmentId);
          this.observed.invalidateTarget(environmentId, "The environment was deleted.");
          try {
            await this.ssh.disconnect(connectionIdFor(record));
          } catch (error) {
            // A delete that could not join its process keeps the record and the
            // connection custody so the caller (or dispose) can retry.
            const runtimeError = environmentRuntimeError(error);
            this.observed.fail(environmentId, runtimeError);
            throw runtimeError;
          }
          await this.storeMutation(() => this.store.delete(parsed));
          this.observed.forget(environmentId);
          this.observed.releaseIfOwned(connectionIdFor(record), environmentId);
          await this.trustPreparation.removeKnownHosts(environmentId);
        },
        () => this.assertRevision(this.requireRecord(environmentId), parsed.expectedRevision),
      ),
    );
  }

  /**
   * Explicit per-environment legacy adoption. The store refuses a second
   * adopted id, any id already owned by another environment, and any id that
   * collides with an environment id, so two legacy child data mappings are
   * never merged; the remote connection id becomes the adopted legacy id
   * (preserving the child's data dir), otherwise the stable host-minted
   * environment id is used.
   */
  async adoptLegacy(input: {
    readonly environmentId: string;
    readonly expectedRevision: number;
    readonly legacyConnectionId: string;
  }): Promise<EnvironmentPublicProjection> {
    const parsed = environmentServiceAdoptLegacyInputSchema.parse(input);
    const environmentId = parsed.environmentId;
    return this.bounded(() =>
      this.operations.runExclusive(
        environmentId,
        environmentAbortError("The environment adopted a legacy connection."),
        async () => {
          const before = this.requireRecord(environmentId);
          this.assertRevision(before, parsed.expectedRevision);
          await this.reconnects.cancel(environmentId);
          this.observed.invalidateTarget(
            environmentId,
            "The environment adopted a legacy connection.",
          );
          try {
            await this.ssh.disconnect(connectionIdFor(before));
          } catch (error) {
            const runtimeError = environmentRuntimeError(error);
            this.observed.fail(environmentId, runtimeError);
            throw runtimeError;
          }
          this.observed.releaseIfOwned(connectionIdFor(before), environmentId);
          const record = await this.storeMutation(() =>
            this.store.adoptLegacyConnection({
              environmentId,
              expectedRevision: parsed.expectedRevision,
              legacyConnectionId: parsed.legacyConnectionId,
            }),
          );
          this.observed.transition(environmentId, { state: "disconnected" });
          if (record.desired === "enabled") this.reconnects.schedule(environmentId);
          return this.observed.requirePublic(environmentId);
        },
        // Refuse an invalid legacy id (revision, adopted mapping, or
        // environment-id collision) before the disconnect/abort side effects.
        () => this.store.assertAdoptable(parsed),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Trust: probe/confirm separate from authenticated provision/connect
  // -------------------------------------------------------------------------

  /**
   * Unauthenticated host-key probe. Performs no install, no exec, and no store
   * write; the returned fingerprint is what an operator may explicitly accept.
   */
  async probeTrust(
    environmentId: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly fingerprint: string;
    readonly keyType: string;
    readonly host: string;
    readonly port: number;
    readonly lookupName: string;
  }> {
    const id = environmentIdSchema.parse(environmentId);
    return this.bounded(async () => {
      this.assertNotDisposed();
      const record = this.requireRecord(id);
      return this.trustPreparation.probe(record, signal);
    });
  }

  /**
   * Manage-authorized acceptance of an observed fingerprint. Any valid key the
   * probe just offered may be accepted (not only the preferred one); exactly
   * that key's material is written to the per-environment known-hosts file and
   * recorded as the pin.
   */
  async acceptTrust(
    input: EnvironmentServiceAcceptTrustInput,
    signal?: AbortSignal,
  ): Promise<EnvironmentPublicProjection> {
    const parsed = environmentServiceAcceptTrustInputSchema.parse(input);
    const environmentId = parsed.environmentId;
    return this.bounded(() =>
      this.operations.runExclusive(
        environmentId,
        environmentAbortError("The environment trust was re-accepted."),
        async () => {
          const record = this.requireRecord(environmentId);
          this.assertRevision(record, parsed.expectedRevision);
          const { resolved, accepted } = await this.trustPreparation.probeAccepted(
            record,
            parsed.fingerprint,
            signal,
          );
          await this.reconnects.cancel(environmentId);
          this.observed.invalidateTarget(environmentId, "The environment trust was re-accepted.");
          try {
            await this.ssh.disconnect(connectionIdFor(record));
          } catch (error) {
            const runtimeError = environmentRuntimeError(error);
            this.observed.fail(environmentId, runtimeError);
            throw runtimeError;
          }
          this.observed.releaseIfOwned(connectionIdFor(record), environmentId);
          await this.trustPreparation.commitAccepted(
            record,
            parsed.expectedRevision,
            resolved,
            accepted,
          );
          this.observed.transition(environmentId, { state: "disconnected" });
          return this.observed.requirePublic(environmentId);
        },
        () => this.assertRevision(this.requireRecord(environmentId), parsed.expectedRevision),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Connect / pairing / disconnect
  // -------------------------------------------------------------------------

  /**
   * Host-owned connect. A caller abort detaches only that caller: the
   * host-owned attempt continues and publishes its verified target, because
   * closing a client changes neither `desired` nor the environment state
   * (ADR §2/§8). Cancellation of host work belongs to update/disconnect/delete
   * (through the operation coordinator) and to `dispose`.
   */
  async connect(
    environmentId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<EnvironmentPublicProjection> {
    const id = environmentIdSchema.parse(environmentId);
    const result = await this.bounded(() => this.runConnect(id, options.signal));
    return result.projection;
  }

  /**
   * Mint a one-time child pairing credential. The environment is connected and
   * its child desktopId is verified first; the credential is re-verified
   * against the actual pairing connection (descriptor, child identity,
   * generation) before it is returned, and is never written to the durable
   * store or runtime state.
   */
  async pairing(
    environmentId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<EnvironmentPairingResult> {
    const id = environmentIdSchema.parse(environmentId);
    // Identity is pinned by a verified connect before any pairing credential
    // exists. A detached caller must not receive a credential.
    await this.connect(id, options);
    if (options.signal?.aborted) throw environmentAbortError(options.signal.reason);
    return this.bounded(() =>
      this.operations.run(
        id,
        {
          kind: "pairing",
          // Never coalesce: each caller receives its own one-time credential.
          coalesceKey: `pairing:${id}:${++this.pairingCounter}`,
          ...(options.signal ? { signal: options.signal } : {}),
        },
        async (context) => {
          const target = this.observed.getVerifiedTarget(id);
          const record = this.requireRecord(id);
          const identityFile = await this.resolveCredential(record);
          const trustContext = await this.trustPreparation.prepare(record, context.signal);
          const connection = this.connectionFor(record, identityFile);
          // Fail before the exec if the captured target was already replaced.
          target.assertCurrent();
          const result = await this.ssh.connect(
            {
              connection,
              issuePairingCredential: true,
            },
            {
              knownHosts: this.trustPreparation.knownHostsPolicy(trustContext),
              signal: context.signal,
            },
          );
          if (result.pairingCredential === undefined) {
            throw new EnvironmentRuntimeError("environment/internal-error");
          }
          // Re-verify the actual pairing result and republish the verified
          // target: the credential must bind to the connection that minted it,
          // never to a target captured before the exec.
          await this.verifyConnectedTarget(id, connection, result, context.signal, false);
          const verified = this.observed.getVerifiedTarget(id);
          return {
            environmentId: id,
            endpoint: environmentProxyPrefix(id),
            pairingCredential: result.pairingCredential,
            childDesktopId: verified.childDesktopId,
          };
        },
      ),
    );
  }

  async disconnect(environmentId: string): Promise<EnvironmentPublicProjection> {
    const id = environmentIdSchema.parse(environmentId);
    return this.bounded(() =>
      this.operations.runExclusive(
        id,
        environmentAbortError("The environment was disconnected."),
        async () => {
          const record = this.requireRecord(id);
          await this.reconnects.cancel(id);
          this.observed.invalidateTarget(id, "The environment was disconnected.");
          try {
            await this.ssh.disconnect(connectionIdFor(record));
          } catch (error) {
            const runtimeError = environmentRuntimeError(error);
            this.observed.fail(id, runtimeError);
            throw runtimeError;
          }
          this.observed.releaseIfOwned(connectionIdFor(record), id);
          this.observed.transition(id, { state: "disconnected" });
          return this.observed.requirePublic(id);
        },
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Explicit owner-authorized upgrade
  // -------------------------------------------------------------------------

  /**
   * Stop-then-start replacement of the live owner with the host's installed
   * runtime. It never accepts a client-supplied hash, never runs on an ordinary
   * connect, and re-verifies the child identity before publishing a target or
   * updating the durable runtime selection. The old tunnel is joined before the
   * upgrade starts, so two owners can never overlap on one data root.
   */
  async upgrade(input: EnvironmentServiceUpgradeInput): Promise<EnvironmentPublicProjection> {
    const parsed = environmentServiceUpgradeInputSchema.parse(input);
    const environmentId = parsed.environmentId;
    const expectedRevision = parsed.expectedRevision;
    return this.bounded(() =>
      this.operations.runExclusive(
        environmentId,
        environmentAbortError("The environment was upgraded."),
        async (context) => {
          const record = this.requireRecord(environmentId);
          if (expectedRevision !== undefined) {
            this.assertRevision(record, expectedRevision);
          }
          if (record.desired !== "enabled") {
            throw new EnvironmentRuntimeError("environment/not-authorized");
          }
          if (typeof this.ssh.upgrade !== "function") {
            const error = new EnvironmentRuntimeError(
              "environment/upgrade-unavailable",
              ENVIRONMENT_UPGRADE_UNAVAILABLE_DETAIL,
            );
            this.observed.fail(environmentId, error);
            throw error;
          }
          const identityFile = await this.resolveCredential(record);
          let trustContext: EnvironmentTrustContext;
          try {
            trustContext = await this.trustPreparation.prepare(record, context.signal);
          } catch (error) {
            if (!isEnvironmentCancellation(error)) {
              const runtimeError = environmentRuntimeError(error);
              this.observed.fail(environmentId, runtimeError);
              throw runtimeError;
            }
            throw environmentRuntimeError(error);
          }
          const connection = this.connectionFor(record, identityFile);
          context.signal.throwIfAborted();
          await this.reconnects.cancel(environmentId);
          // Stop-then-start: the old local tunnel must be joined, not merely
          // signalled, before the new owner starts.
          this.observed.invalidateTarget(environmentId, "The environment was upgraded.");
          try {
            await this.ssh.disconnect(connection.id);
          } catch (error) {
            const runtimeError = environmentRuntimeError(error);
            this.observed.fail(environmentId, runtimeError);
            throw runtimeError;
          }
          this.observed.releaseIfOwned(connection.id, environmentId);
          this.observed.transition(environmentId, { state: "connecting" });
          let result: SshConnectResult;
          try {
            result = await this.ssh.upgrade(
              { connection },
              {
                signal: context.signal,
                knownHosts: this.trustPreparation.knownHostsPolicy(trustContext),
              },
            );
          } catch (error) {
            const runtimeError = environmentRuntimeError(error);
            this.observed.fail(environmentId, runtimeError);
            throw runtimeError;
          }
          await this.verifyConnectedTarget(environmentId, connection, result, context.signal, true);
          return this.observed.requirePublic(environmentId);
        },
        expectedRevision === undefined
          ? undefined
          : () => this.assertRevision(this.requireRecord(environmentId), expectedRevision),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Startup reconnect (independent of clients)
  // -------------------------------------------------------------------------

  /**
   * Reconnect every `desired: enabled` environment with bounded concurrency and
   * exponential backoff. This runs without any client interest; a client
   * closing never changes `desired` or stops this loop. One bounded owner loop
   * exists per environment; `start` resolves when the round's loops settle and
   * later triggers join a running loop instead of multiplying retries.
   */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    const queue = this.store
      .listRecords()
      .filter((record) => record.desired === "enabled")
      .map((record) => record.environmentId);
    await this.reconnects.start(queue);
  }

  /** Resolves when all tracked reconnect work has settled. */
  async awaitIdle(): Promise<void> {
    await this.reconnects.awaitIdle();
  }

  // -------------------------------------------------------------------------
  // Internal verified target for the parent proxy
  // -------------------------------------------------------------------------

  getVerifiedTarget(environmentId: string): EnvironmentVerifiedTarget {
    return this.observed.getVerifiedTarget(environmentId);
  }

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

  /**
   * Cancel admission and retries, then join every owned connection. The SSH
   * transport itself is not disposed here: a composition may share it with
   * device-local connections and owns its lifecycle after this service has
   * been disposed.
   *
   * A join is trusted only when the transport's own `disconnect` resolves: the
   * handle stays in `connectionOwners` until then, so a rejected join rejects
   * this promise and exactly the outstanding handles are retried by a later
   * `dispose()`. Concurrent calls share one in-flight attempt, and a fully
   * confirmed disposal stays terminal (a confirmed join is never repeated).
   */
  dispose(): Promise<void> {
    this.disposed = true;
    this.lifecycle.abort(environmentAbortError("The environment service was disposed."));
    if (this.disposeStarted !== null) return this.disposeStarted;
    const started = this.runDisposal().catch((error: unknown) => {
      // Retain every unconfirmed handle and this visible rejection: a later
      // dispose retries only what is still outstanding.
      if (this.disposeStarted === started) this.disposeStarted = null;
      throw error;
    });
    this.disposeStarted = started;
    return started;
  }

  private async runDisposal(): Promise<void> {
    await this.operations.dispose();
    await this.reconnects.dispose();
    for (const environmentId of this.observed.pendingEnvironmentIds()) {
      this.observed.invalidateTarget(environmentId, "The environment service was disposed.");
    }
    const failures: unknown[] = [];
    for (const { connectionId, environmentId } of this.observed.ownedConnections()) {
      try {
        await this.ssh.disconnect(connectionId);
      } catch (error) {
        failures.push(environmentRuntimeError(error));
        continue;
      }
      // Only a confirmed join releases the handle; a failed one stays exact.
      this.observed.releaseIfOwned(connectionId, environmentId);
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "The environment service did not confirm every owned connection join; handles were retained for a retry.",
        { cause: failures[0] },
      );
    }
    this.detachTunnelExit?.();
  }

  // -------------------------------------------------------------------------
  // Connect internals
  // -------------------------------------------------------------------------

  private runConnect(
    environmentId: string,
    callerSignal: AbortSignal | undefined,
  ): Promise<{ projection: EnvironmentPublicProjection }> {
    const work = this.connectHostOwned(environmentId);
    // A caller abort detaches this caller; the host-owned operation is not
    // cancelled here (update/disconnect/delete/dispose own that).
    return callerSignal === undefined ? work : raceWithAbort(work, callerSignal);
  }

  private async connectHostOwned(
    environmentId: string,
  ): Promise<{ projection: EnvironmentPublicProjection }> {
    return this.operations.run(
      environmentId,
      { kind: "connect", coalesceKey: `connect:${environmentId}` },
      async (context) => this.connectWork(environmentId, context),
    );
  }

  private async connectWork(
    environmentId: string,
    context: EnvironmentOperationContext,
  ): Promise<{ projection: EnvironmentPublicProjection }> {
    const signal = context.signal;
    const record = this.requireRecord(environmentId);
    // Provisioning is authorized by create/manage intent, recorded durably as
    // `desired: enabled`; an arbitrary connect never provisions a disabled one.
    if (record.desired !== "enabled") {
      const error = new EnvironmentRuntimeError("environment/not-authorized");
      this.observed.fail(environmentId, error);
      throw error;
    }
    const identityFile = await this.resolveCredential(record);
    let trustContext: EnvironmentTrustContext;
    try {
      trustContext = await this.trustPreparation.prepare(record, signal);
    } catch (error) {
      throw this.observed.failUnlessCancelled(environmentId, error);
    }
    const connection = this.connectionFor(record, identityFile);
    signal.throwIfAborted();
    this.observed.transition(environmentId, { state: "connecting" });
    let result: SshConnectResult;
    try {
      result = await this.ssh.connect(
        { connection },
        { signal, knownHosts: this.trustPreparation.knownHostsPolicy(trustContext) },
      );
    } catch (error) {
      throw this.observed.failUnlessCancelled(environmentId, error);
    }
    await this.verifyConnectedTarget(environmentId, connection, result, signal, false);
    return { projection: this.observed.requirePublic(environmentId) };
  }

  /**
   * Read the child descriptor through the trusted tunnel and pin/verify the
   * child desktopId before any target is published (and therefore before any
   * client credential could be forwarded by the future proxy). A changed
   * identity closes the tunnel and returns a typed state.
   */
  private async verifyConnectedTarget(
    environmentId: string,
    connection: SshConnectionConfig,
    result: SshConnectResult,
    signal: AbortSignal,
    upgraded: boolean,
  ): Promise<void> {
    // The transport reported a result for `connection.id`: whatever happens
    // during verification, the service now owns that child. Registering the
    // exact handle before the descriptor read means a cleanup join that fails
    // is retained for `dispose` instead of disappearing with the attempt.
    this.observed.claim(connection.id, environmentId);
    try {
      // The verified target must describe the connection this result claims to
      // be; a mismatched transport result is refused before any descriptor read
      // or target publication.
      if (result.connectionId !== connection.id) {
        throw new EnvironmentRuntimeError("environment/internal-error");
      }
      const descriptor = await this.descriptorReader(result.endpoint, signal);
      if (signal.aborted) throw environmentAbortError(signal.reason);
      const current = this.requireRecord(environmentId);
      const recorded = current.childIdentity?.desktopId;
      if (recorded !== undefined && recorded !== descriptor.desktopId) {
        await this.safeDisconnect(connection.id, environmentId);
        throw new EnvironmentRuntimeError("environment/identity-changed");
      }
      if (recorded === undefined) {
        await recordChildIdentity(this.store, environmentId, descriptor.desktopId);
      }
      const runtime = upgraded ? await this.runtimeProvider() : current.runtime;
      if (upgraded) await setRuntime(this.store, environmentId, runtime);
      const target: VerifiedTargetState = {
        connectionId: connection.id,
        endpoint: result.endpoint,
        remotePort: result.remotePort,
        runtimeHash: runtime.hash,
        childDesktopId: descriptor.desktopId,
        descriptor,
        invalidation: new AbortController(),
      };
      this.observed.publishTarget(environmentId, target);
      this.observed.transition(environmentId, { state: "connected" });
    } catch (error) {
      if (isEnvironmentCancellation(error)) {
        await this.safeDisconnect(connection.id, environmentId);
        throw environmentRuntimeError(error);
      }
      const runtimeError = environmentRuntimeError(error);
      if (runtimeError.code !== "environment/identity-changed") {
        await this.safeDisconnect(connection.id, environmentId);
      }
      this.observed.fail(environmentId, runtimeError);
      throw runtimeError;
    }
  }

  // -------------------------------------------------------------------------
  // Records, credentials, transport helpers
  // -------------------------------------------------------------------------

  private requireRecord(environmentId: string): EnvironmentRecord {
    const record = this.store.getRecord(environmentId);
    if (record === undefined) throw new EnvironmentRuntimeError("environment/not-found");
    return record;
  }

  private assertRevision(record: EnvironmentRecord, expectedRevision: number): void {
    if (record.revision !== expectedRevision) {
      throw new EnvironmentRuntimeError("environment/revision-conflict");
    }
  }

  private async resolveCredential(record: EnvironmentRecord): Promise<string | undefined> {
    try {
      const resolution = await this.credentials.resolve(record.credentialRef);
      return resolution.kind === "identity-file" ? resolution.identityFile : undefined;
    } catch (error) {
      const runtimeError = environmentRuntimeError(error);
      this.observed.fail(record.environmentId, runtimeError);
      throw runtimeError;
    }
  }

  private connectionFor(
    record: EnvironmentRecord,
    identityFile: string | undefined,
  ): SshConnectionConfig {
    return sshConnectionConfigSchema.parse({
      id: connectionIdFor(record),
      label: record.label,
      target: record.target,
      ...(record.port === undefined ? {} : { port: record.port }),
      ...(identityFile === undefined ? {} : { identityFile }),
    });
  }

  /**
   * Refuse service work that does not pass through the operation coordinator
   * (create and trust probing), so a disposal that already aborted admission
   * cannot be raced by a new operation.
   */
  private assertNotDisposed(): void {
    if (this.disposed) throw environmentAbortError("The environment service was disposed.");
  }

  /** Normalize every public failure into the bounded typed vocabulary. */
  private async bounded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw environmentRuntimeError(error);
    }
  }

  /** Map a store failure into the bounded public vocabulary. */
  private async storeMutation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw environmentRuntimeError(error);
    }
  }

  /**
   * Best-effort join for error-cleanup paths only (a connect that is being
   * abandoned). Destructive and custody operations require the join and
   * surface its failure instead of calling this. A confirmed cleanup join
   * releases the owned handle; a failed one retains it for `dispose`.
   */
  private async safeDisconnect(connectionId: string, environmentId: string): Promise<void> {
    try {
      await this.ssh.disconnect(connectionId);
      this.observed.releaseIfOwned(connectionId, environmentId);
    } catch {
      // The service keeps owning the child: `dispose` retries the join.
    }
  }

  private defaultDescriptorReader(
    options: EnvironmentRuntimeServiceOptions,
  ): EnvironmentDescriptorReader {
    const fetchImpl = options.fetchImpl ?? fetch;
    // The operation signal cancels and joins the poll itself (request, pause,
    // and loop), so an aborted descriptor read leaves no detached fetch/timer.
    return (endpoint, signal) =>
      waitForRemoteEndpoint(fetchImpl, endpoint, SSH_TUNNEL_READY_TIMEOUT_MS, { signal });
  }
}

/**
 * Stable remote connection id: the adopted legacy id when the environment
 * adopted one (so the child's data dir is preserved), otherwise the
 * host-minted environment id. Both are durable, so restarts reconnect to the
 * same remote profile and identity, and the store guarantees the two id
 * namespaces never collide.
 */
function connectionIdFor(record: EnvironmentRecord): string {
  return record.legacyConnectionIds[0] ?? record.environmentId;
}
