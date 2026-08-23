import { describe, expect, it } from "vitest";
import {
  buildCursorSdkModelSelection,
  cursorSdkCapabilitiesFromModels,
  cursorSdkGuiCapabilities,
} from "./sdkModels";

const catalog = [
  {
    id: "composer-2.5",
    displayName: "Composer 2.5",
    parameters: [
      {
        id: "effort",
        values: [{ value: "low" }, { value: "medium" }, { value: "high" }],
      },
      {
        id: "context",
        values: [
          { value: "200k", displayName: "200K" },
          { value: "1m", displayName: "1M" },
        ],
      },
      { id: "fast", values: [{ value: "false" }, { value: "true" }] },
      { id: "thinking", values: [{ value: "false" }, { value: "true" }] },
    ],
    variants: [
      {
        displayName: "Fast",
        params: [{ id: "fast", value: "true" }],
      },
      {
        displayName: "Deep Fast",
        params: [
          { id: "effort", value: "high" },
          { id: "context", value: "1m" },
          { id: "fast", value: "true" },
          { id: "thinking", value: "true" },
        ],
      },
    ],
  },
  {
    id: "auto-smart",
    displayName: "Cursor Router",
    parameters: [
      {
        id: "optimize_for",
        values: [
          { value: "cost", displayName: "Cost" },
          { value: "balanced", displayName: "Balance" },
          { value: "intelligence", displayName: "Intelligence" },
        ],
      },
    ],
    variants: [
      {
        displayName: "Intelligence",
        params: [{ id: "optimize_for", value: "intelligence" }],
      },
    ],
  },
] as const;

describe("buildCursorSdkModelSelection", () => {
  it("maps generic composer controls to catalog-supported SDK parameters", () => {
    expect(
      buildCursorSdkModelSelection(
        {
          model: "composer-2.5",
          effort: "high",
          contextSize: "1m",
          fast: true,
        },
        catalog,
      ),
    ).toEqual({
      id: "composer-2.5",
      params: [
        { id: "effort", value: "high" },
        { id: "context", value: "1m" },
        { id: "fast", value: "true" },
      ],
    });
  });

  it("preserves arbitrary bracket parameters and lets explicit controls override them", () => {
    expect(
      buildCursorSdkModelSelection(
        {
          model: "composer-2.5[future_mode=deep,effort=low]",
          effort: "medium",
          fast: false,
        },
        catalog,
      ),
    ).toEqual({
      id: "composer-2.5",
      params: [
        { id: "future_mode", value: "deep" },
        { id: "effort", value: "medium" },
        { id: "fast", value: "false" },
      ],
    });
  });

  it("keeps an advertised named preset authoritative over injected composer defaults", () => {
    expect(
      buildCursorSdkModelSelection(
        {
          model: "composer-2.5[effort=high,context=1m,fast=true,thinking=true]",
          effort: "medium",
          contextSize: "200k",
          fast: false,
          thinking: false,
        },
        catalog,
      ),
    ).toEqual({
      id: "composer-2.5",
      params: [
        { id: "effort", value: "high" },
        { id: "context", value: "1m" },
        { id: "fast", value: "true" },
        { id: "thinking", value: "true" },
      ],
    });
  });

  it("preserves explicit controls that a named preset does not fix", () => {
    expect(
      buildCursorSdkModelSelection(
        {
          model: "composer-2.5[fast=true]",
          effort: "high",
          contextSize: "1m",
          fast: false,
          thinking: true,
        },
        catalog,
      ),
    ).toEqual({
      id: "composer-2.5",
      params: [
        { id: "fast", value: "true" },
        { id: "effort", value: "high" },
        { id: "context", value: "1m" },
        { id: "thinking", value: "true" },
      ],
    });
  });

  it("defaults Cursor Router to Balance and preserves an explicit preset", () => {
    expect(buildCursorSdkModelSelection({ model: "auto-smart" }, catalog)).toEqual({
      id: "auto-smart",
      params: [{ id: "optimize_for", value: "balanced" }],
    });
    expect(
      buildCursorSdkModelSelection({ model: "auto-smart[optimize_for=intelligence]" }, catalog),
    ).toEqual({
      id: "auto-smart",
      params: [{ id: "optimize_for", value: "intelligence" }],
    });
    expect(buildCursorSdkModelSelection({ model: "auto-smart" }, [])).toEqual({
      id: "auto-smart",
      params: [{ id: "optimize_for", value: "balanced" }],
    });
    expect(
      buildCursorSdkModelSelection({ model: "auto-smart[optimize_for=intelligence]" }, []),
    ).toEqual({
      id: "auto-smart",
      params: [{ id: "optimize_for", value: "intelligence" }],
    });
    expect(
      buildCursorSdkModelSelection({ model: "future[future_mode=deep,effort=high]" }, []),
    ).toEqual({
      id: "future",
      params: [
        { id: "future_mode", value: "deep" },
        { id: "effort", value: "high" },
      ],
    });
  });

  it("drops known parameters whose values are no longer accepted", () => {
    expect(
      buildCursorSdkModelSelection(
        { model: "composer-2.5[effort=retired]", effort: "xhigh", contextSize: "9m" },
        catalog,
      ),
    ).toEqual({ id: "composer-2.5" });
  });

  it("falls back to a real catalog model when a deferred or retired id is invalid", () => {
    expect(
      buildCursorSdkModelSelection({ model: "retired[future_mode=unsafe]", effort: "high" }, [
        { id: "auto", displayName: "Auto" },
        ...catalog,
      ]),
    ).toEqual({ id: "auto" });
    expect(buildCursorSdkModelSelection({ model: "retired" }, catalog)).toEqual({
      id: "composer-2.5",
    });
    expect(buildCursorSdkModelSelection({ model: "auto" }, catalog)).toEqual({
      id: "composer-2.5",
    });
  });
});

