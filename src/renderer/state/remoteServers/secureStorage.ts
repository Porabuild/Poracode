import type { PersistStorage, StorageValue } from "zustand/middleware";
import { filterKnownRemoteAccessScopes } from "@/shared/remote";
import { sshConnectionConfigSchema } from "@/shared/ssh";
import type { RemoteServerRecord } from "./types";
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

function serverIds<S extends StateWithServers>(value: StorageValue<S> | null): Set<string> {
  return new Set(value?.state.servers.map((server) => server.desktopId) ?? []);
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
      if (server.accessToken) {
        const stored = await setDesktopToken(server.desktopId, server.accessToken);
        migrated ||= stored;
        migrationPending ||= !stored;
        return {
          live: server,
          persisted: stored || !retainFailedPlaintext ? { ...server, accessToken: "" } : server,
        };
      }
      const accessToken = await getDesktopToken(server.desktopId);
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
        const retained = new Set(captured.state.servers.map((server) => server.desktopId));
        await Promise.all(
          [...serverIds(previous)]
            .filter((desktopId) => !retained.has(desktopId))
            .map((desktopId) => deleteDesktopToken(desktopId)),
        );
      });
    },

    removeItem(name): Promise<void> {
      return enqueueWrite(async () => {
        const stored = parseStoredValue<S>(localStorage.getItem(name));
        localStorage.removeItem(name);
        await Promise.all([...serverIds(stored)].map((desktopId) => deleteDesktopToken(desktopId)));
      });
    },
  };
}
