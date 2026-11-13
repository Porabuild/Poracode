import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { CrossagentRoutingState } from "@/shared/crossagentRanking";
import { buildCrewHelperOptions, useCrewHelperOptions } from "./crewHelperOptions";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const routingBridge = vi.hoisted(() => ({
  remote: false,
  getCrossagentRouting: vi.fn<() => Promise<CrossagentRoutingState>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => routingBridge,
  isRemoteSession: () => routingBridge.remote,
}));

function status(
  kind: string,
  label: string,
  model: string | readonly string[],
  defaultEffort: string,
): AgentStatus {
  const models = typeof model === "string" ? [model] : model;
  return {
    kind,
    label,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: models.map((id) => ({ id, label: models.length === 1 ? label : id })),
      efforts: [defaultEffort],
      modelEfforts: Object.fromEntries(models.map((id) => [id, [defaultEffort]])),
      modelDefaultEfforts: Object.fromEntries(models.map((id) => [id, defaultEffort])),
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      mcpScope: { gui: "launch", terminal: "none" },
      settingDefs: [],
    },
  };
}

const settings = {
  disabledAgents: [],
  hiddenModels: {},
  crossagentPausedProviders: [],
  crossagentHiddenModels: {},
};

describe("buildCrewHelperOptions", () => {
  it("skips the lead's own model and uses the next ranked model's default effort", () => {
    const routing: CrossagentRoutingState = {
      providers: [
        { kind: "codex", label: "Codex", execution: "structured" },
        { kind: "claude", label: "Claude", execution: "structured" },
      ],
      ranked: [
        {
          provider: "codex",
          label: "Codex",
          execution: "structured",
          rank: 1,
          source: "built-in",
          usageCount: 0,
          model: { id: "gpt-5.5", label: "GPT-5.5" },
          fast: false,
          learnedTags: [],
        },
        {
          provider: "claude",
          label: "Claude",
          execution: "structured",
          rank: 2,
          source: "built-in",
          usageCount: 0,
          model: { id: "opus-5.5", label: "Opus 5.5" },
          reasoning: "low",
          fast: true,
          learnedTags: [],
        },
      ],
    };
    const options = buildCrewHelperOptions({
      statuses: [
        status("codex", "Codex", "gpt-5.5", "high"),
        status("claude", "Claude", "opus-5.5", "medium"),
      ],
      settings,
      routing,
    });
    expect(options.defaultSelectionFor({ agentKind: "codex", model: "gpt-5.5" })).toEqual({
      agentKind: "claude",
      model: "opus-5.5",
      effort: "medium",
    });
  });

  it("excludes paused providers and models hidden from Crossagents", () => {
    const routing: CrossagentRoutingState = {
      providers: [{ kind: "claude", label: "Claude", execution: "structured" }],
      ranked: [
        {
          provider: "claude",
          label: "Claude",
          execution: "structured",
          rank: 1,
          source: "built-in",
          usageCount: 0,
          model: { id: "opus-5.5", label: "Opus 5.5" },
          fast: false,
          learnedTags: [],
        },
      ],
    };
    const options = buildCrewHelperOptions({
      statuses: [status("claude", "Claude", "opus-5.5", "medium")],
      settings: {
        ...settings,
        crossagentPausedProviders: ["claude"],
      },
      routing,
    });
    expect(options.providers).toEqual([]);
    expect(options.modelLabelOf({ agentKind: "claude", model: "opus-5.5" })).toBe("Claude");
  });

  it("prefers the cheapest tier, then the lead's provider within that tier", () => {
    const options = buildCrewHelperOptions({
      statuses: [
        status("alpha", "Alpha", ["alpha-pro", "alpha-core", "alpha-mini"], "medium"),
        status("beta", "Beta", ["beta-flash", "beta-core"], "low"),
      ],
      settings,
    });
    expect(options.defaultSelectionFor({ agentKind: "alpha", model: "alpha-pro" })).toEqual({
      agentKind: "alpha",
      model: "alpha-mini",
      effort: "medium",
    });
    expect(options.defaultSelectionFor({ agentKind: "beta", model: "beta-core" })).toEqual({
      agentKind: "beta",
      model: "beta-flash",
      effort: "low",
    });
  });

  it("takes a cheaper tier from another provider before a pricier one from the lead's", () => {
    const options = buildCrewHelperOptions({
      statuses: [
        status("alpha", "Alpha", ["alpha-pro", "alpha-core"], "medium"),
        status("beta", "Beta", ["beta-max", "beta-nano"], "low"),
      ],
      settings,
    });
    expect(options.defaultSelectionFor({ agentKind: "alpha", model: "alpha-pro" })).toEqual({
      agentKind: "beta",
      model: "beta-nano",
      effort: "low",
    });
    expect(
      buildCrewHelperOptions({
        statuses: [status("alpha", "Alpha", ["alpha-pro", "alpha-core"], "medium")],
        settings,
      }).defaultSelectionFor({ agentKind: "alpha", model: "alpha-pro" }),
    ).toEqual({ agentKind: "alpha", model: "alpha-core", effort: "medium" });
  });

  it("avoids the lead's exact model unless it is the only one", () => {
    const options = buildCrewHelperOptions({
      statuses: [status("alpha", "Alpha", "alpha-mini", "medium")],
      settings,
    });
    expect(options.defaultSelectionFor({ agentKind: "alpha", model: "alpha-mini" })).toEqual({
      agentKind: "alpha",
      model: "alpha-mini",
      effort: "medium",
    });
    expect(options.defaultSelectionFor({ agentKind: "beta", model: "beta-pro" })).toEqual({
      agentKind: "alpha",
      model: "alpha-mini",
      effort: "medium",
    });
  });
});

