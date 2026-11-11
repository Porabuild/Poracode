import Database from "better-sqlite3";
import { parentPort, workerData } from "node:worker_threads";
import { resolveBetterSqliteNativeBindingOptions } from "./nativeBinding";
import { attachEditableDatabaseHandle } from "./connection";
import {
  applyRuntimeEventBatchesNow,
  applyThreadRuntimeEventsNow,
  resetRuntimeItemsWriterCache,
} from "./runtimeItemsWriter";
import {
  DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
  type DatabaseWriteWorkerData,
  type DatabaseWriteWorkerRequest,
  type DatabaseWriteWorkerResponse,
  type SerializedStorageError,
} from "./databaseWriteProtocol";

function serializeError(error: unknown): SerializedStorageError {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return {
      message: error.message,
      name: error.name,
      ...(typeof code === "string" ? { code } : {}),
    };
  }
  return { message: String(error) };
}

function post(message: DatabaseWriteWorkerResponse): void {
  parentPort?.postMessage(message);
}

function startWorker(): void {
  const init = workerData as DatabaseWriteWorkerData | undefined;
  if (
    !init ||
    init.version !== DATABASE_WRITE_WORKER_PROTOCOL_VERSION ||
    typeof init.dbPath !== "string"
  ) {
    throw new Error("Invalid databaseWriteWorker initialization data.");
  }

  const sqlite = new Database(init.dbPath, {
    ...resolveBetterSqliteNativeBindingOptions(),
    fileMustExist: true,
  });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 50");
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("journal_size_limit = 134217728");
  sqlite.pragma("wal_autocheckpoint = 16384");
  sqlite.function("schedule_search_text", { deterministic: true }, (value: unknown) =>
    typeof value === "string" ? value.normalize("NFKC").toLowerCase() : "",
  );
  attachEditableDatabaseHandle(sqlite);

  post({
    v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
    kind: "ready",
  });

  parentPort?.on("message", (message: DatabaseWriteWorkerRequest) => {
    if (!message || message.v !== DATABASE_WRITE_WORKER_PROTOCOL_VERSION) return;

    if (message.kind === "close") {
      resetRuntimeItemsWriterCache();
      try {
        sqlite.close();
      } catch {
        // already closed
      }
      post({
        v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
        id: message.id,
        kind: "closed",
      });
      return;
    }

    if (message.kind === "write-batches") {
      try {
        const result = applyRuntimeEventBatchesNow(message.batches);
        if (result.kind === "committed") {
          post({
            v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
            id: message.id,
            kind: "batches-result",
            outcome: { kind: "committed" },
          });
        } else {
          post({
            v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
            id: message.id,
            kind: "batches-result",
            outcome: { kind: "rolled-back", error: serializeError(result.error) },
          });
        }
      } catch (error) {
        post({
          v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
          id: message.id,
          kind: "batches-result",
          outcome: { kind: "thrown", error: serializeError(error) },
        });
      }
      return;
    }

    if (message.kind === "write-single") {
      try {
        applyThreadRuntimeEventsNow(message.threadId, message.events);
        post({
          v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
          id: message.id,
          kind: "single-result",
          outcome: { kind: "committed" },
        });
      } catch (error) {
        post({
          v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
          id: message.id,
          kind: "single-result",
          outcome: { kind: "failed", error: serializeError(error) },
        });
      }
    }
  });
}

startWorker();
