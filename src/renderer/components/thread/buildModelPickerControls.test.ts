// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentStatus, Thread, ThreadConfig } from "@/shared/contracts";
import {
  appendProviderComposerControls,
  buildControls,
  buildModelPickerControls,
  buildProviderModelMenuProviders,
  expandAgentToVisibilityProviders,
  patchConfigForModelChange,
} from "./buildModelPickerControls";

import { registerComposerControls } from "../providers/providerComposer";
import { modelFamilySelectorControls } from "../providers/modelFamilyControls";
import type { ComposerControl } from "./ThreadComposer";

const capabilities = {
  models: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  efforts: ["low", "high"],
  modelEfforts: {
    a: ["low", "high"],
    b: ["high"],
  },
  modelContextSizes: {
    a: ["128k", "256k"],
    b: ["128k"],
  },
  contextSizes: [
    { id: "128k", label: "128k" },
    { id: "256k", label: "256k" },
  ],
  defaultContextSize: "128k",
  fastModels: ["a"],
  thinkingModels: ["b"],
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "direct",
  presentationMode: "gui",
  settingDefs: [],
} as unknown as AgentCapability;

describe("patchConfigForModelChange", () => {
  it("preserves valid effort when switching models", () => {
    expect(
      patchConfigForModelChange(capabilities, "b", {
        effort: "high",
        contextSize: "256k",
        fast: true,
        thinking: false,
      }),
    ).toEqual({
      model: "b",
      effort: "high",
      contextSize: "128k",
      fast: false,
      thinking: true,
    });
  });

  it("resets effort when the next model does not support it", () => {
    expect(
      patchConfigForModelChange(capabilities, "b", {
        effort: "low",
        contextSize: "256k",
      }),
    ).toEqual({
      model: "b",
      effort: "high",
      contextSize: "128k",
      fast: false,
      thinking: true,
    });
  });

  it("resets effort to the next model's declared default, not its first tier", () => {
    const tiered = {
      ...capabilities,
      modelEfforts: { ...capabilities.modelEfforts, b: ["low", "high", "max"] },
      modelDefaultEfforts: { b: "high" },
    } as AgentCapability;
    expect(patchConfigForModelChange(tiered, "b", { effort: "on" })).toMatchObject({
      model: "b",
      effort: "high",
    });
  });

  // Kimi's K2.7 models advertise no tiers; keeping K3's tier would send an
  // effort the model does not support instead of letting the agent decide.
  it("clears effort when the next model has no tiers of its own", () => {
    const untiered = {
      ...capabilities,
      efforts: [],
      modelEfforts: { ...capabilities.modelEfforts, b: [] },
    } as unknown as AgentCapability;
    expect(patchConfigForModelChange(untiered, "b", { effort: "high" })).toMatchObject({
      model: "b",
      effort: "",
    });
  });

  it("clears inherited context when the next model has no window and no default", () => {
    const { defaultContextSize: _defaultContextSize, ...withoutDefault } = capabilities;
    const noWindow = {
      ...withoutDefault,
      modelContextSizes: { a: ["128k", "256k"] },
    } as AgentCapability;
    expect(
      patchConfigForModelChange(noWindow, "b", {
        effort: "high",
        contextSize: "256k",
      }),
    ).toMatchObject({
      model: "b",
      contextSize: "",
    });
  });

  it("keeps a shared context size when the next model still advertises it", () => {
    expect(
      patchConfigForModelChange(capabilities, "a", {
        effort: "high",
        contextSize: "256k",
      }),
    ).toMatchObject({
      model: "a",
      contextSize: "256k",
    });
  });

  it("forces fast off when the account can't use fast mode", () => {
    const gated = { ...capabilities, fastDisabledReason: "disabled" } as AgentCapability;
    expect(patchConfigForModelChange(gated, "a", { fast: true })).toMatchObject({
      model: "a",
      fast: false,
    });
  });
});

describe("buildControls model preferences", () => {
  it("restores and records per-model effort and Fast choices for active threads", () => {
    const activeCapabilities = {
      ...capabilities,
      modelEfforts: { a: ["low", "high"], b: ["low", "high"] },
      fastModels: ["a", "b"],
    } as AgentCapability;
    const agent = {
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: activeCapabilities,
    } as AgentStatus;
    const thread = {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "codex",
      config: { model: "a", effort: "low", fast: false },
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    } as Thread;
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const onPreferenceChange =
      vi.fn<
        (
          model: string,
          preference: { effort?: string | undefined; fast?: boolean | undefined },
        ) => void
      >();
    const controls = buildControls(
      thread,
      agent,
      undefined,
      onConfigChange,
      {
        b: { effort: "high", fast: true },
      },
      onPreferenceChange,
    );

    controls
      .find((control) => control.kind === "provider-model")
      ?.onChange({ agentKind: "codex", model: "b" });

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: "b", effort: "high", fast: true }),
    );
    expect(onPreferenceChange).toHaveBeenCalledWith("b", { effort: "high", fast: true });
  });

  it("normalizes a Cursor profile's bracket model before building controls", () => {
    const agent = {
      kind: "cursor:work",
      label: "Cursor Work",
      installed: true,
      authState: "authenticated",
      capabilities: {
        ...capabilities,
        models: [{ id: "gpt-5.1-codex-max", label: "Codex 5.1 Max" }],
      },
    } as AgentStatus;
    const thread = {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "cursor:work",
      config: { model: "gpt-5.1-codex-high-thinking-fast" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    } as Thread;

    const modelControl = buildControls(thread, agent, undefined, vi.fn<() => void>()).find(
      (control) => control.kind === "provider-model",
    );

    expect(modelControl?.kind === "provider-model" ? modelControl.currentModel : undefined).toBe(
      "gpt-5.1-codex-max",
    );
  });
});

