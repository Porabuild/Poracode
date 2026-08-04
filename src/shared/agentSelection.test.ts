import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus, SessionRef } from "./contracts";
import {
  agentStatusForPresentation,
  authStatusForPresentation,
  authStateForPresentation,
  capabilitiesForPresentation,
  filterHiddenModels,
  modelSelectionFor,
  resolveHiddenModelIds,
  resolveModelSelection,
  resolveReasoningSelection,
  validateAgentModelSelection,
} from "./agentSelection";

const capabilities: AgentCapability = {
  models: [{ id: "terminal-model", label: "Terminal" }],
  efforts: ["low"],
  modelEfforts: {},
  fastModels: [],
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
  presentationCapabilities: {
    gui: {
      models: [{ id: "chat-model", label: "Chat" }],
      efforts: ["medium", "high"],
      modelEfforts: { "chat-model": ["high", "xhigh"] },
      defaultEffort: "high",
      fastModels: ["chat-model"],
      fastDisabledReason: "Fast is unavailable for this account",
      presentationMode: "gui",
    },
  },
};

function sessionRef(providerSessionId: string): SessionRef {
  return { providerSessionId, discoveredAt: "2026-07-27T00:00:00.000Z" };
}

describe("agent selection", () => {
  it("resolves the composer surface before exposing model controls", () => {
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(gui.models).toEqual([{ id: "chat-model", label: "Chat" }]);
    expect(modelSelectionFor(gui, "chat-model")).toEqual({
      reasoning: { values: ["high", "xhigh"], default: "high" },
      fast: {
        supported: true,
        available: false,
        disabledReason: "Fast is unavailable for this account",
      },
    });
  });

  it("uses the same model and reasoning fallbacks as the composer", () => {
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(resolveModelSelection(gui, "missing")).toBe("chat-model");
    expect(resolveReasoningSelection(gui, "chat-model", "missing")).toBe("high");
  });

  it("prefers a model's own probed default effort over the provider-wide one", () => {
    const withModelDefaults: AgentCapability = {
      ...capabilities,
      models: [
        { id: "highspeed", label: "Highspeed" },
        { id: "k3", label: "K3" },
      ],
      efforts: ["low", "medium", "high", "max"],
      defaultEffort: "low",
      modelDefaultEfforts: { k3: "high", "removed-model": "max", highspeed: "unsupported" },
    };
    // Per-model default wins; an unsupported per-model value falls back to the
    // provider default; models without an entry keep the provider default.
    expect(modelSelectionFor(withModelDefaults, "k3").reasoning.default).toBe("high");
    expect(modelSelectionFor(withModelDefaults, "highspeed").reasoning.default).toBe("low");
  });

  it("uses provider visibility defaults until the user saves an explicit list", () => {
    const withDefaults: AgentCapability = {
      ...capabilities,
      models: [
        { id: "legacy", label: "Legacy" },
        { id: "current", label: "Current" },
      ],
      defaultHiddenModels: ["legacy"],
    };

    expect(resolveHiddenModelIds(withDefaults, undefined)).toEqual(["legacy"]);
    expect(filterHiddenModels(withDefaults, undefined).models.map(({ id }) => id)).toEqual([
      "current",
    ]);
    expect(resolveHiddenModelIds(withDefaults, [])).toEqual([]);
    expect(filterHiddenModels(withDefaults, []).models.map(({ id }) => id)).toEqual([
      "legacy",
      "current",
    ]);
    expect(filterHiddenModels(withDefaults, ["current"]).models.map(({ id }) => id)).toEqual([
      "legacy",
    ]);
  });

  it("does not leak terminal visibility defaults into a GUI capability override", () => {
    const splitDefaults: AgentCapability = {
      ...capabilities,
      defaultHiddenModels: ["terminal-model"],
      presentationCapabilities: {
        gui: {
          ...capabilities.presentationCapabilities!.gui!,
          defaultHiddenModels: ["chat-model"],
        },
      },
    };

    expect(capabilitiesForPresentation(splitDefaults, "terminal").defaultHiddenModels).toEqual([
      "terminal-model",
    ]);
    expect(capabilitiesForPresentation(splitDefaults, "gui").defaultHiddenModels).toEqual([
      "chat-model",
    ]);
  });

  it("validates orchestrator input against the advertised options", () => {
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(
      validateAgentModelSelection(gui, {
        model: "chat-model",
        reasoning: "xhigh",
      }),
    ).toBeUndefined();
    expect(validateAgentModelSelection(gui, { model: "chat-model", fast: true })).toBe(
      "Fast is unavailable for this account",
    );
  });

  it("resolves presentation-specific authentication with a legacy fallback", () => {
    expect(
      authStateForPresentation(
        {
          authState: "authenticated",
          presentationAuthStates: { gui: "missing" },
        },
        "gui",
      ),
    ).toBe("missing");
    expect(
      authStateForPresentation(
        {
          authState: "authenticated",
          presentationAuthStates: { gui: "missing" },
        },
        "terminal",
      ),
    ).toBe("authenticated");
  });

  it("removes misleading provider login actions for externally authenticated runtimes", () => {
    const status = authStatusForPresentation(
      {
        kind: "cursor",
        label: "Cursor",
        installed: true,
        authState: "authenticated",
        loginCommand: "cursor-agent login",
        authMethods: [{ type: "terminal", id: "login", name: "Login", args: ["login"] }],
        authLogoutSupported: true,
        presentationAuthStates: { gui: "missing" },
        presentationAuthUsesProviderLogin: { gui: false },
        capabilities,
      },
      "gui",
    );

    expect(status.authState).toBe("missing");
    expect(status.loginCommand).toBeUndefined();
    expect(status.authMethods).toBeUndefined();
    expect(status.authLogoutSupported).toBeUndefined();
  });

  it("resolves authentication and capabilities as one presentation status", () => {
    const status = agentStatusForPresentation(
      {
        kind: "cursor",
        label: "Cursor",
        installed: true,
        authState: "missing",
        loginCommand: "cursor-agent login",
        presentationAuthStates: { gui: "authenticated" },
        presentationAuthUsesProviderLogin: { gui: false },
        capabilities,
      },
      "gui",
    );

    expect(status.authState).toBe("authenticated");
    expect(status.loginCommand).toBeUndefined();
    expect(status.capabilities.models).toEqual([{ id: "chat-model", label: "Chat" }]);
    expect(status.capabilities.defaultEffort).toBe("high");
    expect(status.capabilities.fastModels).toEqual(["chat-model"]);
    expect(status.capabilities.presentationMode).toBe("gui");
  });

  it("pins existing sessions to their runtime variant after the default changes", () => {
    const { presentationCapabilities: _presentationCapabilities, ...baseCapabilities } =
      capabilities;
    const acpCapabilities: AgentCapability = {
      ...baseCapabilities,
      models: [{ id: "acp-model", label: "ACP" }],
      liveInputMode: "server",
      presentationMode: "gui",
    };
    const sdkCapabilities: AgentCapability = {
      ...acpCapabilities,
      models: [{ id: "sdk-model", label: "SDK" }],
      approvalPolicies: [{ id: "default", label: "Auto-review" }],
    };
    const status: AgentStatus = {
      kind: "cursor",
      label: "Cursor",
      installed: true,
      authState: "authenticated",
      loginCommand: "cursor-agent login",
      authMethods: [{ type: "terminal", id: "login", name: "Login", args: ["login"] }],
      authLogoutSupported: true,
      presentationAuthStates: { gui: "missing" },
      presentationAuthUsesProviderLogin: { gui: false },
      capabilities: {
        ...capabilities,
        presentationCapabilities: { gui: sdkCapabilities },
      },
      runtimeVariants: {
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: acpCapabilities,
        },
        sdk: {
          presentationMode: "gui",
          installed: true,
          authState: "missing",
          authUsesProviderLogin: false,
          capabilities: sdkCapabilities,
        },
      },
      sessionRuntimeRouting: {
        prefixes: { "sdk:": "sdk" },
        fallbackRuntime: "acp",
      },
    };

    const existingAcp = agentStatusForPresentation(status, "gui", sessionRef("legacy-acp-session"));
    expect(existingAcp.authState).toBe("authenticated");
    expect(existingAcp.loginCommand).toBe("cursor-agent login");
    expect(existingAcp.capabilities.models).toEqual([{ id: "acp-model", label: "ACP" }]);
    expect(agentStatusForPresentation(existingAcp, "gui").loginCommand).toBe("cursor-agent login");

    const existingSdk = agentStatusForPresentation(status, "gui", sessionRef("sdk:agent-1"));
    expect(existingSdk.authState).toBe("missing");
    expect(existingSdk.loginCommand).toBeUndefined();
    expect(existingSdk.authMethods).toBeUndefined();
    expect(existingSdk.capabilities.models).toEqual([{ id: "sdk-model", label: "SDK" }]);
  });

  it("uses the longest matching runtime prefix and ignores variants for another presentation", () => {
    const status: AgentStatus = {
      kind: "cursor",
      label: "Cursor",
      installed: true,
      authState: "authenticated",
      capabilities,
      runtimeVariants: {
        broad: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: { ...capabilities, models: [{ id: "broad", label: "Broad" }] },
        },
        specific: {
          presentationMode: "gui",
          installed: false,
          authState: "missing",
          authUsesProviderLogin: false,
          capabilities: { ...capabilities, models: [{ id: "specific", label: "Specific" }] },
        },
      },
      sessionRuntimeRouting: {
        prefixes: { "run:": "broad", "run:sdk:": "specific" },
      },
    };

    const gui = agentStatusForPresentation(status, "gui", sessionRef("run:sdk:123"));
    expect(gui.installed).toBe(false);
    expect(gui.capabilities.models[0]?.id).toBe("specific");

    const terminal = agentStatusForPresentation(status, "terminal", sessionRef("run:sdk:123"));
    expect(terminal.installed).toBe(true);
    expect(terminal.capabilities.models[0]?.id).toBe("terminal-model");
  });
});
