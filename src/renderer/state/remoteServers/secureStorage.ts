import type { PersistStorage, StorageValue } from "zustand/middleware";
import { filterKnownRemoteAccessScopes } from "@/shared/remote";
import { sshConnectionConfigSchema } from "@/shared/ssh";
import { remoteConnectionKey, type RemoteServerRecord } from "./types";
import {
  deleteDesktopToken,
  getDesktopToken,
  noteDesktopTokenCommitted,
  setDesktopToken,
} from "./tokenVault";

type StateWithServers = { servers: RemoteServerRecord[] };

interface LegacyMobileDesktop {
  readonly desktopId?: unknown;
  readonly label?: unknown;
  readonly endpoint?: unknown;
  readonly accessToken?: unknown;
  readonly scopes?: unknown;
  readonly appVersion?: unknown;
  readonly platform?: unknown;
  readonly transport?: unknown;
}

const LEGACY_MOBILE_DATABASE_NAME = "lightcode-mobile";
const LEGACY_MOBILE_DESKTOP_STORE = "desktops";

function parseStoredValue<S>(raw: string | null): StorageValue<S> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StorageValue<S>;
  } catch {
    return null;
  }
}

/**
 * Vault slots are owned by the connection key. v1 records are equal by
 * construction (`connectionId = desktopId`), so their published
 * `token.<desktopId>` slots keep their exact key; a v2 environment record uses
 * its locally minted `connectionId` and never shares a slot with a direct
 * pairing of the same child host.
 */
function vaultConnectionKeys<S extends StateWithServers>(
  value: StorageValue<S> | null,
): Set<string> {
  return new Set(value?.state.servers.map(remoteConnectionKey) ?? []);
}

/**
 * A v2 environment record may have been written to the v1-era
 * `token.<desktopId>` slot by a pre-correction build. That slot is only
 * attributable when exactly one record in the document claims the desktop
 * identity: two connections of the same child host share one bearer there, and
 * a shared bearer is never copied into either connection.
 */
function legacyDesktopSlot(
  server: RemoteServerRecord,
  servers: readonly RemoteServerRecord[],
): string | undefined {
  if (remoteConnectionKey(server) === server.desktopId) return undefined;
  let claimants = 0;
  for (const candidate of servers) {
    if (candidate.desktopId !== server.desktopId) continue;
    claimants += 1;
    if (claimants > 1) return undefined;
  }
  return claimants === 1 ? server.desktopId : undefined;
}

function parseLegacyTransport(value: unknown): RemoteServerRecord["transport"] {
  if (typeof value !== "object" || value === null || !("kind" in value)) return undefined;
  if (value.kind === "direct") return { kind: "direct" };
  if (value.kind !== "ssh" || !("connection" in value)) return undefined;
  const connection = sshConnectionConfigSchema.safeParse(value.connection);
  return connection.success ? { kind: "ssh", connection: connection.data } : undefined;
}

async function hydrateServers(
  servers: RemoteServerRecord[],
  retainFailedPlaintext: (server: RemoteServerRecord) => boolean = () => false,
): Promise<{
  live: RemoteServerRecord[];
  persisted: RemoteServerRecord[];
  migrated: boolean;
  migrationPending: boolean;
}> {
  let migrated = false;
  let migrationPending = false;
  const rows = await Promise.all(
    servers.map(async (server) => {
      const connectionKey = remoteConnectionKey(server);
      if (server.accessToken) {
        const stored = await setDesktopToken(connectionKey, server.accessToken);
        migrated ||= stored;
        migrationPending ||= !stored;
        return {
          live: server,
          persisted:
            stored || !retainFailedPlaintext(server) ? { ...server, accessToken: "" } : server,
        };
      }
      let accessToken = await getDesktopToken(connectionKey);
      if (!accessToken) {
        const fallbackKey = legacyDesktopSlot(server, servers);
        if (fallbackKey !== undefined) accessToken = await getDesktopToken(fallbackKey);
      }
      return {
        live: accessToken ? { ...server, accessToken } : server,
        persisted: server,
      };
    }),
  );
  return {
    live: rows.map((row) => row.live),
    persisted: rows.map((row) => row.persisted),
    migrated,
    migrationPending,
  };
}