describe("cursorSdkCapabilitiesFromModels", () => {
  it("uses controls for known parameter ranges and rows for non-generic SDK presets", () => {
    expect(cursorSdkCapabilitiesFromModels(catalog)).toEqual({
      models: [
        { id: "composer-2.5", label: "Composer 2.5" },
        { id: "auto-smart", label: "Cursor Router" },
        {
          id: "auto-smart[optimize_for=intelligence]",
          label: "Cursor Router · Intelligence",
        },
      ],
      subProviders: [
        { id: "cursor", label: "Cursor Models" },
        { id: "other", label: "Other models" },
      ],
      modelSubProvider: {
        "composer-2.5": "cursor",
        "auto-smart": "cursor",
        "auto-smart[optimize_for=intelligence]": "cursor",
      },
      efforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      modelEfforts: {
        "composer-2.5": ["low", "medium", "high"],
        "auto-smart": [],
        "auto-smart[optimize_for=intelligence]": [],
      },
      contextSizes: [
        { id: "200k", label: "200K" },
        { id: "1m", label: "1M" },
      ],
      modelContextSizes: {
        "composer-2.5": ["200k", "1m"],
      },
      fastModels: ["composer-2.5"],
      thinkingModels: ["composer-2.5"],
    });
  });

  it("keeps the SDK's native Auto model first and groups its default id with Cursor models", () => {
    const capabilities = cursorSdkCapabilitiesFromModels([
      { id: "opus-5", displayName: "Opus 5" },
      { id: "default", displayName: "Auto" },
      { id: "composer-2.5", displayName: "Composer 2.5" },
    ]);

    expect(capabilities.models.map(({ id }) => id)).toEqual(["default", "opus-5", "composer-2.5"]);
    expect(capabilities.modelSubProvider?.default).toBe("cursor");
    expect(capabilities.modelSubProvider?.["composer-2.5"]).toBe("cursor");
    expect(capabilities.modelSubProvider?.["opus-5"]).toBe("other");
    expect(
      buildCursorSdkModelSelection({ model: "auto" }, [
        { id: "opus-5", displayName: "Opus 5" },
        { id: "default", displayName: "Auto" },
      ]),
    ).toEqual({ id: "default" });
  });

  it("groups first-party Grok with Cursor Models, not the API Other Models pool", () => {
    const capabilities = cursorSdkCapabilitiesFromModels([
      { id: "composer-2.5", displayName: "Composer 2.5" },
      { id: "grok-4.6", displayName: "Cursor Grok 4.6" },
      { id: "grok-4.5", displayName: "Cursor Grok 4.5" },
      { id: "gpt-5.6-luna", displayName: "GPT-5.6 Luna" },
      { id: "gemini-3.7-flash", displayName: "Gemini 3.7 Flash" },
    ]);

    expect(capabilities.modelSubProvider).toEqual({
      "composer-2.5": "cursor",
      "grok-4.6": "cursor",
      "grok-4.5": "cursor",
      "gpt-5.6-luna": "other",
      "gemini-3.7-flash": "other",
    });
  });

  it("removes the effort suffix while keeping Reasoning, Context, and Fast controls", () => {
    const currentCatalog = [
      {
        id: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol Medium",
        parameters: [
          {
            id: "reasoning",
            displayName: "Reasoning effort",
            values: [
              { value: "low", displayName: "Low" },
              { value: "medium", displayName: "Medium" },
              { value: "high", displayName: "High" },
              { value: "xhigh", displayName: "Extra High" },
            ],
          },
          {
            id: "fast",
            displayName: "Fast mode",
            values: [{ value: "false" }, { value: "true" }],
          },
          {
            id: "context",
            displayName: "Context window",
            values: [
              { value: "272k", displayName: "272K" },
              { value: "1m", displayName: "1M" },
            ],
          },
        ],
        variants: [
          {
            displayName: "Default",
            isDefault: true,
            params: [
              { id: "reasoning", value: "medium" },
              { id: "fast", value: "false" },
            ],
          },
        ],
      },
    ] as const;

    expect(cursorSdkCapabilitiesFromModels(currentCatalog)).toMatchObject({
      models: [{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol" }],
      efforts: ["low", "medium", "high", "xhigh"],
      defaultEffort: "medium",
      modelEfforts: {
        "gpt-5.6-sol": ["low", "medium", "high", "xhigh"],
      },
      fastModels: ["gpt-5.6-sol"],
      contextSizes: [
        { id: "272k", label: "272K" },
        { id: "1m", label: "1M" },
      ],
      modelContextSizes: {
        "gpt-5.6-sol": ["272k", "1m"],
      },
    });
    expect(
      buildCursorSdkModelSelection(
        { model: "gpt-5.6-sol", effort: "high", contextSize: "1m", fast: true },
        currentCatalog,
      ),
    ).toEqual({
      id: "gpt-5.6-sol",
      params: [
        { id: "reasoning", value: "high" },
        { id: "context", value: "1m" },
        { id: "fast", value: "true" },
      ],
    });
  });

  it("marks legacy generations hidden by default while keeping current models visible", () => {
    const generationCatalog = [
      { id: "composer-2", displayName: "Composer 2" },
      { id: "composer-2.5", displayName: "Composer 2.5" },
      { id: "gpt-5.5", displayName: "GPT-5.5" },
      { id: "gpt-5.6", displayName: "GPT-5.6" },
      { id: "opus-4.8", displayName: "Opus 4.8" },
      { id: "opus-5", displayName: "Opus 5" },
      { id: "sonnet-4.6", displayName: "Sonnet 4.6" },
      { id: "sonnet-5", displayName: "Sonnet 5" },
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
      { id: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash" },
      { id: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash" },
    ] as const;

    expect(cursorSdkCapabilitiesFromModels(generationCatalog).defaultHiddenModels).toEqual([
      "composer-2",
      "gpt-5.5",
      "opus-4.8",
      "sonnet-4.6",
      "gemini-2.5-pro",
      "gemini-3.5-flash",
    ]);
  });
});

describe("cursorSdkCapabilitiesFromModels deduplication", () => {
  it("merges catalog entries that project to the same label into one row", () => {
    const duplicateCatalog = [
      {
        id: "opus-4.8",
        displayName: "Opus 4.8",
        parameters: [
          { id: "effort", values: [{ value: "medium" }] },
          { id: "context", values: [{ value: "300k", displayName: "300K" }] },
        ],
      },
      {
        id: "claude-opus-4.8-thinking",
        displayName: "Opus 4.8  ",
        parameters: [
          { id: "effort", values: [{ value: "high" }] },
          { id: "context", values: [{ value: "1m", displayName: "1M" }] },
          { id: "thinking", values: [{ value: "false" }, { value: "true" }] },
        ],
      },
    ] as const;

    expect(cursorSdkCapabilitiesFromModels(duplicateCatalog)).toMatchObject({
      models: [{ id: "opus-4.8", label: "Opus 4.8" }],
      efforts: ["medium", "high"],
      modelEfforts: { "opus-4.8": ["medium", "high"] },
      contextSizes: [
        { id: "300k", label: "300K" },
        { id: "1m", label: "1M" },
      ],
      modelContextSizes: { "opus-4.8": ["300k", "1m"] },
      thinkingModels: ["opus-4.8"],
    });
  });

  it("never repeats a merged winner inside fastModels or thinkingModels", () => {
    const duplicateCatalog = [
      {
        id: "sonnet-5",
        displayName: "Sonnet 5",
        parameters: [
          { id: "fast", values: [{ value: "false" }, { value: "true" }] },
          { id: "thinking", values: [{ value: "false" }, { value: "true" }] },
        ],
      },
      {
        id: "sonnet-5-alias",
        displayName: "sonnet 5",
        parameters: [
          { id: "fast", values: [{ value: "false" }, { value: "true" }] },
          { id: "thinking", values: [{ value: "false" }, { value: "true" }] },
        ],
      },
    ] as const;

    expect(cursorSdkCapabilitiesFromModels(duplicateCatalog)).toMatchObject({
      models: [{ id: "sonnet-5", label: "Sonnet 5" }],
      fastModels: ["sonnet-5"],
      thinkingModels: ["sonnet-5"],
    });
  });

  it("drops a variant row whose name repeats its own model label", () => {
    const selfNamedCatalog = [
      {
        id: "opus-4.8",
        displayName: "Opus 4.8",
        parameters: [{ id: "optimize_for", values: [{ value: "cost" }] }],
        variants: [
          { displayName: "Opus 4.8", params: [{ id: "optimize_for", value: "cost" }] },
          { displayName: " opus 4.8 ", params: [{ id: "optimize_for", value: "cost" }] },
        ],
      },
    ] as const;

    expect(cursorSdkCapabilitiesFromModels(selfNamedCatalog)).toMatchObject({
      models: [{ id: "opus-4.8", label: "Opus 4.8" }],
    });
  });

  it("keeps a distinctly named preset with a non-generic parameter as its own row", () => {
    const presetCatalog = [
      {
        id: "auto-smart",
        displayName: "Cursor Router",
        parameters: [
          {
            id: "optimize_for",
            values: [{ value: "cost", displayName: "Cost" }],
          },
        ],
        variants: [
          {
            displayName: "Cost",
            description: "Cheapest route",
            params: [{ id: "optimize_for", value: "cost" }],
          },
        ],
      },
    ] as const;

    expect(cursorSdkCapabilitiesFromModels(presetCatalog)).toMatchObject({
      models: [
        { id: "auto-smart", label: "Cursor Router" },
        {
          id: "auto-smart[optimize_for=cost]",
          label: "Cursor Router · Cost",
          tooltipDescription: "Cheapest route",
        },
      ],
    });
  });

  it("treats a non-exact context parameter id as a generic control", () => {
    const contextCatalog = [
      {
        id: "gemini-4-pro",
        displayName: "Gemini 4 Pro",
        parameters: [
          {
            id: "context_window",
            values: [
              { value: "200k", displayName: "200K" },
              { value: "2m", displayName: "2M" },
            ],
          },
        ],
        variants: [
          { displayName: "200K context", params: [{ id: "context_window", value: "200k" }] },
          { displayName: "2M context", params: [{ id: "context_window", value: "2m" }] },
        ],
      },
    ] as const;

    expect(cursorSdkCapabilitiesFromModels(contextCatalog)).toMatchObject({
      models: [{ id: "gemini-4-pro", label: "Gemini 4 Pro" }],
      contextSizes: [
        { id: "200k", label: "200K" },
        { id: "2m", label: "2M" },
      ],
      modelContextSizes: { "gemini-4-pro": ["200k", "2m"] },
    });
  });

  it("round-trips a context selection through a generalised parameter id", () => {
    const contextCatalog = [
      {
        id: "gemini-4-pro",
        displayName: "Gemini 4 Pro",
        parameters: [
          {
            id: "context_window",
            values: [{ value: "200k" }, { value: "2m" }],
          },
          {
            id: "reasoning_effort",
            values: [{ value: "low" }, { value: "high" }],
          },
        ],
      },
    ] as const;

    expect(
      buildCursorSdkModelSelection(
        { model: "gemini-4-pro", contextSize: "2m", effort: "high" },
        contextCatalog,
      ),
    ).toEqual({
      id: "gemini-4-pro",
      params: [
        { id: "reasoning_effort", value: "high" },
        { id: "context_window", value: "2m" },
      ],
    });
  });
});

describe("cursorSdkGuiCapabilities", () => {
  it("advertises the SDK's real mode, Auto-review, sandbox, and resume controls", () => {
    const capabilities = cursorSdkGuiCapabilities([
      { id: "composer-2.5", displayName: "Composer 2.5" },
    ]);

    expect(capabilities).toMatchObject({
      models: [{ id: "composer-2.5", label: "Composer 2.5" }],
      runtimeLabel: "SDK",
      modes: ["agent", "plan"],
      approvalPolicies: [
        { id: "default", label: "Auto-review" },
        { id: "never", label: "Allow All Tools" },
      ],
      sandboxModes: [
        { id: "workspace-write", label: "Workspace Sandbox" },
        { id: "danger-full-access", label: "No Sandbox" },
      ],
      defaultApprovalPolicy: "never",
      defaultSandboxMode: "danger-full-access",
      bypassPermissions: {
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
      supportsResume: true,
      supportsDirectInput: false,
      liveInputMode: "server",
      presentationMode: "gui",
    });
  });
});
