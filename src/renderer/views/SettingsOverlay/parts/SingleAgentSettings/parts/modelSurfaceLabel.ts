import { msg } from "@lingui/core/macro";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu";
import { providerLabelForPresentation } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { i18n } from "@/renderer/i18n/i18n";
import type { NativeAgentRuntimeSlots } from "../../nativeAgentRuntimes";

/**
 * Localized word naming a presentation surface, for sibling rows no runtime
 * labels. Resolved per call so it follows the active locale.
 */
function presentationModeLabel(mode: ThreadPresentationMode): string {
  return mode === "gui" ? i18n._(msg`Chat`) : i18n._(msg`Terminal`);
}

/**
 * Title for one model-visibility row when an agent exposes several model
 * surfaces. The composer picker may deliberately keep a surface's label
 * canonical (`showRuntimeLabelInPicker: false`) or omit the runtime badge for
 * terminal surfaces, but sibling Settings rows still need to be told apart, so
 * this prefers the runtime's own declared label, then the Settings runtime
 * slot badge, and only then the picker label. A surface no runtime names — one
 * of several distinct per-presentation catalogs — falls back to a localized
 * presentation-mode word, but only when the picker label did not already
 * qualify the surface (a declared `runtimeLabel` or a legacy terminal badge).
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
  if (runtimeLabel) {
    return agent.label.endsWith(` ${runtimeLabel}`)
      ? agent.label
      : `${agent.label} ${runtimeLabel}`;
  }
  const label = providerLabelForPresentation(provider);
  if (provider.presentationMode) {
    const modeLabel = presentationModeLabel(provider.presentationMode);
    if (label === (provider.label ?? provider.kind) && !label.endsWith(` ${modeLabel}`)) {
      return `${label} ${modeLabel}`;
    }
  }
  return label;
}