describe("buildModelPickerControls fast toggle", () => {
  const baseInput = {
    providers: [],
    selectedAgentKind: "claude",
    model: "a",
    fast: false,
    onProviderModelChange: () => undefined,
    onConfigPatch: () => undefined,
  };

  it("marks the Fast toggle disabled with a reason when the account is gated", () => {
    const controls = buildModelPickerControls({
      ...baseInput,
      capabilities: { ...capabilities, fastDisabledReason: "no fast for you" } as AgentCapability,
    });
    const fastToggle = controls.find((c) => c.kind === "toggle" && c.label === "Fast");
    expect(
      fastToggle && "disabledReason" in fastToggle ? fastToggle.disabledReason : undefined,
    ).toBe("no fast for you");
  });

  it("leaves the Fast toggle enabled when fast mode is available", () => {
    const controls = buildModelPickerControls({ ...baseInput, capabilities });
    const fastToggle = controls.find((c) => c.kind === "toggle" && c.label === "Fast");
    expect(
      fastToggle && "disabledReason" in fastToggle ? fastToggle.disabledReason : undefined,
    ).toBe(undefined);
  });
});

describe("buildProviderModelMenuProviders", () => {
  const cursorStatus: AgentStatus = {
    kind: "cursor",
    label: "Cursor",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [
        { id: "composer-2.5", label: "Composer 2.5" },
        { id: "gpt-5", label: "GPT-5" },
      ],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
      presentationCapabilities: {
        gui: {
          models: [
            {
              id: "gpt-5[context=272k,reasoning=medium,fast=false]",
              label: "GPT-5 · 272K · Medium",
            },
            {
              id: "composer-2.5[context=default,reasoning=medium,fast=false]",
              label: "Composer 2.5 · Medium",
            },
          ],
          efforts: [],
          modelEfforts: {
            "gpt-5[context=272k,reasoning=medium,fast=false]": [],
            "composer-2.5[context=default,reasoning=medium,fast=false]": [],
          },
        },
      },
    },
  };

  it("uses separate Cursor CLI and Cursor ACP hidden-model keys", () => {
    const terminalProviders = buildProviderModelMenuProviders([cursorStatus], {
      presentationMode: "terminal",
      hiddenModelsByAgent: { cursor: ["gpt-5"] },
    });

    expect(terminalProviders[0]).toMatchObject({
      kind: "cursor",
      label: "Cursor CLI",
      hiddenModelsKey: "cursor",
    });
    expect(terminalProviders[0]?.capabilities.models.map((model) => model.id)).toEqual([
      "composer-2.5",
    ]);

    const guiProviders = buildProviderModelMenuProviders([cursorStatus], {
      presentationMode: "gui",
      hiddenModelsByAgent: {
        "cursor-acp": ["gpt-5[context=272k,reasoning=medium,fast=false]"],
      },
    });

    expect(guiProviders[0]).toMatchObject({
      kind: "cursor",
      label: "Cursor",
      hiddenModelsKey: "cursor-acp",
    });
    expect(guiProviders[0]?.capabilities.models.map((model) => model.id)).toEqual([
      "composer-2.5[context=default,reasoning=medium,fast=false]",
    ]);
  });

  it("uses Cursor defaults until a visibility surface is explicitly configured", () => {
    const withDefaults: AgentStatus = {
      ...cursorStatus,
      capabilities: {
        ...cursorStatus.capabilities,
        defaultHiddenModels: ["gpt-5"],
      },
    };

    const defaultProviders = buildProviderModelMenuProviders([withDefaults], {
      presentationMode: "terminal",
    });
    expect(defaultProviders[0]?.capabilities.models.map(({ id }) => id)).toEqual(["composer-2.5"]);

    const explicitlyVisibleProviders = buildProviderModelMenuProviders([withDefaults], {
      presentationMode: "terminal",
      hiddenModelsByAgent: { cursor: [] },
    });
    expect(explicitlyVisibleProviders[0]?.capabilities.models.map(({ id }) => id)).toEqual([
      "composer-2.5",
      "gpt-5",
    ]);
  });

  it("exposes independently installed Cursor ACP and SDK model surfaces", () => {
    const guiCapabilities = {
      ...cursorStatus.capabilities,
      presentationMode: "gui" as const,
      presentationModes: ["gui" as const],
      liveInputMode: "server" as const,
    };
    const providers = expandAgentToVisibilityProviders({
      ...cursorStatus,
      runtimeVariants: {
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: {
            ...guiCapabilities,
            runtimeLabel: "ACP",
            models: [{ id: "acp-model", label: "ACP Model" }],
          },
        },
        sdk: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: false,
          capabilities: {
            ...guiCapabilities,
            runtimeLabel: "SDK",
            models: [{ id: "sdk-model", label: "SDK Model" }],
          },
        },
      },
    });

    expect(providers.map(({ label, hiddenModelsKey }) => ({ label, hiddenModelsKey }))).toEqual([
      { label: "Cursor CLI", hiddenModelsKey: "cursor" },
      { label: "Cursor ACP", hiddenModelsKey: "cursor-acp" },
      { label: "Cursor SDK", hiddenModelsKey: "cursor-sdk" },
    ]);
  });

  it("keeps Antigravity's ACP identity internal while showing its canonical label", () => {
    const guiCapabilities = {
      ...capabilities,
      runtimeLabel: "ACP",
      showRuntimeLabelInPicker: false,
      presentationMode: "gui" as const,
      presentationModes: ["gui" as const],
      models: [{ id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" }],
    };
    const providers = expandAgentToVisibilityProviders({
      kind: "antigravity",
      label: "Antigravity",
      installed: true,
      authState: "authenticated",
      capabilities: guiCapabilities,
      runtimeVariants: {
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: guiCapabilities,
        },
      },
    });

    expect(providers).toMatchObject([
      {
        label: "Antigravity",
        modelPickerKey: "antigravity:gui:acp",
        hiddenModelsKey: "antigravity-acp",
      },
    ]);
  });

  it("omits an installed Cursor SDK surface until its API key is authenticated", () => {
    const guiCapabilities = {
      ...cursorStatus.capabilities,
      presentationMode: "gui" as const,
      presentationModes: ["gui" as const],
      liveInputMode: "server" as const,
    };
    const providers = expandAgentToVisibilityProviders({
      ...cursorStatus,
      runtimeVariants: {
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: {
            ...guiCapabilities,
            runtimeLabel: "ACP",
            models: [{ id: "acp-model", label: "ACP Model" }],
          },
        },
        sdk: {
          presentationMode: "gui",
          installed: true,
          authState: "missing",
          authUsesProviderLogin: false,
          capabilities: {
            ...guiCapabilities,
            runtimeLabel: "SDK",
            models: [{ id: "sdk-model", label: "SDK Model" }],
          },
        },
      },
    });

    expect(providers.map(({ label }) => label)).toEqual(["Cursor CLI", "Cursor ACP"]);
  });
});

