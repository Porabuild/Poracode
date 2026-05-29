import type { AgentHookPluginEnv, AgentStatus, Project } from "./contracts";

export function hookEnvKey(env: AgentHookPluginEnv): string {
  return env.kind === "wsl" ? `wsl:${env.distro}` : "native";
}

export function hookEnvLabel(env: AgentHookPluginEnv): string {
  return env.kind === "wsl" ? `WSL · ${env.distro}` : "Native";
}

export function hookEnvForProject(project: Project): AgentHookPluginEnv {
  return project.location.kind === "wsl"
    ? { kind: "wsl", distro: project.location.distro }
    : { kind: "native" };
}

export function hookEnvForAgentStatus(status: AgentStatus): AgentHookPluginEnv {
  if (status.envKind === "wsl" && status.envDistro) {
    return { kind: "wsl", distro: status.envDistro };
  }
  return { kind: "native" };
}
