import { isNewerVersion } from "@/shared/agents/updateResolver";
import type { AgentStatus } from "@/shared/contracts";
import { findStatusForTarget, scopeEnvForStatus } from "@/renderer/utils/acpRegistryAuth";
import type { CombinedRuntimeUpdate } from "./providerComposer";
import type { AgentManagementHost } from "./settings/agentManagementHost";

export interface RuntimeUpdateTarget {
  status: AgentStatus;
  runtime: CombinedRuntimeUpdate;
  version: string;
}

/** Verify one environment. Concurrent discovery can still serve the last accepted
 * inventory; re-probe just the unconfirmed targets once, never rerun an installer. */
export async function verifyRuntimeUpdates(
  host: AgentManagementHost,
  targets: readonly RuntimeUpdateTarget[],
  runtimesFor: (status: AgentStatus) => readonly CombinedRuntimeUpdate[],
): Promise<Map<RuntimeUpdateTarget, string>> {
  const verified = new Map<RuntimeUpdateTarget, string>();
  if (!targets.length) return verified;
  const env = scopeEnvForStatus(targets[0]!.status);
  const distros = env.kind === "wsl" ? [env.distro] : [];
  async function check(pending: readonly RuntimeUpdateTarget[], rediscover: boolean) {
    const scope = {
      agentKinds: [...new Set(pending.map(({ status }) => status.kind))],
      envs: [env],
    };
    const statuses = rediscover
      ? await host.rediscoverAgents(distros, scope)
      : await host.refreshAgentStatuses(distros, scope);
    for (const target of pending) {
      const status = findStatusForTarget(statuses, target.status.kind, env);
      const detected =
        status && runtimesFor(status).find((entry) => entry.id === target.runtime.id);
      if (!detected?.installed || !detected.installedVersion) continue;
      const matches =
        target.runtime.channel.kind === "acp-registry"
          ? detected.installedVersion === target.version
          : !isNewerVersion(target.version, detected.installedVersion);
      if (matches) verified.set(target, detected.installedVersion);
    }
  }
  await check(
    targets,
    targets.some(({ runtime }) => runtime.channel.kind === "npm-package"),
  );
  const missing = targets.filter((target) => !verified.has(target));
  if (missing.length) await check(missing, true);
  return verified;
}