describe("expandAgentToVisibilityProviders unnamed surfaces", () => {
  // Synthetic adapter that publishes a different model catalog per presentation
  // surface without naming runtime variants: a terminal CLI catalog plus a
  // smaller structured chat catalog.
  const baseCatalog = {
    models: [
      { id: "t1", label: "T1" },
      { id: "t2", label: "T2" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal", "gui"],
    settingDefs: [],
  } as unknown as AgentCapability;

  const chatOverride = {
    models: [
      { id: "c1", label: "C1" },
      { id: "c2", label: "C2" },
      { id: "c3", label: "C3" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: false,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
  } as unknown as AgentCapability;

  const agent = (agentCapabilities: AgentCapability): AgentStatus => ({
    kind: "acme",
    label: "Acme",
    installed: true,
    authState: "authenticated",
    capabilities: agentCapabilities,
  });

  it("expands one unnamed surface per presentation mode when the catalogs differ", () => {
    const providers = expandAgentToVisibilityProviders(
      agent({ ...baseCatalog, presentationCapabilities: { gui: chatOverride } }),
    );

    expect(
      providers.map((provider) => ({
        label: provider.label,
        presentationMode: provider.presentationMode,
        modelPickerKey: provider.modelPickerKey,
        hiddenModelsKey: provider.hiddenModelsKey,
        modelIds: provider.capabilities.models.map((model) => model.id),
        liveInputMode: provider.capabilities.liveInputMode,
      })),
    ).toEqual([
      {
        label: "Acme",
        presentationMode: "terminal",
        modelPickerKey: "acme:terminal",
        hiddenModelsKey: "acme",
        modelIds: ["t1", "t2"],
        liveInputMode: "terminal",
      },
      {
        label: "Acme",
        presentationMode: "gui",
        modelPickerKey: "acme:gui",
        hiddenModelsKey: "acme",
        modelIds: ["c1", "c2", "c3"],
        liveInputMode: "server",
      },
    ]);
  });

  it("keeps the ordinary single row when an override redeclares the root catalog", () => {
    // Redeclaring the root ids in another order is the same visibility catalog.
    const singleRowCatalog = {
      ...baseCatalog,
      presentationCapabilities: {
        gui: { ...chatOverride, models: [...baseCatalog.models].reverse() },
      },
    } as AgentCapability;

    expect(expandAgentToVisibilityProviders(agent(singleRowCatalog))).toEqual([
      { kind: "acme", label: "Acme", capabilities: singleRowCatalog },
    ]);
  });

  it("drops an unnamed surface whose only catalog entry is the synthetic auto model", () => {
    const providers = expandAgentToVisibilityProviders(
      agent({
        ...baseCatalog,
        presentationCapabilities: {
          gui: { ...chatOverride, models: [{ id: "auto", label: "Auto" }] },
        },
      }),
    );

    expect(providers.map((provider) => provider.presentationMode)).toEqual(["terminal"]);
    expect(providers[0]?.capabilities.models.map((model) => model.id)).toEqual(["t1", "t2"]);
  });
});

describe("expandAgentToVisibilityProviders ordinary surfaces", () => {
  // Provider with no runtime variants and no distinct presentation catalogs —
  // the single-row path. A catalog with nothing real to toggle must not earn a
  // visibility row, same as the unnamed and runtime-variant branches.
  const catalog = (models: AgentCapability["models"]): AgentCapability =>
    ({
      models,
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    }) as unknown as AgentCapability;

  const agent = (agentCapabilities: AgentCapability): AgentStatus => ({
    kind: "acme",
    label: "Acme",
    installed: true,
    authState: "authenticated",
    capabilities: agentCapabilities,
  });

  it("drops the ordinary row for a provider with an empty catalog", () => {
    expect(expandAgentToVisibilityProviders(agent(catalog([])))).toEqual([]);
  });

  it("drops the ordinary row when the only catalog entry is the synthetic auto model", () => {
    expect(
      expandAgentToVisibilityProviders(agent(catalog([{ id: "auto", label: "Auto" }]))),
    ).toEqual([]);
  });

  it("keeps the ordinary single row when the catalog lists a real model", () => {
    const agentCapabilities = catalog([{ id: "t1", label: "T1" }]);
    expect(expandAgentToVisibilityProviders(agent(agentCapabilities))).toEqual([
      { kind: "acme", label: "Acme", capabilities: agentCapabilities },
    ]);
  });
});

describe("buildControls hidden current model", () => {
  const agent = {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities,
  } as AgentStatus;
  const threadWithModel = (model: string): Thread =>
    ({
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "codex",
      config: { model },
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }) as Thread;

  function pickerProviderModels(thread: Thread, hidden: readonly string[] | undefined) {
    const control = buildControls(thread, agent, hidden, vi.fn<() => void>()).find(
      (c) => c.kind === "provider-model",
    );
    return control?.kind === "provider-model"
      ? control.providers[0]?.capabilities.models.map((m) => m.id)
      : undefined;
  }

  it("keeps the running model in the picker list so it can be labeled", () => {
    expect(pickerProviderModels(threadWithModel("b"), ["b"])).toEqual(["a", "b"]);
  });

  it("keeps the running model when the provider hides it by default", () => {
    const defaultHidden = {
      ...agent,
      capabilities: { ...capabilities, defaultHiddenModels: ["b"] } as AgentCapability,
    } as AgentStatus;
    const control = buildControls(
      threadWithModel("b"),
      defaultHidden,
      undefined,
      vi.fn<() => void>(),
    ).find((c) => c.kind === "provider-model");
    expect(
      control?.kind === "provider-model"
        ? control.providers[0]?.capabilities.models.map((m) => m.id)
        : undefined,
    ).toEqual(["a", "b"]);
  });

  it("still hides other models and drops ids the surface no longer advertises", () => {
    expect(pickerProviderModels(threadWithModel("a"), ["b"])).toEqual(["a"]);
    expect(pickerProviderModels(threadWithModel("gone"), ["b"])).toEqual(["a"]);
  });
});

describe("buildModelPickerControls family controls", () => {
  const familyDescriptor = {
    model: "f-alpha-x-low",
    label: "Fusion",
    selectors: [
      {
        id: "lead",
        labelKey: "modelSelection.lead",
        options: [
          { id: "alpha", label: "Alpha" },
          { id: "beta", label: "Beta" },
        ],
      },
      {
        id: "sidekick",
        labelKey: "modelSelection.sidekick",
        options: [
          { id: "x", label: "X" },
          { id: "y", label: "Y" },
        ],
      },
    ],
    bindings: { effort: "model" as const, fast: "model" as const },
    members: [
      {
        model: "f-alpha-x-low",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "low",
        fast: false,
      },
      // alpha/x/high + Fast is a hole: no member exists.
      {
        model: "f-alpha-x-high",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "high",
        fast: false,
      },
      {
        model: "f-alpha-x-low-fast",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "low",
        fast: true,
      },
      {
        model: "f-alpha-y-low",
        selections: { lead: "alpha", sidekick: "y" },
        effort: "low",
        fast: false,
      },
      {
        model: "f-beta-x-low",
        selections: { lead: "beta", sidekick: "x" },
        effort: "low",
        fast: false,
      },
    ],
  };
  const familyCapabilities = {
    models: [
      { id: "solo", label: "Solo" },
      { id: "f-alpha-x-low", label: "Fusion (Alpha Low + X)" },
      { id: "f-alpha-x-high", label: "Fusion (Alpha High + X)" },
      { id: "f-alpha-x-low-fast", label: "Fusion (Alpha Low + X Fast)" },
      { id: "f-alpha-y-low", label: "Fusion (Alpha Low + Y)" },
      { id: "f-beta-x-low", label: "Fusion (Beta Low + X)" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "direct",
    presentationMode: "gui",
    settingDefs: [],
    modelFamilies: [familyDescriptor],
  } as unknown as AgentCapability;

  function pickerInput(overrides: { model: string; effort?: string; fast?: boolean }) {
    const onConfigPatch =
      vi.fn<(patch: { effort?: string; fast?: boolean; model?: string }) => void>();
    const controls = buildModelPickerControls({
      providers: [],
      selectedAgentKind: "agent",
      ...overrides,
      capabilities: familyCapabilities,
      onProviderModelChange: vi.fn<(next: { agentKind: string; model: string }) => void>(),
      onConfigPatch: onConfigPatch as never,
    });
    return { controls, onConfigPatch };
  }

  it("does not add a registration-only carrier to ordinary models", () => {
    registerComposerControls("ordinary-pair-test", modelFamilySelectorControls);
    const config = { model: "solo", effort: "high", fast: false };
    const { controls } = pickerInput(config);
    const merged = appendProviderComposerControls(controls, {
      agentKind: "ordinary-pair-test",
      capabilities: familyCapabilities,
      config,
      onConfigChange: vi.fn<() => void>(),
    });
    expect(merged).toEqual(controls);
    expect(
      merged.some((control) => control.kind === "effort-context" && control.familySelection),
    ).toBe(false);
  });

  it("keeps the ordinary Fast toggle beside the paired control and preserves context callbacks", () => {
    registerComposerControls("paired-test", modelFamilySelectorControls);
    const config = { model: "f-alpha-x-low", effort: "", fast: false };
    const { controls, onConfigPatch } = pickerInput(config);
    const context = controls.find((control) => control.kind === "effort-context")!;
    if (context.kind !== "effort-context") throw new Error("Expected effort control");
    const onContextChange = vi.fn<(value: string) => void>();
    context.contextSizes = [
      { id: "small", label: "Small" },
      { id: "large", label: "Large" },
    ];
    context.contextValue = "small";
    context.onContextChange = onContextChange;
    context.confirmContextChange = true;
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const merged = appendProviderComposerControls(controls, {
      agentKind: "paired-test",
      capabilities: familyCapabilities,
      config,
      onConfigChange,
    });
    // The paired control absorbs only the effort carrier; Fast stays a
    // separate composer toggle and the family selection carries no fast data.
    expect(merged.map((control) => control.kind)).toEqual([
      "provider-model",
      "toggle",
      "effort-context",
    ]);
    const paired = merged[2]!;
    if (paired.kind !== "effort-context") throw new Error("Expected paired control");
    expect(paired.familySelection?.columns).toHaveLength(2);
    expect(paired.familySelection).not.toHaveProperty("fast");
    expect(paired.contextValue).toBe("small");
    expect(paired.confirmContextChange).toBe(true);
    paired.onContextChange?.("large");
    expect(onContextChange).toHaveBeenCalledWith("large");
    // The retained toggle still resolves the model-bound fast edit into the
    // exact Fast sibling member.
    const fast = merged[1]!;
    if (fast.kind !== "toggle" || fast.label !== "Fast") throw new Error("Expected Fast toggle");
    fast.onChange!(true);
    expect(onConfigPatch).toHaveBeenLastCalledWith(
      {
        model: "f-alpha-x-low-fast",
        effort: "",
        fast: false,
      },
      { kind: "family-resolved" },
    );
  });

  it("resolves the composer Fast toggle of a config-bound pair to the fast carrier patch", () => {
    registerComposerControls("paired-config-fast-test", modelFamilySelectorControls);
    const configBound = {
      ...familyDescriptor,
      bindings: { effort: "config" as const, fast: "config" as const },
      members: familyDescriptor.members
        .filter((member) => member.model === "f-alpha-x-low" || member.selections.lead !== "alpha")
        .map(({ model, selections }) => ({ model, selections })),
    };
    const configCapabilities = {
      ...familyCapabilities,
      fastModels: ["f-alpha-x-low", "f-alpha-x-high"],
      modelFamilies: [configBound],
    } as unknown as AgentCapability;
    const onConfigPatch = vi.fn<(patch: Record<string, unknown>) => void>();
    const controls = buildModelPickerControls({
      providers: [],
      selectedAgentKind: "agent",
      model: "f-alpha-x-low",
      effort: "low",
      capabilities: configCapabilities,
      onProviderModelChange: vi.fn<(next: { agentKind: string; model: string }) => void>(),
      onConfigPatch: onConfigPatch as never,
    });
    const merged = appendProviderComposerControls(controls, {
      agentKind: "paired-config-fast-test",
      capabilities: configCapabilities,
      config: { model: "f-alpha-x-low", effort: "low", fast: false },
      onConfigChange: vi.fn<() => void>(),
    });
    const fast = merged.find((control) => control.kind === "toggle" && control.label === "Fast") as
      | { isSelected: boolean; onChange: (selected: boolean) => void }
      | undefined;
    expect(
      merged.filter((control) => control.kind === "effort-context" && control.familySelection),
    ).toHaveLength(1);
    expect(
      merged.filter((control) => control.kind === "toggle" && control.label === "Fast"),
    ).toHaveLength(1);
    expect(fast).toBeDefined();
    expect(fast!.isSelected).toBe(false);
    fast!.onChange(true);
    expect(onConfigPatch).toHaveBeenLastCalledWith({ fast: true }, { kind: "family-resolved" });
  });

  it("derives Effort and Fast display from the member tuple while the saved carriers stay inert", () => {
    // A raw Fast UID with the inert `fast: false` seed still displays the
    // UID's Fast state.
    const { controls } = pickerInput({ model: "f-alpha-x-low-fast", effort: "", fast: false });
    const fast = controls.find((control) => control.kind === "toggle") as {
      isSelected: boolean;
      disabledReason?: string;
    };
    expect(fast.isSelected).toBe(true);
    expect(fast.disabledReason).toBeUndefined();
    // The encoded ladder holds the current Fast coordinate: from this Fast
    // member only one effort is reachable, so no Effort menu renders.
    expect(controls.find((control) => control.kind === "effort-context")).toBeUndefined();

    // The plain member derives its UID effort into the ladder view.
    const plain = pickerInput({ model: "f-alpha-x-low", effort: "", fast: false });
    const effort = plain.controls.find((control) => control.kind === "effort-context") as {
      efforts: ReadonlyArray<{ id: string }>;
      effortValue?: string;
    };
    expect(effort.efforts.map((entry) => entry.id)).toEqual(["low", "high"]);
    expect(effort.effortValue).toBe("low");
    const plainFast = plain.controls.find((control) => control.kind === "toggle") as {
      isSelected: boolean;
    };
    expect(plainFast.isSelected).toBe(false);
  });

  it("flips Fast off to the exact plain sibling with inert seeds", () => {
    const { controls, onConfigPatch } = pickerInput({
      model: "f-alpha-x-low-fast",
      effort: "",
      fast: false,
    });
    const fast = controls.find((control) => control.kind === "toggle") as {
      onChange: (selected: boolean) => void;
    };
    fast.onChange(false);
    expect(onConfigPatch).toHaveBeenCalledWith(
      {
        model: "f-alpha-x-low",
        effort: "",
        fast: false,
      },
      { kind: "family-resolved" },
    );
  });

  it("disables Fast with a reason when the opposite sibling is a hole", () => {
    const { controls, onConfigPatch } = pickerInput({
      model: "f-alpha-x-high",
      effort: "",
      fast: false,
    });
    const fast = controls.find((control) => control.kind === "toggle") as {
      isSelected: boolean;
      disabledReason?: string;
      onChange: (selected: boolean) => void;
    };
    expect(fast.isSelected).toBe(false);
    expect(fast.disabledReason).toBeTruthy();
    fast.onChange(true);
    expect(onConfigPatch).not.toHaveBeenCalled();
  });

  it("keeps a meaningful legacy override readable until an explicit corrective edit", () => {
    // A saved meaningful effort next to a family UID was previously rejected by
    // the strict resolver: the raw view stays (no hydration edit) and an
    // explicit ladder choice intentionally initializes a valid selection.
    const { controls, onConfigPatch } = pickerInput({
      model: "f-alpha-x-low",
      effort: "ultra",
      fast: false,
    });
    const effort = controls.find((control) => control.kind === "effort-context") as {
      efforts: ReadonlyArray<{ id: string }>;
      effortValue?: string;
      onEffortChange: (value: string) => void;
    };
    expect(effort.efforts.map((entry) => entry.id)).toEqual(["low", "high"]);
    expect(effort.effortValue).toBe("ultra");
    effort.onEffortChange("high");
    expect(onConfigPatch).toHaveBeenCalledWith(
      {
        model: "f-alpha-x-high",
        effort: "",
        fast: false,
      },
      { kind: "family-resolved" },
    );
  });

  it("falls back to the ordinary ladder for nonfamily models on a relation surface", () => {
    const withLadders = {
      ...familyCapabilities,
      efforts: ["low", "high"],
      modelEfforts: { solo: ["low", "high"] },
      fastModels: ["solo"],
    } as unknown as AgentCapability;
    const onConfigPatch = vi.fn<(patch: { effort?: string }) => void>();
    const controls = buildModelPickerControls({
      providers: [],
      selectedAgentKind: "agent",
      model: "solo",
      effort: "low",
      capabilities: withLadders,
      onProviderModelChange: vi.fn<(next: { agentKind: string; model: string }) => void>(),
      onConfigPatch: onConfigPatch as never,
    });
    const effort = controls.find((control) => control.kind === "effort-context") as {
      efforts: ReadonlyArray<{ id: string }>;
      effortValue?: string;
      onEffortChange: (value: string) => void;
    };
    expect(effort.efforts.map((entry) => entry.id)).toEqual(["low", "high"]);
    effort.onEffortChange("high");
    expect(onConfigPatch).toHaveBeenCalledWith({ effort: "high" }, { kind: "family-resolved" });
  });
});

describe("buildControls selection binding events", () => {
  // Encoded GUI pair whose stored seeds the surface declares redundant, so a
  // deliberate member pick records exactly the inert carriers it wrote.
  const encodedDescriptor = {
    model: "pair-alpha-x",
    label: "Pair",
    selectors: [
      {
        id: "lead",
        labelKey: "modelSelection.lead",
        options: [
          { id: "alpha", label: "Alpha" },
          { id: "beta", label: "Beta" },
        ],
      },
      {
        id: "sidekick",
        labelKey: "modelSelection.sidekick",
        options: [
          { id: "x", label: "X" },
          { id: "y", label: "Y" },
        ],
      },
    ],
    bindings: { effort: "model" as const, fast: "model" as const },
    redundantValues: { effort: [""], fast: [false] },
    members: [
      {
        model: "pair-alpha-x",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "low",
        fast: false,
      },
      {
        model: "pair-alpha-y",
        selections: { lead: "alpha", sidekick: "y" },
        effort: "high",
        fast: true,
      },
      {
        model: "pair-beta-x",
        selections: { lead: "beta", sidekick: "x" },
        effort: "low",
        fast: false,
      },
    ],
  };
  const encodedCapabilities = {
    models: [
      { id: "solo", label: "Solo" },
      { id: "pair-alpha-x", label: "Pair (Alpha + X)" },
      { id: "pair-alpha-y", label: "Pair (Alpha + Y)" },
      { id: "pair-beta-x", label: "Pair (Beta + X)" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
    modelFamilies: [encodedDescriptor],
  } as unknown as AgentCapability;

  // Config-bound variant: every axis is an independent carrier, and the
  // surface declares the meaningful carriers a deliberate edit may write.
  const configBoundCapabilities = {
    ...encodedCapabilities,
    efforts: ["low", "high"],
    modelEfforts: {
      solo: ["low", "high"],
      "pair-alpha-x": ["low", "high"],
      "pair-alpha-y": ["low", "high"],
    },
    modelFamilies: [
      {
        ...encodedDescriptor,
        bindings: { effort: "config" as const, fast: "config" as const },
        redundantValues: { effort: ["high"], fast: [true] },
        members: encodedDescriptor.members.map(({ model, selections }) => ({ model, selections })),
      },
    ],
  } as unknown as AgentCapability;

  const guiAgent = (agentKind: string, agentCapabilities: AgentCapability): AgentStatus =>
    ({
      kind: agentKind,
      label: "Agent",
      installed: true,
      authState: "authenticated",
      capabilities: agentCapabilities,
    }) as AgentStatus;

  function bindingThread(
    agentKind: string,
    config: Record<string, unknown>,
    agentInstanceId?: string,
  ): Thread {
    return {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind,
      config,
      ...(agentInstanceId ? { agentInstanceId } : {}),
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    } as Thread;
  }

  const owner = (agentKind: string, agentInstanceId?: string) => ({
    agentKind,
    presentationMode: "gui",
    ...(agentInstanceId ? { agentInstanceId } : {}),
  });

  function pick(controls: ComposerControl[], model: string, selectionIntent?: "family" | "exact") {
    const control = controls.find((candidate) => candidate.kind === "provider-model")!;
    if (control.kind !== "provider-model") throw new Error("Expected picker");
    control.onChange({
      agentKind: "agent",
      model,
      ...(selectionIntent ? { selectionIntent } : {}),
    });
  }

  it("mints a fresh record with the exact owner on a family pick from a raw model", () => {
    const stale = {
      version: 1,
      kind: "family-member",
      owner: { agentKind: "agent", presentationMode: "terminal" },
      model: "pair-alpha-x",
      inertValues: { effort: "low" },
    };
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("agent", { model: "solo", effort: "", fast: false, selectionBinding: stale }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      onConfigChange,
    );
    pick(controls, "pair-alpha-x", "family");
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        model: "pair-alpha-x",
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: owner("agent"),
          model: "pair-alpha-x",
          inertValues: { effort: "", fast: false },
        },
      }),
    );
  });

  it("never mints through an exact member pick and drops an existing record", () => {
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("agent", {
        model: "solo",
        effort: "",
        fast: false,
        mode: "plan",
        approvalPolicy: "never",
        sandboxMode: "off",
        browserMcp: true,
      }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      onConfigChange,
    );
    // A raw exact row of a member never mints: the member patch lands with
    // its inert seeds and the record-less thread stays record-less.
    pick(controls, "pair-alpha-y", "exact");
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        model: "pair-alpha-y",
        mode: "plan",
        approvalPolicy: "never",
        sandboxMode: "off",
        browserMcp: true,
      }),
    );
    expect(onConfigChange.mock.calls[0]?.[0]?.selectionBinding).toBeUndefined();

    // The same raw row over an existing matching record drops it — the
    // helper's collateral member patch applies, the evidence goes.
    const stamped = vi.fn<(config: Thread["config"]) => void>();
    const stampedControls = buildControls(
      bindingThread("agent", {
        model: "pair-alpha-y",
        effort: "",
        fast: false,
        mode: "plan",
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: owner("agent"),
          model: "pair-alpha-y",
          inertValues: { effort: "", fast: false },
        },
      }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      stamped,
    );
    pick(stampedControls, "pair-alpha-x", "exact");
    expect(stamped).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ model: "pair-alpha-x", mode: "plan" }),
    );
    expect(stamped.mock.calls[0]?.[0]?.selectionBinding).toBeUndefined();
  });

  it("drops the record as a binding-only persist on a same-UID exact member re-pick", () => {
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("agent", {
        model: "pair-alpha-y",
        effort: "",
        fast: false,
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: owner("agent"),
          model: "pair-alpha-y",
          inertValues: { effort: "", fast: false },
        },
      }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      onConfigChange,
    );
    pick(controls, "pair-alpha-y", "exact");
    const persisted = onConfigChange.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({ model: "pair-alpha-y", effort: "", fast: false });
    expect(persisted?.selectionBinding).toBeUndefined();
  });

  it("keeps own false and empty carriers through the composer's UI selections", () => {
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("agent", {
        model: "pair-alpha-x",
        effort: "",
        contextSize: "",
        fast: false,
        thinking: false,
      }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      onConfigChange,
    );
    // The own values reach the controls as stored: no model-default Fast
    // state or invented ladder is displayed for the member row.
    const fastToggle = controls.find((control) => control.kind === "toggle");
    expect(fastToggle?.kind === "toggle" && fastToggle.isSelected).toBe(false);
    expect(controls.some((control) => control.kind === "effort-context")).toBe(false);

    // A raw member pick keeps every own-present empty/false carrier in the
    // persisted config instead of normalizing them to model defaults.
    pick(controls, "pair-beta-x", "exact");
    const persisted = onConfigChange.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      model: "pair-beta-x",
      effort: "",
      contextSize: "",
      fast: false,
      thinking: false,
    });
    expect(persisted?.selectionBinding).toBeUndefined();
  });

  it("keeps an unresolvable raw pick effect-free", () => {
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const onPreferenceChange = vi.fn<() => void>();
    const controls = buildControls(
      bindingThread("agent", { model: "pair-alpha-x", effort: "", fast: false }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      onConfigChange,
      {},
      onPreferenceChange,
    );
    pick(controls, "ghost-model", "exact");
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onPreferenceChange).not.toHaveBeenCalled();
  });

  it("persists a record drop for a raw same-UID re-pick and skips a no-record re-pick", () => {
    const rawCapabilities = {
      models: [{ id: "only", label: "Only" }],
      efforts: [],
      modelEfforts: {},
      modelContextSizes: { only: ["128k"] },
      contextSizes: [{ id: "128k", label: "128k" }],
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "direct",
      presentationMode: "gui",
      settingDefs: [],
    } as unknown as AgentCapability;
    const base = { model: "only", effort: "", contextSize: "128k", fast: false, thinking: false };
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("raw", {
        ...base,
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: owner("raw"),
          model: "only",
          inertValues: { fast: false },
        },
      }),
      guiAgent("raw", rawCapabilities),
      undefined,
      onConfigChange,
    );
    pick(controls, "only");
    const persisted = onConfigChange.mock.calls[0]?.[0];
    expect(persisted).toMatchObject(base);
    expect(persisted?.selectionBinding).toBeUndefined();

    // Without a record the re-pick changes nothing at all: no setter call, no
    // preference write.
    const untouched = vi.fn<(config: Thread["config"]) => void>();
    const untouchedPreference = vi.fn<() => void>();
    const plain = buildControls(
      bindingThread("raw", base),
      guiAgent("raw", rawCapabilities),
      undefined,
      untouched,
      {},
      untouchedPreference,
    );
    pick(plain, "only");
    expect(untouched).not.toHaveBeenCalled();
    expect(untouchedPreference).not.toHaveBeenCalled();
  });

  it("revokes only the touched axis on a same-value effort edit", () => {
    const record = {
      version: 1,
      kind: "family-member",
      owner: owner("agent"),
      model: "pair-alpha-x",
      inertValues: { effort: "high", fast: true },
    };
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("agent", {
        model: "pair-alpha-x",
        effort: "high",
        fast: true,
        selectionBinding: record,
      }),
      guiAgent("agent", configBoundCapabilities),
      undefined,
      onConfigChange,
    );
    const effort = controls.find((control) => control.kind === "effort-context")!;
    if (effort.kind !== "effort-context") throw new Error("Expected effort control");
    effort.onEffortChange?.("high");
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        selectionBinding: { ...record, inertValues: { fast: true } },
      }),
    );
  });

  it("drops the record when a same-value edit empties it", () => {
    const record = {
      version: 1,
      kind: "family-member",
      owner: owner("agent"),
      model: "pair-alpha-x",
      inertValues: { effort: "high" },
    };
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("agent", {
        model: "pair-alpha-x",
        effort: "high",
        selectionBinding: record,
      }),
      guiAgent("agent", configBoundCapabilities),
      undefined,
      onConfigChange,
    );
    const effort = controls.find((control) => control.kind === "effort-context")!;
    if (effort.kind !== "effort-context") throw new Error("Expected effort control");
    effort.onEffortChange?.("high");
    const persisted = onConfigChange.mock.calls[0]?.[0];
    expect(persisted?.effort).toBe("high");
    expect(persisted?.selectionBinding).toBeUndefined();
  });

  it("skips a family-row retain whose record still matches and persists a stale drop", () => {
    const record = {
      version: 1,
      kind: "family-member",
      owner: owner("agent"),
      model: "pair-alpha-y",
      inertValues: { effort: "", fast: false },
    };
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const onPreferenceChange = vi.fn<() => void>();
    const controls = buildControls(
      bindingThread("agent", {
        model: "pair-alpha-y",
        effort: "",
        fast: false,
        selectionBinding: record,
      }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      onConfigChange,
      {},
      onPreferenceChange,
    );
    pick(controls, "pair-alpha-x", "family");
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onPreferenceChange).not.toHaveBeenCalled();

    const staleOwner = { agentKind: "agent", presentationMode: "terminal" };
    const afterStale = vi.fn<(config: Thread["config"]) => void>();
    const staleControls = buildControls(
      bindingThread("agent", {
        model: "pair-alpha-y",
        effort: "",
        fast: false,
        selectionBinding: { ...record, owner: staleOwner },
      }),
      guiAgent("agent", encodedCapabilities),
      undefined,
      afterStale,
    );
    pick(staleControls, "pair-alpha-x", "family");
    const persisted = afterStale.mock.calls[0]?.[0];
    expect(persisted?.model).toBe("pair-alpha-y");
    expect(persisted?.selectionBinding).toBeUndefined();
  });

  it("mints with the thread's actual instance id", () => {
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("agent", { model: "solo", effort: "", fast: false }, "inst-9"),
      guiAgent("agent", encodedCapabilities),
      undefined,
      onConfigChange,
    );
    pick(controls, "pair-alpha-x", "family");
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        selectionBinding: expect.objectContaining({ owner: owner("agent", "inst-9") }),
      }),
    );
  });

  it("routes a registered family selector edit through the same seam", () => {
    registerComposerControls("binding-seam-pair", modelFamilySelectorControls);
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      bindingThread("binding-seam-pair", { model: "pair-alpha-x", effort: "", fast: false }),
      guiAgent("binding-seam-pair", encodedCapabilities),
      undefined,
      onConfigChange,
    );
    const paired = controls.find(
      (control) => control.kind === "effort-context" && control.familySelection,
    )!;
    if (paired.kind !== "effort-context" || !paired.familySelection)
      throw new Error("Expected paired control");
    paired.familySelection.columns[0]!.models.onChange("beta");
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        model: "pair-beta-x",
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: owner("binding-seam-pair"),
          model: "pair-beta-x",
          inertValues: { effort: "", fast: false },
        },
      }),
    );
  });
});