async function openLegacyMobileDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (typeof indexedDB.databases === "function") {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === LEGACY_MOBILE_DATABASE_NAME)) return null;
  }
  return await new Promise<IDBDatabase | null>((resolve, reject) => {
    let createdEmptyDatabase = false;
    const request = indexedDB.open(LEGACY_MOBILE_DATABASE_NAME);
    request.onupgradeneeded = () => {
      createdEmptyDatabase = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      if (createdEmptyDatabase) {
        indexedDB.deleteDatabase(LEGACY_MOBILE_DATABASE_NAME);
        resolve(null);
      } else {
        reject(request.error ?? new Error("Unable to read legacy pairings."));
      }
    };
  });
}

async function readLegacyMobileServers(): Promise<RemoteServerRecord[]> {
  let database: IDBDatabase | null = null;
  try {
    database = await openLegacyMobileDatabase();
    if (!database?.objectStoreNames.contains(LEGACY_MOBILE_DESKTOP_STORE)) return [];
    const rows = await new Promise<LegacyMobileDesktop[]>((resolve, reject) => {
      const transaction = database!.transaction(LEGACY_MOBILE_DESKTOP_STORE, "readonly");
      const request = transaction.objectStore(LEGACY_MOBILE_DESKTOP_STORE).getAll();
      request.onsuccess = () => resolve(request.result as LegacyMobileDesktop[]);
      request.onerror = () => reject(request.error ?? new Error("Unable to read legacy pairings."));
    });
    return rows.flatMap((row): RemoteServerRecord[] => {
      if (
        typeof row.desktopId !== "string" ||
        typeof row.label !== "string" ||
        typeof row.endpoint !== "string"
      ) {
        return [];
      }
      const platform =
        row.platform === "win32" || row.platform === "darwin" || row.platform === "linux"
          ? row.platform
          : undefined;
      const transport = parseLegacyTransport(row.transport);
      return [
        {
          desktopId: row.desktopId,
          label: row.label,
          endpoint: row.endpoint,
          accessToken: typeof row.accessToken === "string" ? row.accessToken : "",
          scopes: filterKnownRemoteAccessScopes(Array.isArray(row.scopes) ? row.scopes : []),
          ...(typeof row.appVersion === "string" ? { appVersion: row.appVersion } : {}),
          ...(platform ? { platform } : {}),
          ...(transport ? { transport } : {}),
        },
      ];
    });
  } catch (error) {
    console.warn("[remoteServers] unable to migrate legacy mobile pairings", error);
    return [];
  } finally {
    database?.close();
  }
}

type PersistedFields = Record<string, unknown>;

/** One realm's change to one server record, replayed onto the shared document. */
type ServerOperation =
  | {
      readonly kind: "upsert";
      readonly key: string;
      readonly fields: Partial<RemoteServerRecord>;
      readonly unset: readonly string[];
      /** A bearer this realm set; undefined leaves the vault slot untouched. */
      readonly bearer: string | undefined;
      /** A record this realm asserts in full (new here); others only patch. */
      readonly whole: boolean;
    }
  | { readonly kind: "remove"; readonly key: string; readonly desktopId: string };

export interface RemoteServersFieldChange {
  readonly field: string;
  /** Entry of an object-valued field; undefined replaces the whole field. */
  readonly entry?: string;
  readonly value: unknown;
  readonly remove: boolean;
}

interface PersistedChanges {
  readonly servers: readonly ServerOperation[];
  readonly fields: readonly RemoteServersFieldChange[];
  readonly touched: readonly string[];
}

/** Durable changes other realms made since this realm last synchronized. */
export interface RemoteServersDurableChanges {
  /** Records added elsewhere, with their bearer read from the vault. */
  readonly added: readonly RemoteServerRecord[];
  /** Field patches (durable values) for records changed elsewhere. */
  readonly changed: readonly {
    readonly key: string;
    readonly fields: Partial<RemoteServerRecord>;
    /** Present when the endpoint moved: the bearer issued for it. */
    readonly accessToken?: string;
  }[];
  readonly removed: readonly string[];
  /** Other persisted fields, patched the same way (whole field or entry). */
  readonly fields: readonly RemoteServersFieldChange[];
}

