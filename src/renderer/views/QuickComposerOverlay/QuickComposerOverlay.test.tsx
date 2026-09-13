import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";

const { bridge, installedStatus, installedStatuses, settingsState } = vi.hoisted(() => {
  const status = {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      presentationMode: "gui",
      presentationModes: ["gui"],
      models: [{ id: "gpt-5.4", label: "GPT-5.4" }],
    },
  };
  return {
    installedStatus: status,
    installedStatuses: [status],
    settingsState: { homeScopeEnabled: false, disabledAgents: [] as string[] },
    bridge: {
      windowKind: "quickComposer",
      getAgentStatuses: vi
        .fn<
          () => Promise<{
            windows: (typeof status)[];
            wsl: (typeof status)[];
            fromCache: boolean;
          }>
        >()
        .mockResolvedValue({ windows: [status], wsl: [], fromCache: true }),
      onSupervisorEvent: vi.fn<(listener: (event: unknown) => void) => () => void>(
        () => () => undefined,
      ),
      onQuickComposerDismissRequested: vi.fn<(listener: () => void) => () => void>(
        () => () => undefined,
      ),
      onQuickComposerShown: vi.fn<(listener: () => void) => () => void>(() => () => undefined),
      submitQuickComposer: vi
        .fn<(submission: unknown) => Promise<void>>()
        .mockResolvedValue(undefined),
      dismissQuickComposer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      focusWindow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      pickQuickComposerFiles: vi.fn<() => Promise<null>>().mockResolvedValue(null),
      dbGetProjects: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      dbGetThreads: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      dbGetState: vi.fn<(key: string) => Promise<null>>().mockResolvedValue(null),
    },
  };
});

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@/shared/agentStatus", () => ({
  getProjectAgentStatuses: () => installedStatuses,
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(settingsState),
}));
vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock("@/renderer/components/thread/ThreadDraftView", () => ({
  ThreadDraftView: (props: {
    project: { id: string; name: string };
    onProjectChange?: (projectId: string) => void;
    onStart: (input: unknown) => void | Promise<void>;
  }) => (
    <div>
      <span>{props.project.name}</span>
      <div data-composer-input-anchor="">
        <div role="textbox" contentEditable aria-label="Composer input" />
      </div>
      <button type="button" onClick={() => props.onProjectChange?.("project-2")}>
        Switch test project
      </button>
      <button
        type="button"
        onClick={() =>
          void props.onStart({
            agentKind: "codex",
            config: { model: "gpt-5.4" },
            prompt: "sent from overlay",
          })
        }
      >
        Send overlay
      </button>
    </div>
  ),
}));

import { QuickComposerOverlay, resolveQuickComposerProject } from "./QuickComposerOverlay";

const project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "windows" as const, path: "C:\\repo" },
  createdAt: "2026-07-10T00:00:00.000Z",
};
const otherProject = { ...project, id: "project-2", name: "Other" };

