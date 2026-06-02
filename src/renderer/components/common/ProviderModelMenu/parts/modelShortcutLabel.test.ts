import { describe, expect, it } from "vitest";
import { buildProviderModelItems, type ProviderModelMenuProvider } from "./buildItems";
import {
  formatCodexFamilyModelLabel,
  formatShortcutFallbackLabel,
  formatShortcutModelLabel,
} from "./modelShortcutLabel";

describe("formatShortcutModelLabel", () => {
  it("expands Codex short labels to GPT-prefixed titles", () => {
    expect(formatShortcutModelLabel("codex", "gpt-5.5", "5.5")).toBe("GPT-5.5");
    expect(formatShortcutModelLabel("codex", "gpt-5.4-mini", "5.4 Mini")).toBe("GPT-5.4 Mini");
  });

  it("keeps curated Codex labels unchanged", () => {
    expect(formatShortcutModelLabel("codex", "gpt-5.5", "GPT-5.5 High")).toBe("GPT-5.5 High");
  });

  it("formats Cursor ACP bracket ids for shortcut rows", () => {
    expect(formatShortcutFallbackLabel("cursor", "composer-2.5[fast=true]")).toBe(
      "Composer 2.5 · Fast",
    );
    expect(
      formatShortcutModelLabel("cursor", "composer-2.5[fast=true]", "Composer 2.5[fast=true]"),
    ).toBe("Composer 2.5 · Fast");
  });

  it("appends ACP param hints when a grouped Cursor row is reused", () => {
    expect(formatShortcutModelLabel("cursor", "composer-2.5[fast=true]", "Composer 2.5")).toBe(
      "Composer 2.5 · Fast",
    );
  });

  it("formats Codex-family model ids for shared menu labels", () => {
    expect(formatCodexFamilyModelLabel("gpt-5.3-codex-spark")).toBe("Codex 5.3 Spark");
    expect(formatCodexFamilyModelLabel("gpt-5.1-codex-max")).toBe("Codex 5.1 Max");
  });
});

describe("buildProviderModelItems shortcut labels", () => {
  const codexProvider = {
    kind: "codex",
    label: "Codex",
    capabilities: {
      models: [{ id: "gpt-5.5", label: "5.5" }],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"] as const,
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal" as const,
      presentationMode: "terminal" as const,
      settingDefs: [],
    },
  } satisfies ProviderModelMenuProvider;

  const cursorProvider = {
    kind: "cursor",
    label: "Cursor",
    capabilities: {
      models: [
        { id: "composer-2.5", label: "Composer 2.5" },
        { id: "gpt-5.5", label: "GPT-5.5" },
      ],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"] as const,
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal" as const,
      presentationMode: "terminal" as const,
      settingDefs: [],
    },
  } satisfies ProviderModelMenuProvider;

  it("shows GPT titles in aggregated favorites for Codex models", () => {
    const items = buildProviderModelItems({
      providers: [codexProvider, cursorProvider],
      search: "",
      favorites: [{ agentKind: "codex", modelId: "gpt-5.5" }],
    });

    const favorite = items.find((item) => item.type === "model" && item.modelId === "gpt-5.5");
    expect(favorite?.type === "model" ? favorite.label : undefined).toBe("GPT-5.5");
  });

  it("resolves Cursor ACP favorites against grouped base model rows", () => {
    const items = buildProviderModelItems({
      providers: [codexProvider, cursorProvider],
      search: "",
      favorites: [{ agentKind: "cursor", modelId: "composer-2.5[fast=true]" }],
    });

    const favorite = items.find(
      (item) => item.type === "model" && item.modelId === "composer-2.5[fast=true]",
    );
    expect(favorite?.type === "model" ? favorite.label : undefined).toBe("Composer 2.5 · Fast");
  });
});
