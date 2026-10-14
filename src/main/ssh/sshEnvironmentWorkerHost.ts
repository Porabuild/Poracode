import {
  SSH_ENVIRONMENT_PROTOCOL_VERSION,
  SSH_ENVIRONMENT_WORKER_CONFIG_ENV,
  sshEnvironmentWorkerConfigSchema,
} from "@/host/ssh/sshEnvironmentProtocol";
import { createSshEnvironmentWorkerService } from "@/host/ssh/sshEnvironmentWorkerService";

/**
 * Utility-process entry for the device-local SSH environment (C3/A5).
 *
 * This file is the only Electron-aware half of the worker: it reads the
 * versioned config from the fork environment, wires `process.parentPort` into
 * the Electron-free service, and exits only after a requested shutdown has
 * joined every child. All SSH mechanics live in the service/manager behind it.
 */

const parentPort = process.parentPort;

function postBestEffort(message: unknown): void {
  try {
    parentPort?.postMessage(message);
  } catch {
    // The parent channel can already be closed during shutdown; a failed post
    // must never escape as an unhandled rejection or mask the exit code.
  }
}

function fail(message: string): never {
  console.error(`[poracode] ssh-environment-worker ${message}`);
  postBestEffort({ v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "fatal", message });
  process.exit(1);
}

if (!parentPort) fail("missing parent port");

const rawConfig = process.env[SSH_ENVIRONMENT_WORKER_CONFIG_ENV];
if (!rawConfig) fail("missing worker configuration");

let config: ReturnType<typeof sshEnvironmentWorkerConfigSchema.parse>;
try {
  config = sshEnvironmentWorkerConfigSchema.parse(JSON.parse(rawConfig) as unknown);
} catch (error) {
  fail(`invalid worker configuration: ${error instanceof Error ? error.message : String(error)}`);
}

const service = createSshEnvironmentWorkerService(config, {
  postMessage: (message) => parentPort.postMessage(message),
  onMessage: (listener) => {
    parentPort.on("message", (event) => listener(event.data));
  },
});

parentPort.postMessage({ v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "ready" });

void service.shutdownRequested
  .then(async () => {
    try {
      // dispose joins every admitted request (including prepare-runtime) and
      // the manager before this resolves; exiting earlier would orphan work.
      await service.dispose();
      process.exit(0);
    } catch (error) {
      postBestEffort({
        v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
        kind: "fatal",
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    // A failure outside the inner catch must still terminate the worker
    // instead of surfacing as an unhandled rejection.
    postBestEffort({
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "fatal",
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });

// No global rejection suppression: the service settles every request through
// its own catch paths, so an escaped rejection is an engine bug. Node's default
// behavior terminates this utility, main observes the exit and rejects every
// pending request instead of hanging.
