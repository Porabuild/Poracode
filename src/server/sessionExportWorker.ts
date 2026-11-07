import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import {
  SESSION_EXPORT_WORKER_VERSION,
  sessionExportContinueSchema,
  sessionExportInitializeSchema,
  sessionExportWorkerMessageSchema,
} from "./sessionExportProtocol";
import { writeSessionExportSnapshot } from "./sessionExportSnapshot";

if (isMainThread) {
  if (!process.send) throw new Error("Session export requires host IPC.");
  const retire = () => {
    process.kill(process.pid, "SIGKILL");
  };
  process.once("disconnect", retire);
  let worker: Worker | undefined;
  let initialized = false;
  let exportId: string | undefined;
  let continued = false;
  let outputEnded = false;
  let workerExited = false;
  let complete = false;
  let sending = Promise.resolve();
  const finish = () => {
    if (!outputEnded || !workerExited) return;
    void sending.then(() => {
      process.stdout.write("", () => {
        process.off("disconnect", retire);
        if (process.connected) process.disconnect!();
        process.exit(complete ? 0 : 1);
      });
    }, retire);
  };
  process.on("message", (frame: unknown) => {
    if (worker) {
      const command = sessionExportContinueSchema.safeParse(frame);
      if (!command.success || command.data.exportId !== exportId || continued) return retire();
      continued = true;
      worker.postMessage(command.data);
      return;
    }
    if (initialized) return retire();
    initialized = true;
    const input = sessionExportInitializeSchema.safeParse(frame);
    if (!input.success) return retire();
    exportId = input.data.exportId;
    worker = new Worker(process.argv[1]!, { workerData: input.data, stdout: true });
    worker.stdout.pipe(process.stdout, { end: false });
    worker.stdout.once("end", () => {
      outputEnded = true;
      finish();
    });
    worker.on("message", (message: unknown) => {
      const parsed = sessionExportWorkerMessageSchema.safeParse(message);
      if (!parsed.success || parsed.data.exportId !== input.data.exportId) return retire();
      if (parsed.data.kind === "complete") complete = true;
      sending = sending.then(
        () =>
          new Promise<void>((resolve, reject) => {
            if (!process.connected) return reject(new Error("Export owner disconnected."));
            process.send!(parsed.data, (error) => (error ? reject(error) : resolve()));
          }),
      );
      void sending.catch(retire);
    });
    worker.once("error", retire);
    worker.once("exit", (code) => {
      workerExited = true;
      if (code !== 0) complete = false;
      finish();
    });
  });
} else {
  const input = sessionExportInitializeSchema.parse(workerData);
  if (!parentPort) throw new Error("Export snapshot requires its owning process.");
  const port = parentPort;
  const admission = Promise.withResolvers<void>();
  port.once("message", (message: unknown) => {
    const command = sessionExportContinueSchema.parse(message);
    if (command.exportId !== input.exportId) throw new Error("Export identity mismatch.");
    admission.resolve();
  });
  const identity = { version: SESSION_EXPORT_WORKER_VERSION, exportId: input.exportId };
  void writeSessionExportSnapshot(
    input,
    async () => {
      port.postMessage({ ...identity, kind: "ready" });
      await admission.promise;
    },
    (bytes) =>
      new Promise<void>((resolve, reject) => {
        process.stdout.write(bytes, (error) => (error ? reject(error) : resolve()));
      }),
  )
    .then(
      (result) => port.postMessage({ ...identity, kind: "complete", ...result }),
      () => {
        process.exitCode = 1;
        port.postMessage({ ...identity, kind: "error" });
      },
    )
    .finally(() => port.close());
}
