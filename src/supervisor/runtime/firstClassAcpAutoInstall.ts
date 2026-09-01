import type { AcpRegistryInstallTarget, AgentKind, AgentStatus } from "@/shared/contracts";

/** A missing chat runtime to reconcile: registry artifact + environment. */
export interface FirstClassAcpAutoInstall {
  agentId: string;
  agentKind: AgentKind;
  target: AcpRegistryInstallTarget;
}

export function acpAutoInstallKey(task: FirstClassAcpAutoInstall): string {
  return task.target.kind === "wsl"
    ? `${task.agentId}:wsl:${task.target.distro}`
    : `${task.agentId}:native`;
}

function installTargetFor(status: AgentStatus): AcpRegistryInstallTarget | undefined {
  if (status.envKind !== "wsl") return { kind: "native" };
  return status.envDistro ? { kind: "wsl", distro: status.envDistro } : undefined;
}

function hasInstalledRuntime(status: AgentStatus, presentationMode: "terminal" | "gui"): boolean {
  return Object.values(status.runtimeVariants ?? {}).some(
    (variant) => variant.presentationMode === presentationMode && variant.installed,
  );
}

/**
 * A provider that adopts an ACP registry artifact as its chat runtime
 * (`firstClassAcpRegistryId`) is only half-installed when its CLI is detected
 * but the artifact is not — chat is unavailable until someone installs it. Pick
 * out those environments so the supervisor can reconcile them in the
 * background. Providers whose CLI is absent are skipped: nothing was detected,
 * so there is nothing to complete.
 */
export function collectFirstClassAcpAutoInstalls(input: {
  statuses: readonly AgentStatus[];
  /** Adapter kind → the ACP registry id it adopts as its chat runtime. */
  firstClassRegistryIds: ReadonlyMap<AgentKind, string>;
}): FirstClassAcpAutoInstall[] {
  const tasks = new Map<string, FirstClassAcpAutoInstall>();
  for (const status of input.statuses) {
    const agentId = input.firstClassRegistryIds.get(status.kind);
    if (!agentId) continue;
    if (!hasInstalledRuntime(status, "terminal")) continue;
    if (hasInstalledRuntime(status, "gui")) continue;
    const target = installTargetFor(status);
    if (!target) continue;
    const task = { agentId, agentKind: status.kind, target };
    tasks.set(acpAutoInstallKey(task), task);
  }
  return [...tasks.values()];
}
