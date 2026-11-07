import { readBridge } from "@/renderer/bridge";
import { projectHostRunsOnThisMachine } from "@/renderer/state/hostLocality";
import { findStatusForTarget, scopeEnvForStatus } from "@/renderer/utils/acpRegistryAuth";
import type { TerminalLoginCompletionInput } from "../terminalLogin";

/** `dsh web` remains a server after browser sign-in; its exit is not an auth signal. */
export function watchDeepSeekLogin({
  status,
  project,
  onAuthenticated,
}: TerminalLoginCompletionInput): () => void {
  // CLI re-probing is local-shell authority: only a host that runs on this
  // machine can be re-probed here. Never use local credentials to complete
  // another host's login; its dock refresh re-reads that host's own inventory.
  if (status.authState === "authenticated" || !projectHostRunsOnThisMachine(project))
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
