import "fake-indexeddb/auto";
import type { ReactNode } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { HOME_PROJECT_ID } from "@/shared/homeScope";

const { bridge, installedStatus, settingsState } = vi.hoisted(() => {
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
    settingsState: { homeScopeEnabled: false, disabledAgents: [] as string[], workspaces: [] },
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

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge, isRemoteSession: () => false }));
vi.mock("@/renderer/components/ui/provider", () => ({
  AppProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/renderer/components/composer/ImageLightbox", () => ({
  ImageLightboxHost: () => null,
}));
vi.mock("@/renderer/hooks/useAppHydration", () => ({
  useAppHydration: () => ({
    initialLoading: false,
    runtimeSnapshotsReady: true,
    storeHydrated: true,
    loadT0: 0,
  }),
}));
vi.mock("@/renderer/analytics/useProductViewTracking", () => ({
  useStandaloneWindowViewTracking: () => undefined,
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
    agentStatuses: Array<{ kind: string }>;
    pickFiles?: () => Promise<string[] | null>;
    saveClipboardImage?: unknown;
    onProjectChange?: (projectId: string) => void;
    onStart: (input: unknown) => void | Promise<void>;
  }) => (
    <div>
      <span>{props.project.name}</span>
      <output data-testid="agent-statuses">
        {props.agentStatuses.map((status) => status.kind).join(",")}
      </output>
      {props.saveClipboardImage ? <output data-testid="has-clipboard-save">true</output> : null}
      <div data-composer-input-anchor="">
        <div role="textbox" contentEditable aria-label="Composer input" />
      </div>
      <button type="button" onClick={() => void props.pickFiles?.()}>
        Pick files fixture
      </button>
      <button type="button" onClick={() => props.onProjectChange?.("project-2")}>
        Switch test project
      </button>
      <button
        type="button"
        // The real shared composer catch swallows non-voice submission
        // errors; mirror that so the rethrown refusal is not unhandled.
        onClick={() =>
          void Promise.resolve(
            props.onStart({
              agentKind: "codex",
              config: { model: "gpt-5.4" },
              prompt: "sent from overlay",
            }),
          ).catch(() => undefined)
        }
      >
        Send overlay
      </button>
    </div>
  ),
}));

import { QuickComposerWindowApp } from "@/renderer/windowApps/QuickComposerWindowApp";
import { QuickComposerOverlay, resolveQuickComposerProject } from "./QuickComposerOverlay";

const project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "windows" as const, path: "C:\\repo" },
  createdAt: "2026-07-10T00:00:00.000Z",
};
const otherProject = { ...project, id: "project-2", name: "Other" };
const canonicalHome = {
  ...project,
  id: HOME_PROJECT_ID,
  name: "Home",
  location: { kind: "windows" as const, path: "C:\\Users\\local" },
  disabled: true,
};
const remoteHome = {
  ...project,
  id: `remote:studio:project:${HOME_PROJECT_ID}`,
  name: "Studio Home",
  location: { kind: "windows" as const, path: "C:\\Users\\studio" },
  remoteServerId: "studio",
  remoteId: HOME_PROJECT_ID,
  disabled: true,
};

