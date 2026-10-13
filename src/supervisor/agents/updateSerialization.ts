import type { AgentStatus } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { AGENT_UPDATE_QUEUE_WAIT_TIMEOUT_MS } from "@/shared/agents/updatePolicy";
import type { AgentEnvContext, AgentUpdaterCommand } from "./base";

const pendingUpdates = new Map<string, Promise<void>>();

function environmentKey(env: AgentEnvContext): string[] {
  return env.envKind === "wsl" ? ["wsl", env.wslDistro?.toLowerCase() ?? ""] : ["native"];
}

async function serialize<T>(key: string, waitDeadline: number, run: () => Promise<T>): Promise<T> {
  const previous = pendingUpdates.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // An expired waiter still links its successors to the active predecessor.
  const pending = previous.then(() => gate);
  pendingUpdates.set(key, pending);
  void pending.then(() => {
    if (pendingUpdates.get(key) === pending) pendingUpdates.delete(key);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      previous,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(msg("agent.updateQueueTimeout"))),
          Math.max(0, waitDeadline - Date.now()),
        );
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    if (Date.now() >= waitDeadline) throw new Error(msg("agent.updateQueueTimeout"));
    return await run();
  } finally {
    clearTimeout(timer);
    release();
  }
}

/** Protect both the stable launcher and its target through self-update, verification and fallback. */
export function runSerializedAgentUpdate<T>(
  status: AgentStatus,
  env: AgentEnvContext,
  run: (waitDeadline: number) => Promise<T>,
  installPath?: string,
): Promise<T> {
  const executables = [
    ...new Set(
      [
        status.executablePath ?? status.kind,
        installPath ?? status.executablePath ?? status.kind,
      ].map((path) =>
        env.envKind === "windows" ? path.replaceAll("\\", "/").toLowerCase() : path,
      ),
    ),
  ].sort();
  const waitDeadline = Date.now() + AGENT_UPDATE_QUEUE_WAIT_TIMEOUT_MS;
  // A common acquisition order prevents deadlocks between launcher aliases.
  function acquire(index: number): Promise<T> {
    const executable = executables[index];
    if (executable === undefined) return run(waitDeadline);
    const key = JSON.stringify([environmentKey(env), "executable", executable]);
    return serialize(key, waitDeadline, () => acquire(index + 1));
  }
  return acquire(0);
}

/** Only actual package-manager writes contend; independent native updaters overlap. */
export function runSerializedUpdateCommand<T>(
  command: AgentUpdaterCommand,
  env: AgentEnvContext,
  waitDeadline: number,
  run: () => Promise<T>,
): Promise<T> {
  if (command.strategy === "built-in" || command.strategy === "installer") return run();
  return serialize(
    JSON.stringify([environmentKey(env), "package-manager", command.strategy]),
    waitDeadline,
    run,
  );
}
