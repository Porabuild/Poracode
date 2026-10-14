import type { AgentInstanceConfig } from "../../contracts/agentInstance";
import { parseDevinProfileConfig } from "./profileConfig";

export function devinProfileDependencies(instance: AgentInstanceConfig): readonly string[] {
  const parsed = parseDevinProfileConfig(instance.config);
  return parsed.status === "ok" && parsed.config.auth.kind === "owner-reference"
    ? [parsed.config.auth.ownerId]
    : [];
}

export function devinProfileAcceptsDependents(instance: AgentInstanceConfig): boolean {
  const parsed = parseDevinProfileConfig(instance.config);
  return parsed.status === "ok" && parsed.config.auth.kind === "isolated-owner";
}
