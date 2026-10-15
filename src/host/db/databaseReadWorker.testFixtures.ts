import { startDatabaseReadProcess } from "./databaseReadProcess";
import { existsSync, writeFileSync } from "node:fs";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { getSqlite, initReadOnlyDatabase } from "./connection";
import { executeDatabaseRead, type DatabaseReadOperation } from "./databaseReadOperations";
import { encodeDatabaseReadFailure } from "./databaseReadErrors";
import { DATABASE_READ_WORKER_PROTOCOL_VERSION } from "./databaseReadProtocol";

if (isMainThread) {
  startDatabaseReadProcess(process.argv[1]!);
} else {
  initReadOnlyDatabase(workerData.dbPath);
  const port = parentPort!;
  getSqlite().function("block_read_fixture", (ms: number) => {
    const holdPath = `${workerData.dbPath}.hold-slow-query`;
    const signal = new Int32Array(new SharedArrayBuffer(4));
    if (existsSync(holdPath)) {
      while (existsSync(holdPath)) Atomics.wait(signal, 0, 0, 10);
    } else {
      Atomics.wait(signal, 0, 0, ms);
    }
    return 1;
  });
  port.on("message", (request: { id: number; operation: DatabaseReadOperation; args: never }) => {
    try {
      const threadId = request.args[0] as string;
      if (threadId === "slow" || threadId === "never") {
        // A real synchronous SQLite call, deliberately slow only in this worker.
        if (threadId === "slow") {
          writeFileSync(`${workerData.dbPath}.slow-query-active`, "native query started");
          getSqlite().prepare("SELECT block_read_fixture(1000)").get();
        } else {
          writeFileSync(`${workerData.dbPath}.query-active`, "native query started");
          getSqlite()
            .prepare(
              "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 100000) SELECT COUNT(*) FROM n a CROSS JOIN n b",
            )
            .get();
        }
      }
      const value = executeDatabaseRead(request.operation, request.args);
      port.postMessage({
        version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
        kind: "result",
        id: request.id,
        value,
      });
    } catch (error) {
      port.postMessage({
        version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
        kind: "error",
        id: request.id,
        error: encodeDatabaseReadFailure(error),
      });
    }
  });
  port.postMessage({ version: DATABASE_READ_WORKER_PROTOCOL_VERSION, kind: "ready" });
}
