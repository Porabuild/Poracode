import { parentPort, workerData } from "node:worker_threads";
import { initReadOnlyDatabase } from "./connection";
import {
  databaseReadOperations,
  executeDatabaseRead,
  type DatabaseReadOperation,
} from "./databaseReadOperations";
import {
  DATABASE_READ_WORKER_PROTOCOL_VERSION,
  databaseImagePreviewSnapshotSchema,
} from "./databaseReadProtocol";
import { encodeDatabaseReadFailure } from "./databaseReadErrors";
import { seedImagePreviews, setImagePreviewGenerator } from "../remote/server/imagePreview";

/** SQLite and projection dependencies are loaded only in this worker isolate. */
export async function startDatabaseReadWorkerThread(): Promise<void> {
  if (!parentPort || workerData?.version !== DATABASE_READ_WORKER_PROTOCOL_VERSION) {
    throw new Error("Database read worker protocol is incompatible.");
  }
  const port = parentPort;
  initReadOnlyDatabase(workerData.dbPath);
  if (workerData.imagePreviews === true) {
    const { generateImagePreview } = await import("../remote/server/imagePreviewGenerator");
    setImagePreviewGenerator(generateImagePreview, (entry) => {
      port.postMessage({
        version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
        kind: "image-preview",
        entry,
      });
    });
  }
  port.on(
    "message",
    (request: {
      version: number;
      id: number;
      operation: DatabaseReadOperation;
      args: never;
      imagePreviews?: unknown;
    }) => {
      try {
        if (
          request.version !== DATABASE_READ_WORKER_PROTOCOL_VERSION ||
          !Object.hasOwn(databaseReadOperations, request.operation)
        ) {
          throw new Error("Database read worker request is incompatible.");
        }
        if (request.imagePreviews !== undefined) {
          if (workerData.imagePreviews !== true) throw new Error("Image previews are disabled.");
          seedImagePreviews(databaseImagePreviewSnapshotSchema.parse(request.imagePreviews));
        }
        const value = executeDatabaseRead(request.operation, request.args);
        port.postMessage({
          version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
          kind: "result",
          id: request.id,
          value,
        });
      } catch (error) {
        const failure = encodeDatabaseReadFailure(error);
        port.postMessage({
          version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
          kind: "error",
          id: request.id,
          error: failure,
        });
      }
    },
  );
  port.postMessage({ version: DATABASE_READ_WORKER_PROTOCOL_VERSION, kind: "ready" });
}
