import type { ThreadPresentationMode } from "@/shared/contracts";
import { getProviderManifest } from "@/renderer/components/providers/providerManifest";

type ProviderIdentityInput = {
  kind: string;
  label?: string;
  presentationMode?: ThreadPresentationMode;
  runtimeVariant?: string;
  modelPickerKey?: string;
  hiddenModelsKey?: string;
  /** Adapter-declared runtime badge for the surface (`AgentCapability.runtimeLabel`). */
  capabilities?: {
    runtimeLabel?: string | undefined;
    showRuntimeLabelInPicker?: boolean | undefined;
  };
};

export function providerMenuKey(provider: ProviderIdentityInput): string {
  if (provider.modelPickerKey) return provider.modelPickerKey;
  return provider.presentationMode
    ? `${provider.kind}:${provider.presentationMode}${provider.runtimeVariant ? `:${provider.runtimeVariant}` : ""}`
    : provider.kind;
}

export function providerVisibilityKey(provider: ProviderIdentityInput): string {
  if (provider.hiddenModelsKey) return provider.hiddenModelsKey;
  return modelVisibilityKey(provider.kind, provider.presentationMode);
}

/**
 * Runtime-variant id that owns a surface: the caller-supplied variant, else the
 * provider's legacy default for its structured surface. Terminal surfaces are
 * never runtime-scoped.
 */
function resolveRuntimeVariantId(
  agentKind: string,
  presentationMode?: ThreadPresentationMode,
  runtimeVariant?: string,
): string | undefined {
  if (presentationMode !== "gui") return undefined;
  return runtimeVariant?.toLowerCase() ?? getProviderManifest(agentKind)?.legacyGuiRuntimeVariant;
}

/** Settings key used to persist hidden models for one provider surface. */
export function modelVisibilityKey(
  agentKind: string,
  presentationMode?: ThreadPresentationMode,
  runtimeVariant?: string,
): string {
  const variant = resolveRuntimeVariantId(agentKind, presentationMode, runtimeVariant);
  return variant ? `${agentKind}-${variant}` : agentKind;
}

export function providerLabelForPresentation(provider: ProviderIdentityInput): string {
  const label = provider.label ?? provider.kind;
  if (provider.capabilities?.showRuntimeLabelInPicker === false) return label;
  const runtimeLabel =
    provider.presentationMode === "terminal"
      ? getProviderManifest(provider.kind)?.legacyTerminalRuntimeLabel
      : provider.capabilities?.runtimeLabel;
  if (!runtimeLabel) return label;
  // Callers may pass a provider whose label was already qualified by this
  // function (menu providers are built once and re-rendered); stay idempotent.
  return label.endsWith(` ${runtimeLabel}`) ? label : `${label} ${runtimeLabel}`;
}
