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
      defaultApprovalPolicy: "default",
      defaultSandboxMode: "workspace-write",
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