export interface SecureRemoteServersStorage<S> extends PersistStorage<S> {
  /** Records a bearer that credential custody already committed for this
   * realm, so persisting the store does not write it to the vault again. */
  acknowledgeBearer(connectionKey: string, accessToken: string): void;
  /** The server record currently in shared storage, bearer excluded. */
  durableServer(connectionKey: string): RemoteServerRecord | undefined;
  /** Hands `apply` what other realms changed, after this realm's pending writes. */
  reconcile(name: string, apply: (changes: RemoteServersDurableChanges) => void): Promise<void>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serversOf(state: PersistedFields | undefined): RemoteServerRecord[] {
  return Array.isArray(state?.servers) ? (state.servers as RemoteServerRecord[]) : [];
}

function serverKey(connectionKey: string): string {
  return `servers:${connectionKey}`;
}

function fieldKey(field: string, entry?: string): string {
  return entry === undefined ? field : `${field}:${entry}`;
}

/**
 * The operations that turn this realm's previous view into its next one. With
 * no previous view (first write before hydration) every record and field is
 * asserted, but nothing is removed: this realm cannot know what it would erase.
 */
function diffPersisted(
  previous: PersistedFields | undefined,
  next: PersistedFields,
): PersistedChanges {
  const servers: ServerOperation[] = [];
  const fields: RemoteServersFieldChange[] = [];
  const touched: string[] = [];
  const before = new Map(
    serversOf(previous).map((server) => [remoteConnectionKey(server), server]),
  );
  const after = serversOf(next);
  for (const server of after) {
    const key = remoteConnectionKey(server);
    const prior = before.get(key);
    const { accessToken, ...rest } = server;
    if (!prior) {
      servers.push({
        kind: "upsert",
        key,
        fields: rest,
        unset: [],
        bearer: accessToken || undefined,
        whole: true,
      });
      touched.push(serverKey(key));
      continue;
    }
    const patch: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const field of new Set([...Object.keys(server), ...Object.keys(prior)])) {
      if (field === "accessToken") continue;
      const value = (server as unknown as Record<string, unknown>)[field];
      if (sameValue(value, (prior as unknown as Record<string, unknown>)[field])) continue;
      if (value === undefined) unset.push(field);
      else patch[field] = value;
    }
    const bearer = accessToken && accessToken !== prior.accessToken ? accessToken : undefined;
    if (Object.keys(patch).length === 0 && unset.length === 0 && bearer === undefined) continue;
    servers.push({ kind: "upsert", key, fields: patch, unset, bearer, whole: false });
    touched.push(serverKey(key));
  }
  if (previous) {
    const kept = new Set(after.map(remoteConnectionKey));
    for (const [key, server] of before) {
      if (kept.has(key)) continue;
      servers.push({ kind: "remove", key, desktopId: server.desktopId });
      touched.push(serverKey(key));
    }
  }
  for (const field of new Set([...Object.keys(previous ?? {}), ...Object.keys(next)])) {
    if (field === "servers") continue;
    const value = next[field];
    const prior = previous?.[field];
    if (previous && sameValue(value, prior)) continue;
    if (previous && isPlainObject(value) && isPlainObject(prior)) {
      for (const entry of new Set([...Object.keys(value), ...Object.keys(prior)])) {
        if (sameValue(value[entry], prior[entry])) continue;
        fields.push({ field, entry, value: value[entry], remove: !(entry in value) });
        touched.push(fieldKey(field, entry));
      }
      continue;
    }
    fields.push({ field, value, remove: !(field in next) });
    touched.push(fieldKey(field));
  }
  return { servers, fields, touched };
}

function applyRemoteServersFieldChange(
  state: PersistedFields,
  operation: RemoteServersFieldChange,
): void {
  if (operation.entry === undefined) {
    if (operation.remove) delete state[operation.field];
    else state[operation.field] = operation.value;
    return;
  }
  const current = state[operation.field];
  const target: Record<string, unknown> = isPlainObject(current) ? { ...current } : {};
  if (operation.remove) delete target[operation.entry];
  else target[operation.entry] = operation.value;
  state[operation.field] = target;
}

