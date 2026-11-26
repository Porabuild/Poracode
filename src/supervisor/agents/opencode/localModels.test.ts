import { describe, expect, it } from "vitest";
import { isCloudOllamaModelTag } from "@/shared/agents/ollamaModelInventory";
import type { ModelInfo, ProviderInfo } from "./clientTypes";
import { hasCredentialFreeOllamaModel } from "./localModels";

const provider = (overrides: Partial<ProviderInfo> = {}): ProviderInfo => ({
  id: "ollama",
  name: "Ollama",
  activation: "enabled",
  package: "@opencode/ai/providers/openai-compatible",
  settings: { baseURL: "http://127.0.0.1:11434/v1", apiKey: "" },
  ...overrides,
});

const model = (overrides: Partial<ModelInfo> = {}): ModelInfo => ({
  id: "inkling-2-mini:latest",
  modelID: "inkling-2-mini:latest",
  providerID: "ollama",
  name: "inkling-2-mini:latest",
  capabilities: { tools: true, input: ["text"], output: ["text"] },
  variants: [],
  time: { released: 0 },
  cost: [],
  status: "active",
  enabled: true,
  limit: { context: 1_048_576, output: 32_000 },
  ...overrides,
});

describe("credential-free Ollama catalog eligibility", () => {
  it("accepts an enabled model under the built-in loopback Ollama provider", () => {
    expect(hasCredentialFreeOllamaModel([model()], [provider()])).toBe(true);
  });

  it("accepts the default endpoint when no baseURL is configured", () => {
    const defaulted = provider();
    delete defaulted.settings;
    expect(hasCredentialFreeOllamaModel([model()], [defaulted])).toBe(true);
  });

  it.each(["http://127.0.0.1:11500/v1", "https://localhost:11434/v1", "http://[::1]:11434/v1"])(
    "accepts an explicit loopback endpoint: %s",
    (baseURL) => {
      expect(hasCredentialFreeOllamaModel([model()], [provider({ settings: { baseURL } })])).toBe(
        true,
      );
    },
  );

  it.each([
    {
      label: "a configured non-loopback endpoint",
      p: provider({ settings: { baseURL: "https://ollama.example.com/v1" } }),
    },
    { label: "a custom local gateway", p: provider({ id: "my-ollama" }) },
    { label: "LM Studio", p: provider({ id: "lmstudio" }) },
    { label: "vLLM", p: provider({ id: "vllm" }) },
    { label: "an unsupported package", p: provider({ package: "@opencode/ai/providers/openai" }) },
    { label: "a disabled provider", p: provider({ activation: "disabled" }) },
  ])("rejects $label", ({ p }) => {
    expect(hasCredentialFreeOllamaModel([model()], [p])).toBe(false);
  });

  it("rejects a disabled or missing model", () => {
    expect(hasCredentialFreeOllamaModel([model({ enabled: false })], [provider()])).toBe(false);
    expect(hasCredentialFreeOllamaModel([], [provider()])).toBe(false);
  });

  it.each(["inkling-2-mini:cloud", "inkling-2-mini-cloud", "cloud"])(
    "excludes the cloud-only tag %s",
    (id) => {
      expect(isCloudOllamaModelTag(id)).toBe(true);
      expect(hasCredentialFreeOllamaModel([model({ id, modelID: id })], [provider()])).toBe(false);
    },
  );

  it("keeps ordinary tags, including a tag that merely contains 'cloud'", () => {
    expect(isCloudOllamaModelTag("cloudy-2-mini:latest")).toBe(false);
    expect(
      hasCredentialFreeOllamaModel(
        [model({ id: "cloudy-2-mini:latest", modelID: "cloudy-2-mini:latest" })],
        [provider()],
      ),
    ).toBe(true);
  });
});
