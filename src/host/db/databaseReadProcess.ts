import { Worker } from "node:worker_threads";
import { z } from "zod";
import { DATABASE_READ_WORKER_PROTOCOL_VERSION } from "./databaseReadVersion";

const initializationSchema = z.strictObject({
  kind: z.literal("initialize"),
  version: z.literal(DATABASE_READ_WORKER_PROTOCOL_VERSION),
  dbPath: z.string().min(1),
  imagePreviews: z.boolean().optional(),
});

/**
 * Keep the child control loop free while native SQLite runs in its thread.
 * The host can kill the whole read-only process at a deadline; IPC disconnect
 * also kills it immediately, including a query orphaned by a crashed host.
 */
export function startDatabaseReadProcess(entryPath: string): void {
  if (!process.send) throw new Error("Database reader requires host IPC.");
  const retire = () => process.kill(process.pid, "SIGKILL");
  process.once("disconnect", retire);
  let worker: Worker | null = null;
  process.on("message", (message: unknown) => {
    if (worker) {
      worker.postMessage(message);
      return;
    }
    const parsed = initializationSchema.safeParse(message);
    if (!parsed.success) {
      retire();
      return;
    }
    worker = new Worker(entryPath, {
      workerData: {
        version: parsed.data.version,
        dbPath: parsed.data.dbPath,
        imagePreviews: parsed.data.imagePreviews === true,
      },
    });
    worker.on("message", (frame: unknown) => {
      if (!process.connected) {
        retire();
        return;
      }
      process.send!(frame as object, (error) => {
        if (error) retire();
      });
    });
    worker.once("error", retire);
    worker.once("exit", retire);
  });
}
