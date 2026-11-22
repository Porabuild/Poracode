import { describe, expect, it } from "vitest";
import type { IntegrationInfo, ModelInfo, ProviderInfo } from "./clientTypes";
import { availableOpenCodeCatalog } from "./catalogAvailability";

const provider = (overrides: Partial<ProviderInfo> = {}): ProviderInfo => ({
  id: "openrouter",
  integrationID: "openrouter",
  name: "OpenRouter",
  activation: "enabled",
  package: "@opencode/ai/providers/openrouter",
  ...overrides,
});
const model = (overrides: Partial<ModelInfo> = {}): ModelInfo => ({
  id: "chat",
  modelID: "chat",
  providerID: "openrouter",
  name: "Chat",
  capabilities: { tools: true, input: ["text"], output: ["text"] },
  variants: [{ id: "high" }],
  time: { released: 0 },
  cost: [],
  status: "active",
  enabled: true,
  limit: { context: 128_000, output: 32_000 },
  ...overrides,
});
const integration = (connections: IntegrationInfo["connections"] = []): IntegrationInfo => ({
  id: "openrouter",
  name: "OpenRouter",
  methods: [{ type: "key" }],
  connections,
});

describe("OpenCode catalog authentication", () => {
  it("drops configured providers after their last credential is removed and restores them on reconnect", () => {
    const models = [model()];
    const providers = [
      provider({ headers: { "HTTP-Referer": "https://opencode.ai/", "X-Title": "opencode" } }),
    ];
    const connected = integration([
      { type: "credential", id: "key", label: "API key", method: "key" },
    ]);
    expect(availableOpenCodeCatalog(models, providers, [connected])).toEqual({
      models,
      providers,
    });
    expect(availableOpenCodeCatalog(models, providers, [integration()])).toEqual({
      models: [],
      providers: [],
    });
    expect(availableOpenCodeCatalog(models, providers, [connected])).toEqual({
      models,
      providers,
    });
  });

  it.each([
    {
      connections: [
        {
          type: "credential" as const,
          id: "other-key",
          label: "Other key",
          method: "key" as const,
        },
      ],
    },
    { connections: [{ type: "env" as const, name: "OPENROUTER_API_KEY" }] },
  ])(
    "retains models when another credential or environment connection remains",
    ({ connections }) => {
      expect(
        availableOpenCodeCatalog([model()], [provider()], [integration(connections)]).models,
      ).toHaveLength(1);
    },
  );

  it("follows integrationID for aliased and gateway providers", () => {
    const providers = [provider({ id: "gateway", integrationID: "openrouter" })];
    const models = [model({ providerID: "gateway" })];
    expect(availableOpenCodeCatalog(models, providers, [integration()])).toEqual({
      models: [],
      providers: [],
    });
    expect(
      availableOpenCodeCatalog(models, providers, [integration([{ type: "env", name: "KEY" }])]),
    ).toEqual({ models, providers });
  });

  it.each([
    { settings: { apiKey: "synthetic-key" } },
    { settings: { authToken: "synthetic-token" } },
    { settings: { accessToken: "synthetic-token" } },
    { headers: { Authorization: "Bearer synthetic-key" } },
    { headers: { "X-API-Key": "synthetic-key" } },
  ])("preserves configured authentication: %j", (authentication) => {
    expect(
      availableOpenCodeCatalog([model()], [provider(authentication)], [integration()]).models,
    ).toHaveLength(1);
    expect(
      availableOpenCodeCatalog([model(authentication)], [provider()], [integration()]).models,
    ).toHaveLength(1);
  });

  it.each([
    { settings: { apiKey: "synthetic-key" } },
    { settings: { authToken: "synthetic-token" } },
    { settings: { accessToken: "synthetic-token" } },
    { headers: { Authorization: "Bearer synthetic-token" } },
  ])("preserves authentication supplied by a model variant: %j", (authentication) => {
    const authenticated = model({ variants: [{ id: "high", ...authentication }] });
    expect(
      availableOpenCodeCatalog(
        [authenticated, model({ id: "other" })],
        [provider()],
        [integration()],
      ),
    ).toEqual({ models: [authenticated], providers: [provider()] });
  });

  it("does not treat empty configured tokens as authentication", () => {
    const empty = { settings: { apiKey: "", authToken: " ", accessToken: "" } };
    expect(
      availableOpenCodeCatalog(
        [model({ ...empty, variants: [{ id: "high", ...empty }] })],
        [provider(empty)],
        [integration()],
      ),
    ).toEqual({ models: [], providers: [] });
  });

  it("limits model-scoped authentication to that model", () => {
    const authenticated = model({ settings: { apiKey: "synthetic-key" } });
    expect(
      availableOpenCodeCatalog(
        [authenticated, model({ id: "other" })],
        [provider()],
        [integration()],
      ),
    ).toEqual({
      models: [authenticated],
      providers: [provider()],
    });
  });

  it.each(["@opencode/ai/providers/amazon-bedrock", "@opencode/ai/providers/google-vertex/gemini"])(
    "preserves server-advertised ambient authentication for %s",
    (runtimePackage) => {
      expect(
        availableOpenCodeCatalog(
          [model()],
          [provider({ package: runtimePackage })],
          [integration()],
        ).models,
      ).toHaveLength(1);
    },
  );

  it("preserves credential-free providers with no integration", () => {
    expect(availableOpenCodeCatalog([model()], [provider()], []).models).toHaveLength(1);
  });

  it("preserves custom providers without a declared integration dependency", () => {
    const custom = provider();
    delete custom.integrationID;
    expect(availableOpenCodeCatalog([model()], [custom], [integration()])).toEqual({
      models: [model()],
      providers: [custom],
    });
  });

  it("excludes disabled models, disabled providers, and models absent from the provider catalog", () => {
    expect(availableOpenCodeCatalog([model({ enabled: false })], [provider()], []).models).toEqual(
      [],
    );
    expect(availableOpenCodeCatalog([model()], [provider({ activation: "disabled" })], [])).toEqual(
      { models: [], providers: [] },
    );
    expect(availableOpenCodeCatalog([model()], [], []).models).toEqual([]);
  });
});
