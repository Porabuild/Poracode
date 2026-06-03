import type {
  AgentEnvVarAuthMethod,
  AgentOwnedAuthMethod,
  AgentStatus,
  AgentTerminalAuthMethod,
  Project,
  RefreshAgentScopeEnv,
} from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import {
  buildSshProjectLocationsKey,
  buildWslProjectDistrosKey,
  parseSshProjectLocationsKey,
  parseWslProjectDistrosKey,
} from "@/renderer/state/projectKeys";

const ACP_GENERIC_PREFIX = "acp-generic:";

type StatusAuthMethod = NonNullable<AgentStatus["authMethods"]>[number];

export function acpGenericInstanceId(kind: string): string | undefined {
  return kind.startsWith(ACP_GENERIC_PREFIX) ? kind.slice(ACP_GENERIC_PREFIX.length) : undefined;
}

export function registryAdapterKind(agentId: string): string {
  return `${ACP_GENERIC_PREFIX}${agentId}`;
}

export function isEnvVarAuthMethod(
  method: StatusAuthMethod | undefined,
): method is AgentEnvVarAuthMethod {
  return method !== undefined && method.type === "env_var";
}

export function isAgentAuthMethod(
  method: StatusAuthMethod | undefined,
): method is AgentOwnedAuthMethod {
  return (
    method !== undefined &&
    !isEnvVarAuthMethod(method) &&
    method.type !== "terminal" &&
    !("vars" in method) &&
    !/\b(api[-_\s]*key|token|secret)\b/iu.test(`${method.id} ${method.name}`)
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
  envKind?: Exclude<AgentStatus["envKind"], "ssh">;
  wslDistro?: string;
} {
  return {
    ...(status.envKind && status.envKind !== "ssh" ? { envKind: status.envKind } : {}),
    ...(status.envDistro ? { wslDistro: status.envDistro } : {}),
  };
}

export function scopeEnvForStatus(status: AgentStatus): RefreshAgentScopeEnv {
  if (status.envKind === "wsl" && status.envDistro) {
    return { kind: "wsl", distro: status.envDistro };
  }
  if (status.envKind === "ssh" && status.envHost) {
    const project = currentSshProjects().find((candidate) => candidate.host === status.envHost);
    if (project) return { kind: "ssh", host: project.host, path: project.path };
  }
  return { kind: "native" };
}

export function statusUpdateScope(status: AgentStatus): {
  envKind: "windows" | "wsl" | "posix" | "ssh";
  wslDistro?: string;
  sshHost?: string;
} {
  if (status.envKind === "wsl" && status.envDistro) {
    return { envKind: "wsl", wslDistro: status.envDistro };
  }
  if (status.envKind === "ssh" && status.envHost) {
    return { envKind: "ssh", sshHost: status.envHost };
  }
  if (status.envKind === "windows") return { envKind: "windows" };
  return { envKind: "posix" };
}

export function envLabelForStatus(status: AgentStatus): string {
  if (status.envKind === "wsl") return status.envDistro ? `WSL (${status.envDistro})` : "WSL";
  if (status.envKind === "ssh") return status.envHost ? `SSH (${status.envHost})` : "SSH";
  if (status.envKind === "windows") return "Windows";
  return "";
}

export function currentWslDistros(): string[] {
  return parseWslProjectDistrosKey(buildWslProjectDistrosKey(useAppStore.getState().projects));
}

export function currentSshProjects(): Extract<Project["location"], { kind: "ssh" }>[] {
  return parseSshProjectLocationsKey(buildSshProjectLocationsKey(useAppStore.getState().projects));
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
  if (status.envKind === "ssh" && status.envHost) {
    return projects.find(
      (project) => project.location.kind === "ssh" && project.location.host === status.envHost,
    );
  }
  return undefined;
}
