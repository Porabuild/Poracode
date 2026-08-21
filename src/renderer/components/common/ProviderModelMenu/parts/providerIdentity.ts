import { baseAgentKind, type ThreadPresentationMode } from "@/shared/contracts";

type ProviderIdentityInput = {
  kind: string;
  label?: string;
  presentationMode?: ThreadPresentationMode;
  runtimeVariant?: string;
  modelPickerKey?: string;
  hiddenModelsKey?: string;
  /** Adapter-declared runtime badge for the surface (`AgentCapability.runtimeLabel`). */
  capabilities?: { runtimeLabel?: string | undefined };
};

/**
 * Compatibility defaults for provider surfaces that shipped before their
 * adapter declared a `runtimeLabel` capability / a named runtime variant per
 * GUI surface.
 *
 * Shared code below never branches on a provider kind — it only looks the kind
 * up in this table. Entries exist purely so already-persisted hidden-model keys
 * and already-shipped surface labels stay stable; a provider that declares
 * `runtimeLabel` on every runtime surface needs no entry here.
 */
const legacySurfaceIdentity: Record<
  string,
  { terminalRuntimeLabel?: string; defaultGuiRuntimeVariant?: string }
> = {
  // Cursor's CLI surface has no adapter-declared runtimeLabel, and threads that
  // predate named runtime variants persist their GUI hidden models under the
  // ACP surface key.
  cursor: { terminalRuntimeLabel: "CLI", defaultGuiRuntimeVariant: "acp" },
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
  return (
    runtimeVariant?.toLowerCase() ??
    legacySurfaceIdentity[baseAgentKind(agentKind)]?.defaultGuiRuntimeVariant
  );
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
  const runtimeLabel =
    provider.presentationMode === "terminal"
      ? legacySurfaceIdentity[baseAgentKind(provider.kind)]?.terminalRuntimeLabel
      : provider.capabilities?.runtimeLabel;
  if (!runtimeLabel) return label;
  // Callers may pass a provider whose label was already qualified by this
  // function (menu providers are built once and re-rendered); stay idempotent.
  return label.endsWith(` ${runtimeLabel}`) ? label : `${label} ${runtimeLabel}`;
}
