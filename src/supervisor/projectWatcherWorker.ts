import { isAbsolute } from "node:path";
import { parentPort } from "node:worker_threads";
import { GIT_HELPER_PROTOCOL_VERSION } from "./git/gitNativeHelperProtocol.ts";
import type {
  ProjectWatchCommand,
  ProjectWatchEvent,
  ProjectWatchMessage,
} from "./projectWatcherProtocol.ts";
import { ProjectWatchSubscription } from "./projectWatcherWorkerRuntime.ts";

if (!parentPort) throw new Error("Project watcher requires a worker message port");
const port = parentPort;
const subscriptions = new Map<number, ProjectWatchSubscription>();
const emit = (message: ProjectWatchEvent) => {
  port.postMessage({
    protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
    ...message,
  } satisfies ProjectWatchMessage);
};

port.on("message", (command: ProjectWatchCommand) => {
  if (
    !command ||
    command.protocolVersion !== GIT_HELPER_PROTOCOL_VERSION ||
    !Number.isSafeInteger(command.id) ||
    command.id <= 0 ||
    (command.kind !== "watch" && command.kind !== "unwatch") ||
    (command.kind === "watch" &&
      (typeof command.rootPath !== "string" ||
        !isAbsolute(command.rootPath) ||
        command.rootPath.includes("\0")))
  ) {
    emit({ id: 0, kind: "error", error: "Incompatible or invalid project watch command" });
    port.close();
    for (const subscription of subscriptions.values()) subscription.close();
    return;
  }
  subscriptions.get(command.id)?.close();
  subscriptions.delete(command.id);
  if (command.kind === "unwatch") {
    emit({ id: command.id, kind: "unwatched" });
    return;
  }
  const subscription = new ProjectWatchSubscription(command.id, command.rootPath, emit);
  try {
    subscription.start();
    subscriptions.set(command.id, subscription);
    emit({ id: command.id, kind: "ready" });
  } catch (error) {
    subscription.close();
    emit({ id: command.id, kind: "error", error: String(error) });
  }
});

port.on("close", () => {
  for (const subscription of subscriptions.values()) subscription.close();
  subscriptions.clear();
});

emit({ id: 0, kind: "ready" });
