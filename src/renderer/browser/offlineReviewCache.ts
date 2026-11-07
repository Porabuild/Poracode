import { z } from "zod";
import { prDataSchema, prDetailsSchema, prFileSchema } from "@/shared/contracts/githubResults";
import { ipcProcedureMap, parseIpcProcedureArgs } from "@/shared/ipc";
import { isRemoteTransportFailure, RemoteClientError } from "@/shared/remote/clientErrors";
import { REMOTE_PROCEDURE_SPECS, type RemoteProcedureName } from "@/shared/remote/procedures";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { hasAnyClientBridge, readClientRuntime } from "@/renderer/clientRuntime";
import {
  browserBridgeOwnerKey,
  selectBrowserBridgeClientServer,
} from "@/renderer/state/remoteServers/browserBridge";
import { remoteConnectionKey, type RemoteServersState } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

const DATABASE = "poracode-review-cache";
const MAXIMUM_CHARACTERS = 8 * 1024 * 1024;
let database: Promise<IDBDatabase> | undefined;

export const browserReviewBundleSchema = z.object({
  pr: prDataSchema.optional(),
  details: prDetailsSchema,
  files: z.array(prFileSchema),
  diff: z.string(),
});

export function browserReviewOwner(state: RemoteServersState = useRemoteServersStore.getState()) {
  if (!hasAnyClientBridge() || readClientRuntime().transport !== "remote-http-websocket") return;
  const server = selectBrowserBridgeClientServer(state);
  if (!server) return;
  return {
    key: browserBridgeOwnerKey(server),
    online: state.runtime[remoteConnectionKey(server)]?.status === "online",
    canRead: server.scopes.includes("session:read"),
  };
}

export function useBrowserReviewOnline(): boolean {
  return useRemoteServersStore((state) => browserReviewOwner(state)?.online ?? true);
}

async function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    // First released format. A future database version fails open(version=1) without deletion.
    const request = indexedDB.open(DATABASE, 1);
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error("Review cache open timed out."));
    }, 5000);
    request.onupgradeneeded = () => {
      if (settled) {
        request.transaction?.abort();
        return;
      }
      const store = request.result.createObjectStore("snapshots", { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
    };
    request.onerror = () => {
      settled = true;
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      settled = true;
      clearTimeout(timer);
      reject(new Error("Review cache is blocked."));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

export async function readBrowserReviewCache<T>(
  key: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDatabase();
    const stored: unknown = await new Promise((resolve, reject) => {
      const transaction = db.transaction("snapshots");
      const request = transaction.objectStore("snapshots").get(key);
      const timer = setTimeout(() => {
        transaction.abort();
        reject(new Error("Review cache read timed out."));
      }, 5000);
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
    });
    const record = z
      .object({
        version: z.literal(1),
        id: z.literal(key),
        serialized: z.string().max(MAXIMUM_CHARACTERS),
      })
      .safeParse(stored);
    if (!record.success) return;
    const parsed = schema.safeParse(JSON.parse(record.data.serialized));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return;
  }
}

export async function writeBrowserReviewCache(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAXIMUM_CHARACTERS) return;
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("snapshots", "readwrite");
      const store = transaction.objectStore("snapshots");
      const timer = setTimeout(() => {
        transaction.abort();
        reject(new Error("Review cache write timed out."));
      }, 5000);
      const previous = store.get(key);
      previous.onsuccess = () => {
        // Preserve unknown future row formats, including during a downgrade.
        const existing: unknown = previous.result;
        if (
          existing !== undefined &&
          (!existing ||
            typeof existing !== "object" ||
            !("version" in existing) ||
            existing.version !== 1)
        )
          return;
        store.put({ id: key, version: 1, updatedAt: Date.now(), serialized });
        const count = store.count();
        count.onsuccess = () => {
          let remaining = count.result - 60;
          if (remaining <= 0) return;
          const cursor = store.index("updatedAt").openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry || remaining <= 0) return;
            const row: unknown = entry.value;
            if (row && typeof row === "object" && "version" in row && row.version === 1) {
              entry.delete();
              remaining--;
            }
            entry.continue();
          };
        };
      };
      transaction.oncomplete = () => {
        clearTimeout(timer);
        resolve();
      };
      transaction.onabort = transaction.onerror = () => {
        clearTimeout(timer);
        reject(transaction.error);
      };
    });
  } catch {
    /* A disposable cache must not make a successful host read fail. */
  }
}

const CACHED_READS = new Set<RemoteProcedureName>([
  "ghListPullRequests",
  "forgeListPullRequests",
  "forgeListPullRequestsInState",
  "ghListPrs",
  "forgeListPrs",
  "forgeGetPrReviewGuide",
  "forgeGetPrViewedFiles",
]);

/** Lists and independently diff-bound guide/mark projections can be cached per read. */
export async function callBrowserReviewProcedure(
  client: RemoteDesktopClient,
  procedure: RemoteProcedureName,
  payload: unknown,
  clientOwnerKey?: string,
): Promise<unknown> {
  if (!procedure.startsWith("forge") && !procedure.startsWith("gh"))
    return client.callRemoteProcedure(procedure, payload);
  const owner = browserReviewOwner();
  if (clientOwnerKey === undefined) return client.callRemoteProcedure(procedure, payload);
  if (!owner || clientOwnerKey !== owner.key)
    throw new RemoteClientError("Review owner changed.", 499, "cancelled");
  const input = parseIpcProcedureArgs(procedure, [payload]);
  const key = JSON.stringify([owner.key, procedure, input]);
  const schema = CACHED_READS.has(procedure) ? ipcProcedureMap[procedure].resultSchema : undefined;
  const offline = new RemoteClientError("The selected host is offline.", 0, "offline");
  if (!owner.online) {
    if (schema && owner.canRead) {
      const cached = await readBrowserReviewCache<unknown>(key, schema);
      const current = browserReviewOwner();
      if (cached !== undefined && current?.key === owner.key && current.canRead) return cached;
    }
    throw offline;
  }
  try {
    const result = await client.callRemoteProcedure(procedure, payload);
    if (browserReviewOwner()?.key !== owner.key)
      throw new RemoteClientError("Review owner changed.", 499, "cancelled");
    const parsed = schema && owner.canRead ? schema.safeParse(result) : undefined;
    if (parsed?.success) await writeBrowserReviewCache(key, parsed.data);
    if (browserReviewOwner()?.key !== owner.key)
      throw new RemoteClientError("Review owner changed.", 499, "cancelled");
    return result;
  } catch (error) {
    if (
      schema &&
      owner.canRead &&
      REMOTE_PROCEDURE_SPECS[procedure].scope === "session:read" &&
      isRemoteTransportFailure(error)
    ) {
      const cached = await readBrowserReviewCache<unknown>(key, schema);
      const current = browserReviewOwner();
      if (cached !== undefined && current?.key === owner.key && current.canRead) return cached;
    }
    throw error;
  }
}

export async function resetBrowserReviewCacheForTest(): Promise<void> {
  const opened = await database;
  opened?.close();
  database = undefined;
}
