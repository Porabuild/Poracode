import type { AgentCapability } from "@/shared/contracts";
import {
  filterCrossagentCapabilities,
  isCrossagentProviderEnabled,
  presentedCrossagentCapabilities,
  type CrossagentVisibilitySettings,
} from "@/shared/crossagentVisibility";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { resolveSubagentExecution } from "./types";

export type { CrossagentVisibilitySettings } from "@/shared/crossagentVisibility";
export {
  crossagentVisibilityKey,
  filterCrossagentCapabilities,
  globalVisibleCrossagentCapabilities,
  isCrossagentProviderEnabled,
  presentedCrossagentCapabilities,
} from "@/shared/crossagentVisibility";

/** Resolve the exact settings-filtered capability surface accepted at spawn time. */
export function visibleCrossagentCapabilitiesForAdapter(
  adapter: AgentAdapter,
  cachedCapabilities: AgentCapability | undefined,
  settings: CrossagentVisibilitySettings,
): AgentCapability | null {
  if (!isCrossagentProviderEnabled(adapter.kind, settings)) return null;
  const execution = resolveSubagentExecution(adapter);
  if (!execution) return null;
  const base = cachedCapabilities ?? adapter.capabilities;
  const presented = presentedCrossagentCapabilities(adapter.kind, execution, base);
  return filterCrossagentCapabilities(adapter.kind, execution, presented, settings);
}
