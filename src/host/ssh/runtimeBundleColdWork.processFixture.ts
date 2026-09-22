// Real child-process fixture for the off-main SSH runtime archive build. It is
// never imported by a production entry point; it drives the same worker service
// the Electron utility process hosts, over plain Node IPC.
import {
  SSH_ENVIRONMENT_PROTOCOL_VERSION,
  type SshEnvironmentWorkerConfig,
} from "./sshEnvironmentProtocol";
import { createSshEnvironmentWorkerService } from "./sshEnvironmentWorkerService";

const rawConfig = process.argv[2];
if (!rawConfig) throw new Error("Missing SSH worker fixture configuration.");
const config = JSON.parse(rawConfig) as SshEnvironmentWorkerConfig;

const service = createSshEnvironmentWorkerService(config, {
  postMessage: (message) => process.send?.(message),
  onMessage: (listener) => {
    process.on("message", (message) => listener(message));
  },
});

process.send?.({ v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "ready" });

void service.shutdownRequested.then(async () => {
  await service.dispose();
  process.exit(0);
});
