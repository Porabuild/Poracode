import { isLoopbackHostname } from "@/shared/http";
import { isCloudOllamaModelTag } from "@/shared/agents/ollamaModelInventory";
import type { ModelInfo, ProviderInfo } from "./clientTypes";

const OLLAMA_PROVIDER_ID = "ollama";
const OPENAI_COMPATIBLE_PACKAGE = "@opencode/ai/providers/openai-compatible";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

/**
 * The built-in Ollama provider on its default or an explicitly configured
 * loopback endpoint. This is a configuration check, not a health probe: it
 * never contacts the endpoint and makes no claim that a model will load.
 */
function isLocalOllamaProvider(provider: ProviderInfo): boolean {
  if (provider.id !== OLLAMA_PROVIDER_ID || provider.activation === "disabled") return false;
  if (provider.package !== OPENAI_COMPATIBLE_PACKAGE) return false;
  const configured = provider.settings?.baseURL;
  const baseURL =
    typeof configured === "string" && configured.trim().length > 0
      ? configured.trim()
      : DEFAULT_OLLAMA_BASE_URL;
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

/**
 * True when OpenCode's filtered catalog has an enabled model under the
 * built-in loopback Ollama provider. Such a model needs no upstream account,
 * so its presence makes OpenCode credential-free eligible in this environment.
 * It does not attest that the endpoint is reachable or that the model is
 * loaded; a failed runtime request still reports the real error to the user.
 */
export function hasCredentialFreeOllamaModel(
  models: readonly ModelInfo[],
  providers: readonly ProviderInfo[],
): boolean {
  const providerIDs = new Set(
    providers.filter(isLocalOllamaProvider).map((provider) => provider.id),
  );
  if (providerIDs.size === 0) return false;
  return models.some(
    (model) =>
      model.enabled &&
      providerIDs.has(model.providerID) &&
      !isCloudOllamaModelTag(model.id) &&
      !isCloudOllamaModelTag(model.modelID),
  );
}
