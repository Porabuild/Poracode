import { startDatabaseReadProcess } from "./databaseReadProcess";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { initReadOnlyDatabase } from "./connection";
import {
  databaseReadOperations,
  executeDatabaseRead,
  type DatabaseReadOperation,
} from "./databaseReadOperations";
import { DATABASE_READ_WORKER_PROTOCOL_VERSION } from "./databaseReadProtocol";
import { encodeDatabaseReadFailure } from "./databaseReadErrors";

if (isMainThread) {
  startDatabaseReadProcess(process.argv[1]!);
} else {
  if (!parentPort || workerData?.version !== DATABASE_READ_WORKER_PROTOCOL_VERSION) {
    throw new Error("Database read worker protocol is incompatible.");
  }
  initReadOnlyDatabase(workerData.dbPath);
  const port = parentPort;
  port.on(
    "message",
    (request: { version: number; id: number; operation: DatabaseReadOperation; args: never }) => {
      try {
        if (
          request.version !== DATABASE_READ_WORKER_PROTOCOL_VERSION ||
          !Object.hasOwn(databaseReadOperations, request.operation)
        ) {
          throw new Error("Database read worker request is incompatible.");
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
