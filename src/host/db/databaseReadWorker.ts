import { isMainThread } from "node:worker_threads";
import { startDatabaseReadProcess } from "./databaseReadProcess";

if (isMainThread) {
  startDatabaseReadProcess(process.argv[1]!);
} else {
  // Keep DB, projection and image dependencies out of the killable IPC loop.
  void import("./databaseReadWorkerThread").then(({ startDatabaseReadWorkerThread }) =>
    startDatabaseReadWorkerThread(),
  );
}