describe("QuickComposerOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    useAppStore.setState((state) => ({
      ...state,
      projects: [project, otherProject],
      threads: [],
      view: { kind: "draft", projectId: project.id },
    }));
    useAgentStatusesStore.setState({
      agentStatuses: [installedStatus as never],
      wslAgentStatuses: [],
      windowsLoaded: true,
      wslLoaded: true,
    });
  });

  it("focuses the composer input whenever the native overlay appears", () => {
    render(<QuickComposerOverlay />);

    const input = screen.getByRole("textbox", { name: "Composer input" });
    expect(input).toHaveFocus();

    screen.getByRole("button", { name: "Switch test project" }).focus();
    act(() => {
      bridge.onQuickComposerShown.mock.calls[0]?.[0]();
    });

    expect(input).toHaveFocus();
  });

  it("animates the send state before dismissing the native overlay", async () => {
    const { container } = render(<QuickComposerOverlay />);
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Send overlay" }));
    expect(container.querySelector(".quick-composer-root--sending")).toBeInTheDocument();
    expect(bridge.submitQuickComposer).toHaveBeenCalledWith({
      projectId: "project-1",
      input: {
        agentKind: "codex",
        config: { model: "gpt-5.4" },
        prompt: "sent from overlay",
      },
    });
    expect(bridge.dismissQuickComposer).not.toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });
    expect(bridge.dismissQuickComposer).toHaveBeenCalledOnce();
    expect(container.querySelector(".quick-composer-drag-handle")).not.toBeInTheDocument();
    expect(container.querySelector(".quick-composer-frame")).toBeInTheDocument();
  });

  it("reopens after native hide/show without a DOM visibility or focus transition", async () => {
    const { container } = render(<QuickComposerOverlay />);
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(bridge.dismissQuickComposer).toHaveBeenCalledOnce();
    expect(container.querySelector(".quick-composer-root--closing")).toBeInTheDocument();

    act(() => {
      bridge.onQuickComposerShown.mock.calls[0]?.[0]();
    });
    expect(document.visibilityState).toBe("visible");
    expect(container.querySelector(".quick-composer-root--opening")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(container.querySelector(".quick-composer-root--idle")).toBeInTheDocument();
  });

  it("does not replay the enter animation or refetch when a file dialog returns focus", async () => {
    const { container } = render(<QuickComposerOverlay />);
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    const refreshes = bridge.getAgentStatuses.mock.calls.length;
    fireEvent.focus(window);
    expect(container.querySelector(".quick-composer-root--idle")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.getAgentStatuses).toHaveBeenCalledTimes(refreshes);
  });

  it("does not let a pending main-window reveal hide a newly shown overlay", async () => {
    let finishReveal!: () => void;
    bridge.focusWindow.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishReveal = resolve;
      }),
    );
    useAppStore.setState({ projects: [] });
    const { container } = render(<QuickComposerOverlay />);
    fireEvent.click(screen.getByRole("button", { name: "Add a project" }));
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(bridge.focusWindow).toHaveBeenCalledOnce();
    act(() => {
      bridge.onQuickComposerShown.mock.calls[0]?.[0]();
    });
    await act(async () => {
      finishReveal();
    });
    expect(bridge.dismissQuickComposer).not.toHaveBeenCalled();
    expect(container.querySelector(".quick-composer-root--opening")).toBeInTheDocument();
  });

  it("does not let an old pending submission dismiss a newly shown overlay", async () => {
    let finishSubmission!: () => void;
    bridge.submitQuickComposer.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSubmission = resolve;
      }),
    );
    const { container } = render(<QuickComposerOverlay />);
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    fireEvent.click(screen.getByRole("button", { name: "Send overlay" }));
    expect(container.querySelector(".quick-composer-root--sending")).toBeInTheDocument();
    act(() => {
      bridge.onQuickComposerShown.mock.calls[0]?.[0]();
    });
    await act(async () => {
      finishSubmission();
    });
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(container.querySelector(".quick-composer-root--idle")).toBeInTheDocument();
    expect(bridge.dismissQuickComposer).not.toHaveBeenCalled();
  });

  it("prefers the project represented by the active pane", () => {
    expect(
      resolveQuickComposerProject({
        projects: [project, otherProject],
        threads: [{ id: "thread-2", projectId: otherProject.id }],
        view: { kind: "thread", panes: ["thread-2"] },
        homeScopeEnabled: false,
      }),
    ).toEqual(otherProject);
  });

  it("switches projects locally and submits to the selected project", async () => {
    render(<QuickComposerOverlay />);

    expect(screen.getByText("Repo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch test project" }));
    expect(screen.getByText("Other")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send overlay" }));
      await Promise.resolve();
    });
    expect(bridge.submitQuickComposer).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-2" }),
    );
  });

  it("prefers an explicitly selected project", () => {
    expect(
      resolveQuickComposerProject({
        projects: [project, otherProject],
        threads: [],
        view: { kind: "draft", projectId: project.id },
        homeScopeEnabled: false,
        selectedProjectId: otherProject.id,
      }),
    ).toEqual(otherProject);
  });
});