describe("buildControls family model picks", () => {
  // The GUI surface re-declares the relation: presentation overrides never
  // inherit the root relation (surface isolation).
  const pairOverride = {
    models: [
      { id: "pair-alpha-x", label: "Fusion (Alpha + X)" },
      { id: "pair-alpha-y", label: "Fusion (Alpha + Y)" },
    ],
    efforts: ["low", "high"],
    modelEfforts: {
      "pair-alpha-x": ["low", "high"],
      "pair-alpha-y": ["low", "high"],
    },
    modelFamilies: [
      {
        model: "pair-alpha-x",
        label: "Fusion",
        selectors: [
          {
            id: "lead",
            labelKey: "modelSelection.lead",
            options: [
              { id: "alpha", label: "Alpha" },
              { id: "beta", label: "Beta" },
            ],
          },
          {
            id: "sidekick",
            labelKey: "modelSelection.sidekick",
            options: [
              { id: "x", label: "X" },
              { id: "y", label: "Y" },
            ],
          },
        ],
        bindings: { effort: "config" as const, fast: "config" as const },
        members: [
          { model: "pair-alpha-x", selections: { lead: "alpha", sidekick: "x" } },
          { model: "pair-alpha-y", selections: { lead: "alpha", sidekick: "y" } },
        ],
      },
    ],
  };
  const pairCapabilities = {
    models: [
      { id: "solo", label: "Solo" },
      { id: "pair-alpha-x", label: "Fusion (Alpha + X)" },
      { id: "pair-alpha-y", label: "Fusion (Alpha + Y)" },
    ],
    efforts: ["low", "high"],
    modelEfforts: {
      solo: ["low", "high"],
      "pair-alpha-x": ["low", "high"],
      "pair-alpha-y": ["low", "high"],
    },
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
    presentationCapabilities: { gui: pairOverride },
  } as unknown as AgentCapability;

  function threadFor(model: string, config: Record<string, unknown>): Thread {
    return {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "agent",
      config: { model, ...config },
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    } as Thread;
  }

  it("keeps independent carriers when picking a sibling pair", () => {
    const agent = {
      kind: "agent",
      label: "Agent",
      installed: true,
      authState: "authenticated",
      capabilities: pairCapabilities,
    } as AgentStatus;
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(
      threadFor("pair-alpha-x", { effort: "high", fast: true }),
      agent,
      undefined,
      onConfigChange,
    );
    controls
      .find((control) => control.kind === "provider-model")
      ?.onChange({ agentKind: "agent", model: "pair-alpha-y" });
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: "pair-alpha-y", effort: "high", fast: true }),
    );
  });

  it("treats a projected family-row click inside the family as a no-op that preserves the member", () => {
    const agent = {
      kind: "agent",
      label: "Agent",
      installed: true,
      authState: "authenticated",
      capabilities: pairCapabilities,
    } as AgentStatus;
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const onPreferenceChange = vi.fn<() => void>();
    const controls = buildControls(
      threadFor("pair-alpha-y", { effort: "low" }),
      agent,
      undefined,
      onConfigChange,
      {},
      onPreferenceChange,
    );
    // The projected family row id is the representative; the row's `family`
    // intent resolves to an empty patch and nothing is rewritten.
    controls
      .find((control) => control.kind === "provider-model")
      ?.onChange({
        agentKind: "agent",
        model: "pair-alpha-x",
        selectionIntent: "family",
      });
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onPreferenceChange).not.toHaveBeenCalled();
  });

  it("selects the exact representative for an exact favorite of the representative", () => {
    const agent = {
      kind: "agent",
      label: "Agent",
      installed: true,
      authState: "authenticated",
      capabilities: pairCapabilities,
    } as AgentStatus;
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const onPreferenceChange = vi.fn<() => void>();
    const controls = buildControls(
      threadFor("pair-alpha-y", { effort: "low" }),
      agent,
      undefined,
      onConfigChange,
      {},
      onPreferenceChange,
    );
    // The exact favorite row of the representative carries the same UID as the
    // family row but the `exact` intent: the named member is selected, not
    // retained. Carriers stay as requested on a config-bound family.
    controls
      .find((control) => control.kind === "provider-model")
      ?.onChange({
        agentKind: "agent",
        model: "pair-alpha-x",
        selectionIntent: "exact",
      });
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: "pair-alpha-x", effort: "low" }),
    );
    // The pick's own posture is persisted as the preference for the member.
    expect(onPreferenceChange).toHaveBeenCalledWith("pair-alpha-x", { effort: "low" });
  });
});
