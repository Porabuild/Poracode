// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentStatus, Thread } from "@/shared/contracts";
import {
  buildControls,
  buildModelPickerControls,
  buildProviderModelMenuProviders,
  expandAgentToVisibilityProviders,
  patchConfigForModelChange,
} from "./buildModelPickerControls";

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

    const modelControl = buildControls(thread, agent, undefined, vi.fn()).find(
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
