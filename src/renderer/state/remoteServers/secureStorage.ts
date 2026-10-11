import type { PersistStorage, StorageValue } from "zustand/middleware";
import { filterKnownRemoteAccessScopes } from "@/shared/remote";
import { sshConnectionConfigSchema } from "@/shared/ssh";
import { remoteConnectionKey, type RemoteServerRecord } from "./types";
import { deleteDesktopToken, getDesktopToken, setDesktopToken } from "./tokenVault";

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
  retainFailedPlaintext = false,
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
          persisted: stored || !retainFailedPlaintext ? { ...server, accessToken: "" } : server,
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

/** Persists remote-server metadata locally while keeping bearer credentials in
 * the browser's encrypted WebCrypto vault. */
export function createSecureRemoteServersStorage<S extends StateWithServers>(
  createLegacyState?: (servers: RemoteServerRecord[]) => S,
): PersistStorage<S> {
  let writeQueue = Promise.resolve();
  const enqueueWrite = (write: () => Promise<void>): Promise<void> => {
    const result = writeQueue.then(write);
    writeQueue = result.catch(() => undefined);
    return result;
  };

  return {
    async getItem(name): Promise<StorageValue<S> | null> {
      await writeQueue;
      const persistedRaw = localStorage.getItem(name);
      let stored = parseStoredValue<S>(persistedRaw);
      if (!stored && createLegacyState) {
        const legacyServers = await readLegacyMobileServers();
        if (legacyServers.length > 0) {
          stored = { state: createLegacyState(legacyServers), version: 0 };
        }
      }
      if (!stored) return null;
      const hydrated = await hydrateServers(stored.state.servers, true);
      if (hydrated.migrated || (persistedRaw === null && !hydrated.migrationPending)) {
        localStorage.setItem(
          name,
          JSON.stringify({
            ...stored,
            state: { ...stored.state, servers: hydrated.persisted },
          }),
        );
      }
      return {
        ...stored,
        state: { ...stored.state, servers: hydrated.live },
      };
    },

    setItem(name, value): Promise<void> {
      const captured = JSON.parse(JSON.stringify(value)) as StorageValue<S>;
      return enqueueWrite(async () => {
        const previous = parseStoredValue<S>(localStorage.getItem(name));
        const hydrated = await hydrateServers(captured.state.servers);
        localStorage.setItem(
          name,
          JSON.stringify({
            ...captured,
            state: { ...captured.state, servers: hydrated.persisted },
          }),
        );
        const retained = new Set(captured.state.servers.map(remoteConnectionKey));
        const retainedDesktopIds = new Set(
          captured.state.servers.map((server) => server.desktopId),
        );
        const staleSlots = new Set<string>();
        for (const connectionKey of vaultConnectionKeys(previous)) {
          if (!retained.has(connectionKey)) staleSlots.add(connectionKey);
        }
        for (const server of previous?.state.servers ?? []) {
          const connectionKey = remoteConnectionKey(server);
          if (retained.has(connectionKey)) continue;
          // A removed environment connection may also own the v1-era shared
          // `token.<desktopId>` slot; purge it only when no retained record
          // still claims that desktop identity.
          if (connectionKey !== server.desktopId && !retainedDesktopIds.has(server.desktopId)) {
            staleSlots.add(server.desktopId);
          }
        }
        await Promise.all(
          [...staleSlots].map((connectionKey) => deleteDesktopToken(connectionKey)),
        );
      });
    },

    removeItem(name): Promise<void> {
      return enqueueWrite(async () => {
        const stored = parseStoredValue<S>(localStorage.getItem(name));
        localStorage.removeItem(name);
        const slots = vaultConnectionKeys(stored);
        for (const server of stored?.state.servers ?? []) slots.add(server.desktopId);
        await Promise.all([...slots].map((connectionKey) => deleteDesktopToken(connectionKey)));
      });
    },
  };
}
