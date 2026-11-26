import type {
  AgentEnvVarAuthMethod,
  AgentOwnedAuthMethod,
  AgentStatus,
  AgentStatusesResponse,
  AgentTerminalAuthMethod,
  Project,
  RefreshAgentScopeEnv,
} from "@/shared/contracts";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useAppStore } from "@/renderer/state/appStore";
import { buildWslProjectDistrosKey, parseWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { localEnvLabel } from "@/renderer/utils/machineLabels";

type StatusAuthMethod = NonNullable<AgentStatus["authMethods"]>[number];

export function shouldPreferTerminalLogin(status: AgentStatus): boolean {
  return status.preferTerminalLogin === true && Boolean(status.loginCommand);
}

export function isEnvVarAuthMethod(
  method: StatusAuthMethod | undefined,
): method is AgentEnvVarAuthMethod {
  return method !== undefined && method.type === "env_var";
}

export function isAgentAuthMethod(
  method: StatusAuthMethod | undefined,
): method is AgentOwnedAuthMethod {
  // Name matching "API key" is not enough to hide a method: some agents
  // advertise a real `authenticate()` API-key flow with no env-var twin.
  // Methods that carry `vars` still belong on the credential form, not here.
  return (
    method !== undefined &&
    !isEnvVarAuthMethod(method) &&
    method.type !== "terminal" &&
    !("vars" in method)
  );
}

export function isTerminalAuthMethod(
  method: StatusAuthMethod | undefined,
): method is AgentTerminalAuthMethod {
  return method !== undefined && method.type === "terminal";
}

export function findAgentAuthMethodForStatus(
  status: AgentStatus | undefined,
): AgentOwnedAuthMethod | undefined {
  return status?.authMethods?.find(isAgentAuthMethod);
}

export function findTerminalAuthMethodForStatus(
  status: AgentStatus | undefined,
): AgentTerminalAuthMethod | undefined {
  return status?.authMethods?.find(isTerminalAuthMethod);
}

/** First agent-owned auth method advertised by any env for the same install. */
export function findAgentAuthMethodInStatuses(
  statuses: readonly AgentStatus[],
): AgentOwnedAuthMethod | undefined {
  for (const status of statuses) {
    const method = status.authMethods?.find(isAgentAuthMethod);
    if (method) return method;
  }
  return undefined;
}

/** First terminal auth method advertised by any env for the same install. */
export function findTerminalAuthMethodInStatuses(
  statuses: readonly AgentStatus[],
): AgentTerminalAuthMethod | undefined {
  for (const status of statuses) {
    const method = findTerminalAuthMethodForStatus(status);
    if (method) return method;
  }
  return undefined;
}

export function agentAuthTarget(status: AgentStatus): {
  envKind?: AgentStatus["envKind"];
  wslDistro?: string;
} {
  return {
    ...(status.envKind ? { envKind: status.envKind } : {}),
    ...(status.envDistro ? { wslDistro: status.envDistro } : {}),
  };
}

export function scopeEnvForStatus(status: AgentStatus): RefreshAgentScopeEnv {
  return status.envKind === "wsl" && status.envDistro
    ? { kind: "wsl", distro: status.envDistro }
    : { kind: "native" };
}

/** Pick one kind's status out of a refresh response for a native/WSL target. */
export function findStatusForTarget(
  response: Pick<AgentStatusesResponse, "windows" | "wsl"> | undefined,
  kind: string,
  target: RefreshAgentScopeEnv,
): AgentStatus | undefined {
  if (!response) return undefined;
  return target.kind === "wsl"
    ? response.wsl.find(
        (candidate) => candidate.kind === kind && candidate.envDistro === target.distro,
      )
    : response.windows.find((candidate) => candidate.kind === kind);
}

export function statusUpdateScope(status: AgentStatus): {
  envKind: "windows" | "wsl" | "posix";
  wslDistro?: string;
} {
  if (status.envKind === "wsl" && status.envDistro) {
    return { envKind: "wsl", wslDistro: status.envDistro };
  }
  if (status.envKind === "windows") return { envKind: "windows" };
  return { envKind: "posix" };
}

export function envLabelForStatus(status: AgentStatus): string {
  if (status.envKind === "wsl") {
    return status.envDistro ? localEnvLabel({ kind: "wsl", distro: status.envDistro }) : "WSL";
  }
  if (status.envKind === "windows") return localEnvLabel({ kind: "native" });
  return "";
}

export function currentWslDistros(): string[] {
  return parseWslProjectDistrosKey(buildWslProjectDistrosKey(useAppStore.getState().projects));
}

export function findProjectForStatus(
  status: AgentStatus | undefined,
  projects: readonly Project[],
): Project | undefined {
  if (!status) return undefined;
  if (status.envKind === "wsl" && status.envDistro) {
    return projects.find(
      (project) => project.location.kind === "wsl" && project.location.distro === status.envDistro,
    );
  }
  if (status.envKind === "windows") {
    return projects.find((project) => project.location.kind === "windows");
  }
  return undefined;
}

function projectRemoteOwnerId(project: Project): string | undefined {
  return project.remoteServerId ?? project.location.remoteServerId;
}

/**
 * Resolves a Project belonging to `machine` for home-rooted install/login
 * shells. Returns a real matching project when one exists, or synthesizes a
 * home-backed location pinned to `machine`'s host/OS/WSL distro when none does
 * (or when other projects belong to a different host or environment).
 */
export function findProjectForMachine(
  machine: MachineDescriptor,
  projects: readonly Project[],
  isLocalWindows: boolean,
  machineStatuses: readonly AgentStatus[] = [],
  options: { allowHomeWithoutProject?: boolean } = {},
): Project | undefined {
  const remoteDesktopId = machine.ref.host === "remote" ? machine.ref.desktopId : machine.desktopId;
  if (remoteDesktopId !== undefined) {
    const desktopId = remoteDesktopId;
    const remoteProjects = projects.filter(
      (project) => projectRemoteOwnerId(project) === desktopId,
    );
    if (machine.ref.env.kind === "wsl") {
      const distro = machine.ref.env.distro;
      const existing = remoteProjects.find(
        (project) => project.location.kind === "wsl" && project.location.distro === distro,
      );
      if (existing) return existing;
      return {
        id: `__machine__:remote:${desktopId}:wsl:${distro}`,
        name: distro,
        disabled: false,
        createdAt: new Date(0).toISOString(),
        remoteServerId: desktopId,
        location: {
          kind: "wsl",
          distro,
          linuxPath: "~",
          uncPath: `\\\\wsl.localhost\\${distro}`,
          remoteServerId: desktopId,
        },
      };
    }
    const isRemoteWindows =
      machine.platform === "win32" ||
      machineStatuses.some((status) => status.envKind === "windows") ||
      remoteProjects.some((project) => project.location.kind === "windows");
    const targetKind = isRemoteWindows ? "windows" : "posix";
    const existing = remoteProjects.find((project) => project.location.kind === targetKind);
    if (existing) return existing;
    return {
      id: `__machine__:remote:${desktopId}:${targetKind}`,
      name: machine.label,
      disabled: false,
      createdAt: new Date(0).toISOString(),
      remoteServerId: desktopId,
      location: isRemoteWindows
        ? { kind: "windows", path: ".", remoteServerId: desktopId }
        : { kind: "posix", path: "~", remoteServerId: desktopId },
    };
  }

  const localProjects = projects.filter((project) => projectRemoteOwnerId(project) === undefined);
  if (machine.ref.env.kind === "wsl") {
    const distro = machine.ref.env.distro;
    const existing = localProjects.find(
      (project) => project.location.kind === "wsl" && project.location.distro === distro,
    );
    if (existing) return existing;
    return {
      id: `__machine__:wsl:${distro}`,
      name: distro,
      disabled: false,
      createdAt: new Date(0).toISOString(),
      location: {
        kind: "wsl",
        distro,
        linuxPath: "~",
        uncPath: `\\\\wsl.localhost\\${distro}`,
      },
    };
  }

  if (isLocalWindows) {
    const existing = localProjects.find((project) => project.location.kind === "windows");
    if (existing) return existing;
    if (projects.length > 0 || options.allowHomeWithoutProject) {
      return {
        id: "__machine__:windows",
        name: "Windows",
        disabled: false,
        createdAt: new Date(0).toISOString(),
        location: { kind: "windows", path: "." },
      };
    }
    return undefined;
  }

  const existingPosix = localProjects.find((project) => project.location.kind === "posix");
  if (existingPosix) return existingPosix;
  if (projects.length > 0 || options.allowHomeWithoutProject) {
    return {
      id: "__machine__:posix",
      name: machine.label,
      disabled: false,
      createdAt: new Date(0).toISOString(),
      location: { kind: "posix", path: "~" },
    };
  }
  return undefined;
}
