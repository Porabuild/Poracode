import type { ThreadPresentationMode } from "@/shared/contracts";

export const CURSOR_ACP_MODEL_VISIBILITY_KEY = "cursor-acp";

type ProviderIdentityInput = {
  kind: string;
  label?: string;
  presentationMode?: ThreadPresentationMode;
  modelPickerKey?: string;
  hiddenModelsKey?: string;
};

export function providerMenuKey(provider: ProviderIdentityInput): string {
  if (provider.modelPickerKey) return provider.modelPickerKey;
  return provider.presentationMode
    ? `${provider.kind}:${provider.presentationMode}`
    : provider.kind;
}

export function providerVisibilityKey(provider: ProviderIdentityInput): string {
  if (provider.hiddenModelsKey) return provider.hiddenModelsKey;
  return modelVisibilityKey(provider.kind, provider.presentationMode);
}

export function modelVisibilityKey(
  agentKind: string,
  presentationMode?: ThreadPresentationMode,
): string {
  return agentKind === "cursor" && presentationMode === "gui"
    ? CURSOR_ACP_MODEL_VISIBILITY_KEY
    : agentKind;
}

export function providerLabelForPresentation(provider: ProviderIdentityInput): string {
  if (provider.kind !== "cursor") return provider.label ?? provider.kind;
  return provider.presentationMode === "terminal" ? "Cursor CLI" : (provider.label ?? "Cursor");
}
