import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { useThreadTransferStore } from "@/renderer/state/threadTransferStore";
import { MoveThreadDialog } from "./MoveThreadDialog";

const transfer = vi.hoisted(() => ({
  preview: vi.fn<(thread: unknown, target: unknown, projectId: string) => Promise<unknown>>(),
  move: vi.fn<(input: unknown) => Promise<unknown>>(),
}));
const hosts = vi.hoisted(() => ({
  resolve: undefined as
    | ((entity: { id: string; remoteServerId?: string; remoteId?: string }) => unknown)
    | undefined,
}));

vi.mock("@/renderer/actions/threadTransferActions", async (original) => ({
  ...(await original<typeof import("@/renderer/actions/threadTransferActions")>()),
  loadThreadTransferPreview: transfer.preview,
  moveThreadToHost: transfer.move,
}));
vi.mock("@/renderer/state/entityHost", async (original) => ({
  ...(await original<typeof import("@/renderer/state/entityHost")>()),
  entityHost: (entity: { id: string; remoteServerId?: string; remoteId?: string }) =>
    hosts.resolve?.(entity) ??
    (entity.remoteServerId
      ? {
          kind: "paired",
          connectionKey: entity.remoteServerId,
          hostId: entity.remoteId ?? entity.id,
          isConnected: () => true,
        }
      : { kind: "managed", connectionKey: undefined, hostId: entity.id, isConnected: () => true }),
}));
vi.mock("@heroui/react", async (original) => ({
  ...(await original<typeof import("@heroui/react")>()),
  toast: {
    success: vi.fn<(message: string) => void>(),
    danger: vi.fn<(message: string) => void>(),
  },
}));

const thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Picker",
  agentKind: "codex",
  config: { model: "gpt-5" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
} as Thread;

const stamp = "2026-11-01T10:00:00.000Z";

function projectRow(id: string, name: string, remoteServerId?: string, remoteId?: string): Project {
  return {
    id,
    name,
    ...(remoteServerId ? { remoteServerId, remoteId } : {}),
    location: {
      kind: "posix",
      path: `/${id}`,
      ...(remoteServerId ? { remoteServerId } : {}),
    },
    createdAt: stamp,
  } as Project;
}

// The logical project "App": the local row the thread lives on plus one row
// per paired machine it is registered on. Grouping is by name here, exactly
// like the real three-machine fixture.
const LOCAL = projectRow("project-1", "App");
const MAC = projectRow("remote:mac:project:app", "App", "mac", "host-app-mac");
const MINI = projectRow("remote:mini:project:app", "App", "mini", "host-app-mini");
const STUDIO = projectRow("remote:studio:project:app", "App", "studio", "host-app-studio");
const ENV = projectRow("remote:env-1:project:app", "App", "env-1", "host-app-env");

function agent(kind: string, label: string): AgentStatus {
  return {
    kind,
    label,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: `${kind}-model`, label: `${kind} model` }],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
    },
  } as unknown as AgentStatus;
}

const CODEX = agent("codex", "Codex");
const CLAUDE = agent("claude", "Claude");

function preview(options?: {
  blocker?: string;
  project?: { projectId: string; name: string; matched: boolean; git: boolean } | null;
  agents?: AgentStatus[];
  sourceAgentReady?: boolean;
}) {
  return {
    source: {
      threadId: "thread-1",
      title: "Picker",
      agentKind: "codex",
      presentationMode: "gui",
      ...(options?.blocker ? { blocker: options.blocker } : {}),
      git: { branch: "feature", changedFiles: 2, repoIdentities: [] },
    },
    project:
      options?.project === null
        ? undefined
        : (options?.project ?? {
            projectId: "host-app-mac",
            name: "App",
            matched: true,
            git: true,
          }),
    agents: options?.agents ?? [CODEX, CLAUDE],
    sourceAgentReady: options?.sourceAgentReady ?? true,
  };
}

function movedOutcome() {
  return {
    thread: { ...thread, id: "moved" },
    targetLabel: "MacBook",
    branch: "feature",
    branchRenamed: false,
    continueFailed: false,
  };
}

function runtime(status: "online" | "offline", key: string) {
  return { [key]: { status, projects: [] as never[], threads: [] as never[] } };
}