/** The top-level fields `changes` patch, computed from a copy of `state`. */
export function patchRemoteServersFields<T extends object>(
  state: T,
  changes: readonly RemoteServersFieldChange[],
): Partial<T> {
  const next = { ...state } as PersistedFields;
  for (const change of changes) applyRemoteServersFieldChange(next, change);
  // A field another realm's document lacks keeps this realm's value.
  return Object.fromEntries(
    changes
      .map((change) => [change.field, next[change.field]] as const)
      .filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** Persists remote-server metadata locally while keeping bearer credentials in
 * the browser's encrypted WebCrypto vault. Every renderer realm (window or tab)
 * writes only its own changes onto the shared document, so a realm with an
 * older view can neither erase another realm's pairing, resurrect one it
 * removed, nor write its stale bearer over a newer one. */
/** Keep each document's read/encrypt/write together across renderer windows. */
function withSharedStorageLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks?.request ? locks.request(`poracode.remote-servers.storage.${name}`, run) : run();
}

export function createSecureRemoteServersStorage<S extends StateWithServers>(
  createLegacyState?: (servers: RemoteServerRecord[]) => S,
): SecureRemoteServersStorage<S> {
  let writeQueue = Promise.resolve();
  const enqueueWrite = (name: string, write: () => Promise<void>): Promise<void> => {
    const result = writeQueue.then(() => withSharedStorageLock(name, write));
    writeQueue = result.catch(() => undefined);
    return result;
  };
  /** This realm's last persisted view: what its next diff is taken against. */
  let previous: PersistedFields | undefined;
  let storageName: string | undefined;
  /** Keys with queued writes; reconciliation leaves them to those writes. */
  const pending = new Map<string, number>();

  const applyChanges = async (
    name: string,
    version: number | undefined,
    changes: PersistedChanges,
  ): Promise<void> => {
    const raw = localStorage.getItem(name);
    const stored = parseStoredValue<S>(raw);
    const state: PersistedFields = { ...(stored?.state as PersistedFields | undefined) };
    const servers = [...serversOf(state)];
    const removed: { key: string; desktopId: string }[] = [];
    for (const operation of changes.servers) {
      const index = servers.findIndex((server) => remoteConnectionKey(server) === operation.key);
      if (operation.kind === "remove") {
        if (index >= 0) servers.splice(index, 1);
        removed.push(operation);
        continue;
      }
      // Removed by another realm: a patch from an older view never revives it.
      if (index < 0 && !operation.whole) continue;
      const base = index >= 0 ? servers[index] : undefined;
      let accessToken = base?.accessToken ?? "";
      if (operation.bearer !== undefined) {
        const encrypted = await setDesktopToken(operation.key, operation.bearer);
        // New or replacement tokens never fall back to plaintext; only a token
        // already durable on this same connection is kept until encryption lands.
        accessToken = encrypted
          ? ""
          : base?.accessToken === operation.bearer
            ? operation.bearer
            : "";
      }
      const record: PersistedFields = { ...base, ...operation.fields, accessToken };
      for (const field of operation.unset) delete record[field];
      if (index >= 0) servers[index] = record as unknown as RemoteServerRecord;
      else servers.push(record as unknown as RemoteServerRecord);
    }
    for (const operation of changes.fields) applyRemoteServersFieldChange(state, operation);
    state.servers = servers;
    const document = JSON.stringify({
      ...stored,
      state,
      ...(version !== undefined ? { version } : {}),
    });
    if (document !== raw) localStorage.setItem(name, document);
    await Promise.all(
      removed.flatMap(({ key, desktopId }) => {
        const slots = [deleteDesktopToken(key)];
        // A removed environment connection may also own the v1-era shared
        // `token.<desktopId>` slot; purge it only when no record still claims
        // that desktop identity.
        if (key !== desktopId && !servers.some((server) => server.desktopId === desktopId)) {
          slots.push(deleteDesktopToken(desktopId));
        }
        return slots;
      }),
    );
  };

  return {
    async getItem(name): Promise<StorageValue<S> | null> {
      await writeQueue;
      return withSharedStorageLock(name, async () => {
        storageName = name;
        const persistedRaw = localStorage.getItem(name);
        let stored = parseStoredValue<S>(persistedRaw);
        if (!stored && createLegacyState) {
          const legacyServers = await readLegacyMobileServers();
          if (legacyServers.length > 0) {
            stored = { state: createLegacyState(legacyServers), version: 0 };
          }
        }
        if (!stored) return null;
        const hydrated = await hydrateServers(stored.state.servers, () => true);
        if (hydrated.migrated || (persistedRaw === null && !hydrated.migrationPending)) {
          localStorage.setItem(
            name,
            JSON.stringify({
              ...stored,
              state: { ...stored.state, servers: hydrated.persisted },
            }),
          );
        }
        const live = { ...stored, state: { ...stored.state, servers: hydrated.live } };
        previous = clone(live.state) as unknown as PersistedFields;
        return live;
      });
    },

    setItem(name, value): Promise<void> {
      storageName = name;
      const captured = clone(value);
      const next = captured.state as unknown as PersistedFields;
      const changes = diffPersisted(previous, next);
      previous = next;
      for (const key of changes.touched) pending.set(key, (pending.get(key) ?? 0) + 1);
      return enqueueWrite(name, async () => {
        try {
          await applyChanges(name, captured.version, changes);
        } finally {
          for (const key of changes.touched) {
            const count = (pending.get(key) ?? 1) - 1;
            if (count > 0) pending.set(key, count);
            else pending.delete(key);
          }
        }
      });
    },

    removeItem(name): Promise<void> {
      previous = undefined;
      return enqueueWrite(name, async () => {
        const stored = parseStoredValue<S>(localStorage.getItem(name));
        localStorage.removeItem(name);
        const slots = vaultConnectionKeys(stored);
        for (const server of stored?.state.servers ?? []) slots.add(server.desktopId);
        await Promise.all([...slots].map((connectionKey) => deleteDesktopToken(connectionKey)));
      });
    },

    acknowledgeBearer(connectionKey, accessToken) {
      const servers = serversOf(previous);
      const index = servers.findIndex(
        (candidate) => remoteConnectionKey(candidate) === connectionKey,
      );
      if (index >= 0) servers[index] = { ...servers[index]!, accessToken };
    },

    durableServer(connectionKey) {
      if (storageName === undefined) return undefined;
      const stored = parseStoredValue<S>(localStorage.getItem(storageName));
      return stored?.state.servers.find((server) => remoteConnectionKey(server) === connectionKey);
    },

    reconcile(name, apply): Promise<void> {
      return enqueueWrite(name, async () => {
        const stored = parseStoredValue<S>(localStorage.getItem(name));
        const view = previous;
        if (!stored || !view) return;
        const durable = stored.state as unknown as PersistedFields;
        const known = new Map(
          serversOf(view).map((server) => [remoteConnectionKey(server), server]),
        );
        const added: RemoteServerRecord[] = [];
        const changed: {
          key: string;
          fields: Partial<RemoteServerRecord>;
          accessToken?: string;
        }[] = [];
        const removed: string[] = [];
        const durableKeys = new Set<string>();
        for (const server of serversOf(durable)) {
          const key = remoteConnectionKey(server);
          durableKeys.add(key);
          if (pending.has(serverKey(key))) continue;
          const prior = known.get(key);
          if (!prior) {
            noteDesktopTokenCommitted(key, null);
            const accessToken = (await getDesktopToken(key)) ?? server.accessToken;
            added.push({ ...server, accessToken });
            continue;
          }
          const fields: Record<string, unknown> = {};
          for (const field of new Set([...Object.keys(server), ...Object.keys(prior)])) {
            if (field === "accessToken") continue;
            const value = (server as unknown as PersistedFields)[field];
            if (!sameValue(value, (prior as unknown as PersistedFields)[field])) {
              fields[field] = value;
            }
          }
          if (Object.keys(fields).length === 0) continue;
          if (fields.endpoint === undefined) {
            changed.push({ key, fields });
            continue;
          }
          noteDesktopTokenCommitted(key, null);
          const accessToken = await getDesktopToken(key);
          changed.push({ key, fields, ...(accessToken ? { accessToken } : {}) });
        }
        for (const key of known.keys()) {
          if (!durableKeys.has(key) && !pending.has(serverKey(key))) removed.push(key);
        }
        const fieldChanges: RemoteServersFieldChange[] = [];
        for (const field of new Set([...Object.keys(view), ...Object.keys(durable)])) {
          if (field === "servers" || pending.has(fieldKey(field))) continue;
          const value = durable[field];
          const prior = view[field];
          if (sameValue(value, prior)) continue;
          if (isPlainObject(value) && isPlainObject(prior)) {
            for (const entry of new Set([...Object.keys(value), ...Object.keys(prior)])) {
              if (pending.has(fieldKey(field, entry))) continue;
              if (sameValue(value[entry], prior[entry])) continue;
              fieldChanges.push({ field, entry, value: value[entry], remove: !(entry in value) });
            }
            continue;
          }
          fieldChanges.push({ field, value, remove: !(field in durable) });
        }
        if (
          added.length === 0 &&
          changed.length === 0 &&
          removed.length === 0 &&
          fieldChanges.length === 0
        ) {
          return;
        }
        // Adopt the durable state into this realm's view first, so the store
        // write that `apply` triggers does not echo it back as a local change.
        const nextView = clone(view);
        const viewServers = serversOf(nextView).filter(
          (server) => !removed.includes(remoteConnectionKey(server)),
        );
        for (const change of changed) {
          const index = viewServers.findIndex(
            (server) => remoteConnectionKey(server) === change.key,
          );
          if (index < 0) continue;
          viewServers[index] = {
            ...viewServers[index]!,
            ...change.fields,
            ...(change.accessToken ? { accessToken: change.accessToken } : {}),
          };
        }
        nextView.servers = [...viewServers, ...clone(added)];
        for (const operation of fieldChanges) applyRemoteServersFieldChange(nextView, operation);
        previous = nextView;
        apply({ added, changed, removed, fields: fieldChanges });
      });
    },
  };
}
