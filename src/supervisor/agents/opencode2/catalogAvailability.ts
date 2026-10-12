import type { IntegrationInfo, ModelInfo, ProviderInfo } from "./clientTypes";

function hasConfiguredAuthentication(entry: Pick<ProviderInfo, "settings" | "headers">): boolean {
  return (
    [entry.settings?.apiKey, entry.settings?.authToken, entry.settings?.accessToken].some(
      (value) => typeof value === "string" && value.trim().length > 0,
    ) ||
    Object.entries(entry.headers ?? {}).some(
      ([name, value]) => /^(authorization|.*api-key)$/i.test(name) && value.trim().length > 0,
    )
  );
}

/**
 * Configured providers stay enabled in V2 even after their last credential is
 * removed. Keep their definitions on disk, but only advertise models that have
 * a connection or configured authentication. Native cloud runtimes also support
 * ambient credential chains; their server-reported availability stays authoritative.
 */
export function availableOpenCode2Catalog(
  models: readonly ModelInfo[],
  providers: readonly ProviderInfo[],
  integrations: readonly IntegrationInfo[],
): { models: ModelInfo[]; providers: ProviderInfo[] } {
  const byIntegration = new Map(integrations.map((integration) => [integration.id, integration]));
  const authenticatedIDs = new Set(
    providers
      .filter((provider) => {
        if (provider.activation === "disabled") return false;
        // Only an explicit integration link declares a credential dependency.
        // Custom/local configuration may create an unrelated same-ID integration.
        if (!provider.integrationID) return true;
        const integration = byIntegration.get(provider.integrationID);
        if (!integration || integration.connections.length > 0) return true;
        if (
          provider.package.startsWith("@opencode/ai/providers/amazon-bedrock") ||
          provider.package.startsWith("@opencode/ai/providers/google-vertex")
        ) {
          return true;
        }
        return hasConfiguredAuthentication(provider);
      })
      .map((provider) => provider.id),
  );
  const enabledIDs = new Set(
    providers
      .filter((provider) => provider.activation !== "disabled")
      .map((provider) => provider.id),
  );
  const availableModels = models.filter(
    (model) =>
      model.enabled &&
      enabledIDs.has(model.providerID) &&
      (authenticatedIDs.has(model.providerID) ||
        hasConfiguredAuthentication(model) ||
        model.variants.some(hasConfiguredAuthentication)),
  );
  const availableIDs = new Set([
    ...authenticatedIDs,
    ...availableModels.map((model) => model.providerID),
  ]);
  return {
    providers: providers.filter((provider) => availableIDs.has(provider.id)),
    models: availableModels,
  };
}
