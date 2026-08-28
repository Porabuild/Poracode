import type { AgentHookPluginEnv, AgentStatus, Project } from "./contracts";
import { agentEnvForStatus, agentEnvKey } from "./machines";

export function hookEnvKey(env: AgentHookPluginEnv): string {
  return agentEnvKey(env);
}

export function hookEnvForProject(project: Project): AgentHookPluginEnv {
  return project.location.kind === "wsl"
    ? { kind: "wsl", distro: project.location.distro }
    : { kind: "native" };
}

export function hookEnvForAgentStatus(status: AgentStatus): AgentHookPluginEnv {
  return agentEnvForStatus(status);
}
