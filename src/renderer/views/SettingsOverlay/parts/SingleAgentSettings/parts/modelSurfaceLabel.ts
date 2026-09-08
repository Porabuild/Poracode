import type { AgentStatus } from "@/shared/contracts";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu";
import { providerLabelForPresentation } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import type { NativeAgentRuntimeSlots } from "../../nativeAgentRuntimes";

/**
 * Title for one model-visibility row when an agent exposes several model
 * surfaces. The composer picker may deliberately keep a surface's label
 * canonical (`showRuntimeLabelInPicker: false`) or omit the runtime badge for
 * terminal surfaces, but sibling Settings rows still need to be told apart, so
 * this prefers the runtime's own declared label, then the Settings runtime
 * slot badge, and only then the picker label.
 */
export function modelSurfaceLabel(
  provider: ProviderModelMenuProvider,
  agent: AgentStatus,
  runtimeSlots: NativeAgentRuntimeSlots | undefined,
): string {
  const variantId = provider.runtimeVariant;
  const runtimeLabel = variantId
    ? (agent.runtimeVariants?.[variantId]?.capabilities.runtimeLabel ??
      runtimeSlots?.runtimes.find((slot) => slot.id === variantId)?.badge)
    : undefined;
  if (!runtimeLabel) return providerLabelForPresentation(provider);
  return agent.label.endsWith(` ${runtimeLabel}`) ? agent.label : `${agent.label} ${runtimeLabel}`;
}
