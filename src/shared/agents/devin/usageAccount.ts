import { agentProfileKind } from "../../contracts/agentProfiles";
import type { AgentInstanceConfig, AgentInstanceConfigMap } from "../../contracts/agentInstance";
import { parseDevinProfileConfig } from "./profileConfig";
import { devinProfileAcceptsDependents } from "./profileDependencies";

/** Native user quota belongs to the declared login root, regardless of persona,
 * selected org or launch config. References share their owner's single meter. */
export function devinUsageAccountId(
  instance: AgentInstanceConfig,
  instances: AgentInstanceConfigMap,
): string | undefined {
  if (instance.driver !== "devin" || instance.enabled === false) return undefined;
  const parsed = parseDevinProfileConfig(instance.config);
  if (parsed.status !== "ok") return undefined;
  const auth = parsed.config.auth;
  if (auth.kind === "native-default") return "devin";
  if (auth.kind === "isolated-owner") return agentProfileKind("devin", instance.id);
  const owner = instances[auth.ownerId];
  return owner &&
    owner.id !== instance.id &&
    owner.driver === "devin" &&
    owner.enabled !== false &&
    devinProfileAcceptsDependents(owner)
    ? agentProfileKind("devin", owner.id)
    : undefined;
}
