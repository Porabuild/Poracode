// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-25T00:00:00.000Z",
};

function agentStatus(kind: string, models: string[]): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: models.map((id) => ({ id, label: id })),
      efforts: ["high"],
      modelEfforts: Object.fromEntries(models.map((id) => [id, ["high"]])),
      defaultEffort: "high",
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "gui",
      settingDefs: [],
    },
  } as AgentStatus;
}

const bridge = vi.hoisted(() => ({
  syncPrWatchAgent: vi.fn<(payload: unknown) => Promise<void>>(async () => undefined),
}));

const state = vi.hoisted(() => ({
  projects: [] as Project[],
  agentStatuses: [] as AgentStatus[],
  settings: {
    sharedSettingsHydrated: true,
    conflictResolverProvider: "qwen",
    conflictResolverModel: "qwen3.8-max",
    conflictResolverEffort: "high",
    conflictResolverFast: false,
    conflictResolverPresentationMode: "gui" as const,
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverFast: false,
    wslConflictResolverPresentationMode: "gui" as const,
  },
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (value: { projects: Project[] }) => unknown) =>
    selector({ projects: state.projects }),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (
    selector: (value: { agentStatuses: AgentStatus[]; wslAgentStatuses: AgentStatus[] }) => unknown,
  ) => selector({ agentStatuses: state.agentStatuses, wslAgentStatuses: [] }),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (value: typeof state.settings) => unknown) =>
    selector(state.settings),
}));

import { usePrWatchAgentSync } from "./usePrWatchAgentSync";

function Harness(props: { enabled: boolean }) {
  usePrWatchAgentSync(props.enabled);
  return null;
}

describe("usePrWatchAgentSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.projects = [project];
    state.agentStatuses = [agentStatus("qwen", ["qwen3.8-max"])];
    state.settings = {
      ...state.settings,
      sharedSettingsHydrated: true,
      conflictResolverProvider: "qwen",
      conflictResolverModel: "qwen3.8-max",
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes the current helper agent for every project", async () => {
    render(<Harness enabled />);

    await waitFor(() =>
      expect(bridge.syncPrWatchAgent).toHaveBeenCalledWith({
        projectId: project.id,
        agentKind: "qwen",
        config: { model: "qwen3.8-max", effort: "high" },
      }),
    );
  });

  it("stays quiet while the app is still hydrating", () => {
    render(<Harness enabled={false} />);

    expect(bridge.syncPrWatchAgent).not.toHaveBeenCalled();
  });

  it("stays quiet until shared settings are hydrated", () => {
    // Pre-hydration values come from a stale localStorage fallback; pushing a
    // resolution computed from them would overwrite every watch with defaults.
    state.settings = { ...state.settings, sharedSettingsHydrated: false };
    render(<Harness enabled />);

    expect(bridge.syncPrWatchAgent).not.toHaveBeenCalled();
  });

  it("does not re-push an unchanged resolution on re-render", async () => {
    const { rerender } = render(<Harness enabled />);
    await waitFor(() => expect(bridge.syncPrWatchAgent).toHaveBeenCalledOnce());

    rerender(<Harness enabled />);
    rerender(<Harness enabled />);

    expect(bridge.syncPrWatchAgent).toHaveBeenCalledOnce();
  });

  it("pushes again once the configured helper changes", async () => {
    const { rerender } = render(<Harness enabled />);
    await waitFor(() => expect(bridge.syncPrWatchAgent).toHaveBeenCalledOnce());

    state.settings = {
      ...state.settings,
      conflictResolverProvider: "codex",
      conflictResolverModel: "gpt-5.6",
    };
    state.agentStatuses = [...state.agentStatuses, agentStatus("codex", ["gpt-5.6"])];
    rerender(<Harness enabled />);

    await waitFor(() =>
      expect(bridge.syncPrWatchAgent).toHaveBeenLastCalledWith({
        projectId: project.id,
        agentKind: "codex",
        config: { model: "gpt-5.6", effort: "high" },
      }),
    );
  });

  it("serializes a newer helper behind an older in-flight sync", async () => {
    let releaseFirst!: () => void;
    bridge.syncPrWatchAgent.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFirst = resolve)),
    );
    const { rerender } = render(<Harness enabled />);
    await waitFor(() => expect(bridge.syncPrWatchAgent).toHaveBeenCalledOnce());

    state.settings = {
      ...state.settings,
      conflictResolverProvider: "codex",
      conflictResolverModel: "gpt-5.6",
    };
    state.agentStatuses = [...state.agentStatuses, agentStatus("codex", ["gpt-5.6"])];
    rerender(<Harness enabled />);

    expect(bridge.syncPrWatchAgent).toHaveBeenCalledOnce();
    releaseFirst();
    await waitFor(() => expect(bridge.syncPrWatchAgent).toHaveBeenCalledTimes(2));
    expect(bridge.syncPrWatchAgent).toHaveBeenLastCalledWith({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.6", effort: "high" },
    });
  });

  it("retries a transient sync failure without waiting for settings to change", async () => {
    vi.useFakeTimers();
    bridge.syncPrWatchAgent.mockRejectedValueOnce(new Error("bridge unavailable"));
    render(<Harness enabled />);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(bridge.syncPrWatchAgent).toHaveBeenCalledOnce();

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(bridge.syncPrWatchAgent).toHaveBeenCalledTimes(2);
  });

  it("retries only the project whose sync failed", async () => {
    vi.useFakeTimers();
    const secondProject = {
      ...project,
      id: "project-2",
      location: { kind: "posix", path: "/repo-2" },
    } satisfies Project;
    state.projects = [project, secondProject];
    bridge.syncPrWatchAgent.mockImplementation(async (input) => {
      if ((input as { projectId: string }).projectId === secondProject.id) {
        throw new Error("remote unavailable");
      }
    });
    const { unmount } = render(<Harness enabled />);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      bridge.syncPrWatchAgent.mock.calls.filter(
        ([input]) => (input as { projectId: string }).projectId === project.id,
      ),
    ).toHaveLength(1);
    expect(
      bridge.syncPrWatchAgent.mock.calls.filter(
        ([input]) => (input as { projectId: string }).projectId === secondProject.id,
      ),
    ).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(
      bridge.syncPrWatchAgent.mock.calls.filter(
        ([input]) => (input as { projectId: string }).projectId === project.id,
      ),
    ).toHaveLength(1);
    expect(
      bridge.syncPrWatchAgent.mock.calls.filter(
        ([input]) => (input as { projectId: string }).projectId === secondProject.id,
      ),
    ).toHaveLength(2);
    unmount();
  });
});
