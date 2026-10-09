import type { AgentInstanceConfig, AgentInstanceConfigMap } from "@/shared/contracts";

/** Pure provider-owned eligibility for usage profiles, without UI bootstrap effects. */
export interface UsageProfileSupport {
  driver: string;
  labelPrefix: string;
  accepts(instance: AgentInstanceConfig): boolean;
  /** Configuration profiles can share a quota owner. Undefined means unavailable,
   * never permission to display another account's quota as a fallback. */
  providerId?(instance: AgentInstanceConfig, instances: AgentInstanceConfigMap): string | undefined;
}