describe("QuickComposerOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    settingsState.disabledAgents = [];
    settingsState.homeScopeEnabled = false;
    useRemoteServersStore.setState({ runtime: {} });
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

  it("initializes remote server connections in the window wrapper", async () => {
    const hasHydrated = vi
      .spyOn(useRemoteServersStore.persist, "hasHydrated")
      .mockReturnValue(true);
    const connectAll = vi
      .spyOn(useRemoteServersStore.getState(), "connectAll")
      .mockResolvedValue(undefined);

    render(<QuickComposerWindowApp />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(hasHydrated).toHaveBeenCalled();
    expect(connectAll).toHaveBeenCalledOnce();
    hasHydrated.mockRestore();
    connectAll.mockRestore();
  });

  it("opens the composer as soon as an enabled provider finishes while discovery remains pending", async () => {
    useAgentStatusesStore.setState({ agentStatuses: [], windowsLoaded: false });
    bridge.getAgentStatuses.mockResolvedValueOnce({ windows: [], wsl: [], fromCache: false });
    render(<QuickComposerOverlay />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Detecting agents…")).toBeInTheDocument();
    act(() => {
      bridge.onSupervisorEvent.mock.calls[0]?.[0]({
        type: "agent-detected",
        status: installedStatus,
      });
    });
    expect(screen.getByRole("textbox", { name: "Composer input" })).toBeInTheDocument();
    expect(screen.queryByText("Detecting agents…")).not.toBeInTheDocument();
    expect(useAgentStatusesStore.getState().windowsLoaded).toBe(false);
  });

  it("keeps loading when a partial inventory contains only disabled providers", () => {
    settingsState.disabledAgents = [installedStatus.kind];
    useAgentStatusesStore.setState({ windowsLoaded: false });
    bridge.getAgentStatuses.mockResolvedValueOnce({ windows: [], wsl: [], fromCache: false });
    render(<QuickComposerOverlay />);
    expect(screen.getByText("Detecting agents…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
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

  it("surfaces a refused submission exactly once and recovers to idle", async () => {
    const toastDanger = vi.spyOn(toast, "danger");
    bridge.submitQuickComposer.mockRejectedValueOnce(new Error("Fixture native handoff refused"));
    const { container } = render(<QuickComposerOverlay />);
    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    fireEvent.click(screen.getByRole("button", { name: "Send overlay" }));
    expect(container.querySelector(".quick-composer-root--sending")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(toastDanger).toHaveBeenCalledExactlyOnceWith("Fixture native handoff refused");
    expect(container.querySelector(".quick-composer-root--idle")).toBeInTheDocument();
    expect(bridge.dismissQuickComposer).not.toHaveBeenCalled();

    // The draft surface stayed recoverable: an immediate retry goes through.
    fireEvent.click(screen.getByRole("button", { name: "Send overlay" }));
    expect(bridge.submitQuickComposer).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".quick-composer-root--sending")).toBeInTheDocument();
    toastDanger.mockRestore();
  });

  it("reopens after native hide/show without a DOM visibility or focus transition", async () => {
    const rehydrate = vi.spyOn(useAppStore.persist, "rehydrate").mockResolvedValue(undefined);
    const verifyConnections = vi
      .spyOn(useRemoteServersStore.getState(), "verifyConnections")
      .mockResolvedValue(undefined);
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

    const refreshes = bridge.getAgentStatuses.mock.calls.length;
    act(() => {
      bridge.onQuickComposerShown.mock.calls[0]?.[0]();
    });
    expect(verifyConnections).toHaveBeenCalledOnce();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(bridge.getAgentStatuses).toHaveBeenCalledTimes(refreshes + 1);
    expect(document.visibilityState).toBe("visible");
    expect(container.querySelector(".quick-composer-root--opening")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(container.querySelector(".quick-composer-root--idle")).toBeInTheDocument();
    rehydrate.mockRestore();
    verifyConnections.mockRestore();
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

  it("uses a mirrored Home host's agent statuses, detection, and file access", async () => {
    settingsState.homeScopeEnabled = true;
    const remoteStatus = { ...installedStatus, kind: "remote-codex", label: "Remote Codex" };
    const upload = vi
      .spyOn(useRemoteServersStore.getState(), "pickAndUploadFiles")
      .mockResolvedValue(["C:\\studio\\file.txt"]);
    useRemoteServersStore.setState({
      runtime: { studio: { status: "connecting", projects: [], threads: [] } },
    });
    useAppStore.setState((state) => ({
      ...state,
      projects: [project, remoteHome],
      threads: [],
      view: { kind: "draft", projectId: remoteHome.id },
    }));
    render(<QuickComposerOverlay />);

    // Local providers exist, but this project's statuses come from its host.
    expect(screen.getByText("Detecting agents…")).toBeInTheDocument();

    act(() => {
      useRemoteServersStore.setState({
        runtime: {
          studio: {
            status: "online",
            projects: [],
            threads: [],
            agentStatuses: {
              windows: [remoteStatus as never],
              wsl: [],
              updatedAt: "2026-11-04T00:00:00Z",
            },
          },
        },
      });
    });
    expect(screen.getByText("Studio Home")).toBeInTheDocument();
    expect(screen.getByTestId("agent-statuses")).toHaveTextContent("remote-codex");
    expect(screen.getByTestId("has-clipboard-save")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pick files fixture" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(upload).toHaveBeenCalledWith("studio", `draft-${HOME_PROJECT_ID}`);
    expect(bridge.pickQuickComposerFiles).not.toHaveBeenCalled();
    upload.mockRestore();
  });

  it("shows the offline host reason and keeps the machine switch instead of no agents", () => {
    settingsState.homeScopeEnabled = true;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "studio", label: "Poracode on MacBook" }],
      runtime: {
        studio: {
          status: "offline",
          message: "Host is restarting",
          projects: [],
          threads: [],
        },
      },
    } as never);
    useAppStore.setState((state) => ({
      ...state,
      projects: [canonicalHome, remoteHome],
      threads: [],
      view: { kind: "draft", projectId: remoteHome.id },
    }));
    render(<QuickComposerOverlay />);

    expect(screen.getByText("Host is restarting")).toBeInTheDocument();
    expect(screen.queryByText("No supported agents detected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Machine: MacBook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch project" })).toBeInTheDocument();

    act(() => {
      useRemoteServersStore.setState({
        runtime: { studio: { status: "offline", projects: [], threads: [] } },
      });
    });
    expect(
      screen.getByText("This project's remote server is offline. Reconnect it to start a thread."),
    ).toBeInTheDocument();
  });

  it("keeps a submitted form mounted when its remote host disconnects", async () => {
    settingsState.homeScopeEnabled = true;
    const remoteStatus = { ...installedStatus, kind: "remote-codex", label: "Remote Codex" };
    let resolve!: () => void;
    bridge.submitQuickComposer.mockReturnValueOnce(
      new Promise<void>((yes) => {
        resolve = yes;
      }),
    );
    const verifyConnections = vi
      .spyOn(useRemoteServersStore.getState(), "verifyConnections")
      .mockResolvedValue(undefined);
    useRemoteServersStore.setState({
      servers: [{ desktopId: "studio", label: "Poracode on MacBook" }],
      runtime: {
        studio: {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: {
            windows: [remoteStatus as never],
            wsl: [],
            updatedAt: "2026-11-06T00:00:00Z",
          },
        },
      },
    } as never);
    useAppStore.setState((state) => ({
      ...state,
      projects: [remoteHome],
      threads: [],
      view: { kind: "draft", projectId: remoteHome.id },
    }));
    const { container } = render(<QuickComposerOverlay />);
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });
    expect(screen.getByRole("textbox", { name: "Composer input" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send overlay" }));
    expect(container.querySelector(".quick-composer-root--sending")).toBeInTheDocument();

    act(() => {
      useRemoteServersStore.setState({
        runtime: { studio: { status: "offline", projects: [], threads: [] } },
      });
    });
    expect(screen.getByRole("textbox", { name: "Composer input" })).toBeInTheDocument();
    expect(screen.queryByText(/remote server is offline/i)).not.toBeInTheDocument();

    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });
    verifyConnections.mockRestore();
  });

  it("keeps the local quick composer file dialog for a local project", async () => {
    render(<QuickComposerOverlay />);

    fireEvent.click(screen.getByRole("button", { name: "Pick files fixture" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.pickQuickComposerFiles).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("has-clipboard-save")).not.toBeInTheDocument();
  });

  it("does not refresh Git for a mirrored Home", () => {
    settingsState.homeScopeEnabled = true;
    useRemoteServersStore.setState({
      runtime: { studio: { status: "connecting", projects: [], threads: [] } },
    });
    useAppStore.setState((state) => ({
      ...state,
      projects: [remoteHome],
      threads: [],
      view: { kind: "draft", projectId: remoteHome.id },
    }));
    render(<QuickComposerOverlay />);

    expect(refreshGitProject).not.toHaveBeenCalled();
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

  it("resolves a selected disabled mirrored Home while Home is enabled", () => {
    expect(
      resolveQuickComposerProject({
        projects: [remoteHome, otherProject],
        threads: [],
        view: { kind: "draft", projectId: otherProject.id },
        homeScopeEnabled: true,
        selectedProjectId: remoteHome.id,
      }),
    ).toEqual(remoteHome);
  });

  it("rejects both canonical and mirrored Home while the Home scope is disabled", () => {
    expect(
      resolveQuickComposerProject({
        projects: [remoteHome, canonicalHome],
        threads: [],
        view: { kind: "draft", projectId: remoteHome.id },
        homeScopeEnabled: false,
      }),
    ).toBeUndefined();
  });

  it("prefers the canonical Home fallback when a mirrored Home is listed first", () => {
    expect(
      resolveQuickComposerProject({
        projects: [remoteHome, canonicalHome],
        threads: [],
        view: { kind: "draft", projectId: "missing" },
        homeScopeEnabled: true,
      }),
    ).toEqual(canonicalHome);
  });

  it("applies live agent status from the loopback-backed supervisor subscription", () => {
    let listener: ((event: unknown) => void) | undefined;
    bridge.onSupervisorEvent.mockImplementation((cb) => {
      listener = cb;
      return () => undefined;
    });
    render(<QuickComposerOverlay />);
    act(() => {
      listener?.({
        type: "windows-agent-statuses",
        statuses: [
          {
            kind: "claude",
            label: "Claude",
            installed: true,
            authState: "authenticated",
            capabilities: {},
          },
        ],
      });
    });
    expect(
      useAgentStatusesStore.getState().agentStatuses.some((status) => status.kind === "claude"),
    ).toBe(true);
  });
});