describe("MoveThreadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ threads: [thread], projects: [LOCAL, MAC, MINI] });
    useRemoteServersStore.setState({
      servers: [
        { desktopId: "mac", label: "MacBook" },
        { desktopId: "mini", label: "Mac mini" },
      ],
      runtime: { ...runtime("online", "mac"), ...runtime("online", "mini") },
    } as never);
    useGitStore.setState({ statuses: {} });
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useSharedSettings.setState({ workspaces: [] });
    useWorkspaceStore.setState({ activeWorkspaceId: null, lastProjectIdByWorkspace: {} });
    hosts.resolve = (entity) =>
      entity.remoteServerId
        ? {
            kind: "paired",
            connectionKey: entity.remoteServerId,
            hostId: entity.remoteId ?? entity.id,
            isConnected: () =>
              useRemoteServersStore.getState().runtime[entity.remoteServerId!]?.status === "online",
          }
        : { kind: "managed", connectionKey: undefined, hostId: entity.id, isConnected: () => true };
    useThreadTransferStore.getState().request("thread-1");
  });

  it("defaults to the first online other-host member and moves with its host project id", async () => {
    transfer.preview.mockResolvedValue(preview());
    transfer.move.mockResolvedValue(movedOutcome());
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    // The draft composer's worktree row, read-only.
    expect(await screen.findByText("Worktree + changes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Branch" }).textContent).toBe("feature");
    // The environment row sits above the composer: project label + machine menu.
    expect(screen.getByRole("button", { name: "Machine: MacBook" })).toBeTruthy();
    expect(screen.getByText("App")).toBeTruthy();
    await waitFor(() =>
      expect(transfer.preview).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ key: "mac" }),
        "host-app-mac",
      ),
    );
    // The composer is always shown, seeded on the source agent.
    expect(await screen.findByPlaceholderText(/what to do next/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/what to do next/), {
      target: { value: "carry on" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(transfer.move).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "host-app-mac",
          continuePrompt: "carry on",
          agent: expect.objectContaining({ kind: "codex" }),
          target: expect.objectContaining({ key: "mac" }),
        }),
      ),
    );
    await waitFor(() => expect(useThreadTransferStore.getState().sourceThreadId).toBeNull());
  });

  it("reloads the preview when the two-candidate toggle switches machines", async () => {
    transfer.preview.mockResolvedValue(preview());
    transfer.move.mockResolvedValue(movedOutcome());
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    // The draft composer's worktree row, read-only.
    expect(await screen.findByText("Worktree + changes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Branch" }).textContent).toBe("feature");
    // Two candidates make the environment control a direct toggle: one press
    // switches to the only other machine, with no menu in between.
    fireEvent.click(screen.getByRole("button", { name: "Machine: MacBook" }));
    await waitFor(() =>
      expect(transfer.preview).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ key: "mini" }),
        "host-app-mini",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(transfer.move).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "host-app-mini",
          target: expect.objectContaining({ key: "mini" }),
        }),
      ),
    );
  });

  it("lists only move candidates in the environment menu", async () => {
    useAppStore.setState({ projects: [LOCAL, MAC, MINI, STUDIO] });
    useRemoteServersStore.setState({
      servers: [
        { desktopId: "mac", label: "MacBook" },
        { desktopId: "mini", label: "Mac mini" },
        { desktopId: "studio", label: "Studio" },
      ],
      runtime: {
        ...runtime("online", "mac"),
        ...runtime("online", "mini"),
        ...runtime("online", "studio"),
      },
    } as never);
    transfer.preview.mockResolvedValue(preview());
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Machine: MacBook" }));
    const menu = await screen.findByRole("menu");
    // The source machine is filtered out, not shown disabled.
    expect(within(menu).queryByRole("menuitemradio", { name: /Local/ })).toBeNull();
    expect(within(menu).getByRole("menuitemradio", { name: /MacBook/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitemradio", { name: /Mac mini/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitemradio", { name: /Studio/ })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Studio/ }));
    await waitFor(() =>
      expect(transfer.preview).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ key: "studio" }),
        "host-app-studio",
      ),
    );
  });

  it("shows a single destination as a static machine label", async () => {
    useAppStore.setState({ projects: [LOCAL, MAC] });
    useRemoteServersStore.setState({
      servers: [{ desktopId: "mac", label: "MacBook" }],
      runtime: runtime("online", "mac"),
    } as never);
    transfer.preview.mockResolvedValue(preview());
    const { baseElement } = render(<MoveThreadDialog sourceThreadId="thread-1" />);
    await screen.findByText("Worktree + changes");
    // One candidate renders the environment menu's single-machine label —
    // same muted treatment as the project label, never a disabled control.
    const label = baseElement.querySelector("[data-project-environment]");
    expect(label?.textContent).toContain("MacBook");
    expect(label?.className).toContain("text-muted/60");
    expect(screen.queryByRole("button", { name: /Machine:/ })).toBeNull();
  });

  it("shows the not-set-up message and disables Move when no other environment exists", async () => {
    useAppStore.setState({ projects: [LOCAL] });
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(
      await screen.findByText(
        /isn't set up on another machine yet\. Add it there to move this thread\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Machine:/ })).toBeNull();
    expect(screen.queryByPlaceholderText(/what to do next/)).toBeNull();
    expect(transfer.preview).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(true);
  });

  it("warns and disables Move when the project is gone from the target", async () => {
    transfer.preview.mockResolvedValue(preview({ project: null }));
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(await screen.findByText("That project is no longer on MacBook.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(true);
  });

  it("warns and disables Move when the target project is not a Git repository", async () => {
    transfer.preview.mockResolvedValue(
      preview({
        project: { projectId: "host-app-mac", name: "App", matched: true, git: false },
      }),
    );
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(
      await screen.findByText(
        "App on MacBook isn't a Git repository, so its code can't move there.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(true);
  });

  it("offers to stop a working agent and resume it on the target", async () => {
    transfer.preview.mockResolvedValue(preview());
    useAppStore.setState({ threads: [{ ...thread, status: "working" }] });
    transfer.move.mockResolvedValue(movedOutcome());
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(
      await screen.findByText(
        "The agent is working. Moving stops it here and resumes the work on MacBook.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop and move" }));
    await waitFor(() =>
      expect(transfer.move).toHaveBeenCalledWith(expect.objectContaining({ stopFirst: true })),
    );
  });

  it("warns and opens on the first ready agent when the thread's agent is missing", async () => {
    transfer.preview.mockResolvedValue(preview({ agents: [CLAUDE], sourceAgentReady: false }));
    transfer.move.mockResolvedValue(movedOutcome());
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(
      await screen.findByText(
        "codex isn't set up on MacBook. Pick the agent that continues there.",
      ),
    ).toBeTruthy();
    expect(await screen.findByPlaceholderText(/what to do next/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(transfer.move).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: expect.objectContaining({ kind: "claude", config: expect.anything() }),
        }),
      ),
    );
  });

  it("hides the composer and disables Move when no chat agent is ready", async () => {
    transfer.preview.mockResolvedValue(preview({ agents: [], sourceAgentReady: false }));
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(
      await screen.findByText(
        "codex isn't set up on MacBook, and no other chat agent is ready there. Set one up there first.",
      ),
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText(/what to do next/)).toBeNull();
    expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps Move disabled for a thread that cannot move", async () => {
    transfer.preview.mockResolvedValue(preview({ blocker: "no_history" }));
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(await screen.findByText("This thread has no conversation to move yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(true);
  });

  it("warns that an environment reached through this computer needs it to stay on", async () => {
    useAppStore.setState({ projects: [LOCAL, ENV] });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "env-child",
          connectionId: "env-1",
          label: "Poracode on GPU box",
          transport: { kind: "environment", environmentId: "e1", managedHostDesktopId: "me" },
        },
      ],
      runtime: runtime("online", "env-1"),
    } as never);
    transfer.preview.mockResolvedValue(
      preview({
        project: { projectId: "host-app-env", name: "App", matched: true, git: true },
      }),
    );
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(
      await screen.findByText(
        "GPU box is reached through this computer, so you can't open it while this computer is off.",
      ),
    ).toBeTruthy();
  });

  it("shows Stop and move from the live thread status, then flips back when it settles", async () => {
    transfer.preview.mockResolvedValue(preview());
    useAppStore.setState({ threads: [{ ...thread, status: "working" }] });
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(
      await screen.findByText(
        "The agent is working. Moving stops it here and resumes the work on MacBook.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop and move" })).toBeTruthy();
    // The turn ends while the dialog stays open: the live status flips it back.
    useAppStore.setState({ threads: [thread] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Move" })).toBeTruthy());
    expect(screen.queryByText(/The agent is working/)).toBeNull();
  });

  it("loads the preview once an offline target comes online", async () => {
    useAppStore.setState({ projects: [LOCAL, MAC] });
    useRemoteServersStore.setState({
      servers: [{ desktopId: "mac", label: "MacBook" }],
      runtime: runtime("offline", "mac"),
    } as never);
    transfer.preview.mockResolvedValue(preview());
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(await screen.findByText("MacBook is offline. Connect to it first.")).toBeTruthy();
    expect(transfer.preview).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(true);
    useRemoteServersStore.setState({
      servers: [{ desktopId: "mac", label: "MacBook" }],
      runtime: runtime("online", "mac"),
    } as never);
    await waitFor(() => expect(transfer.preview).toHaveBeenCalled());
    // The draft composer's worktree row, read-only.
    expect(await screen.findByText("Worktree + changes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Branch" }).textContent).toBe("feature");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(false),
    );
  });

  it("retries a failed preview from the error row", async () => {
    transfer.preview
      .mockRejectedValueOnce(new Error("preview exploded"))
      .mockResolvedValue(preview());
    render(<MoveThreadDialog sourceThreadId="thread-1" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("preview exploded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(transfer.preview).toHaveBeenCalledTimes(2));
    // The composer is back and Move is enabled once the retry resolves.
    expect(await screen.findByText("Worktree + changes")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move" }).hasAttribute("disabled")).toBe(false),
    );
  });
});