describe("crew routing refresh identity", () => {
  beforeEach(() => {
    routingBridge.remote = false;
    routingBridge.getCrossagentRouting.mockReset();
    useSharedSettings.setState(settings);
    useAgentStatusesStore.setState({
      agentStatuses: [status("alpha", "Alpha", "alpha-mini", "medium")],
      wslAgentStatuses: [],
    });
  });

  function routing(): CrossagentRoutingState {
    return {
      providers: [{ kind: "alpha", label: "Alpha", execution: "structured" }],
      ranked: [
        {
          provider: "alpha",
          label: "Alpha",
          execution: "structured",
          rank: 1,
          source: "built-in",
          usageCount: 0,
          model: { id: "alpha-mini", label: "Mini" },
          fast: false,
          learnedTags: [],
        },
      ],
    };
  }

  it("keeps a completed request stable across unrelated renders and equal status updates", async () => {
    routingBridge.getCrossagentRouting.mockResolvedValue(routing());
    const hook = renderHook(() => useCrewHelperOptions());
    await waitFor(() => expect(hook.result.current.providers).toHaveLength(1));
    hook.rerender();
    act(() =>
      useAgentStatusesStore
        .getState()
        .setAgentStatuses([status("alpha", "Alpha", "alpha-mini", "medium")]),
    );
    act(() =>
      useAgentStatusesStore.getState().hydrateFromCache({
        windows: [status("alpha", "Alpha", "alpha-mini", "medium")],
        wsl: [],
      }),
    );
    await act(async () => {});
    expect(routingBridge.getCrossagentRouting).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("rejects obsolete routing responses after visibility changes", async () => {
    const old = Promise.withResolvers<CrossagentRoutingState>();
    routingBridge.getCrossagentRouting
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ providers: [], ranked: [] });
    const hook = renderHook(() => useCrewHelperOptions());
    await waitFor(() => expect(routingBridge.getCrossagentRouting).toHaveBeenCalledTimes(1));
    act(() => useSharedSettings.setState({ crossagentPausedProviders: ["alpha"] }));
    await waitFor(() => expect(routingBridge.getCrossagentRouting).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve(routing()));
    expect(hook.result.current.providers).toEqual([]);
    expect(hook.result.current.ranked).toEqual([]);
    hook.unmount();
  });

  it("keeps browser sessions independent of local routing", async () => {
    routingBridge.remote = true;
    const hook = renderHook(() => useCrewHelperOptions());
    await act(async () => {});
    expect(hook.result.current.providers).toHaveLength(1);
    expect(routingBridge.getCrossagentRouting).not.toHaveBeenCalled();
    hook.unmount();
  });
});
