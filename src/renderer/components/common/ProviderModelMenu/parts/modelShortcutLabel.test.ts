import { describe, expect, it } from "vitest";
import { formatCodexFamilyModelLabel, formatCursorBaseModelLabel } from "@/shared/modelLabels";
import { buildProviderModelItems, type ProviderModelMenuProvider } from "./buildItems";
import { formatShortcutFallbackLabel, formatShortcutModelLabel } from "./modelShortcutLabel";

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

  it("formats Cursor base ids with the shared cross-surface label rules", () => {
    // The shared module unifies the menu and supervisor formatters — Claude
    // and Gemini-family ids now get their canonical names here too.
    expect(formatCursorBaseModelLabel("default")).toBe("Auto");
    expect(formatCursorBaseModelLabel("composer-2.5")).toBe("Composer 2.5");
    expect(formatCursorBaseModelLabel("claude-opus-4-1")).toBe("Opus 4.1");
    expect(formatCursorBaseModelLabel("gemini-3-pro")).toBe("Gemini 3 Pro");
    expect(formatCursorBaseModelLabel("mystery-model")).toBe("Mystery Model");
    expect(formatCursorBaseModelLabel("mystery-model", "Mystery model")).toBe("Mystery model");
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

  it("keeps Cursor CLI and Cursor ACP as separate provider sections", () => {
    const items = buildProviderModelItems({
      providers: [
        {
          ...cursorProvider,
          label: "Cursor CLI",
          presentationMode: "terminal",
          modelPickerKey: "cursor:terminal",
          hiddenModelsKey: "cursor",
        },
        {
          kind: "cursor",
          label: "Cursor",
          presentationMode: "gui",
          modelPickerKey: "cursor:gui",
          hiddenModelsKey: "cursor-acp",
          capabilities: {
            ...cursorProvider.capabilities,
            models: [
              {
                id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
                label: "GPT-5.5 · 272K · Medium",
              },
            ],
          },
        },
      ],
      search: "",
    });

    const headers = items.filter((item) => item.type === "header-provider");
    expect(headers.map((header) => header.label)).toEqual(["Cursor CLI", "Cursor"]);
    expect(headers.map((header) => header.hiddenModelsKey)).toEqual(["cursor", "cursor-acp"]);
    expect(items.filter((item) => item.type === "model").map((item) => item.id)).toEqual([
      "model:cursor:terminal:composer-2.5",
      "model:cursor:terminal:gpt-5.5",
      "model:cursor:gui:gpt-5.5[context=272k,reasoning=medium,fast=false]",
    ]);
  });
});
