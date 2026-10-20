import { readBridge } from "@/renderer/bridge";
import { findStatusForTarget, scopeEnvForStatus } from "@/renderer/utils/acpRegistryAuth";
import type { TerminalLoginCompletionInput } from "../terminalLogin";

/** `dsh web` remains a server after browser sign-in; its exit is not an auth signal. */
export function watchDeepSeekLogin({
  status,
  project,
  onAuthenticated,
}: TerminalLoginCompletionInput): () => void {
  // CLI re-probing is local-shell authority; never use local credentials for a paired host.
  if (
    status.authState === "authenticated" ||
    project.remoteServerId ||
    project.location.remoteServerId
  )
    return () => undefined;
  const target = scopeEnvForStatus(status);
  const distros = target.kind === "wsl" ? [target.distro] : [];
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
  };
  const check = async () => {
    try {
      const scope = { agentKinds: [status.kind], envs: [target] };
      const response = await readBridge().refreshAgentStatuses(distros, scope);
      if (
        !stopped &&
        !response.fromCache &&
        findStatusForTarget(response, status.kind, target)?.authState === "authenticated"
      ) {
        stop();
        onAuthenticated();
        return;
      }
    } catch {
      // A transient discovery failure must leave the browser login available.
    }
    if (!stopped) timer = setTimeout(() => void check(), 3000);
  };
  const deadline = setTimeout(stop, 10 * 60_000);
  timer = setTimeout(() => void check(), 3000);
  return stop;
}
