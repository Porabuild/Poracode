import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubAccountRef, McpServer, Project, ProjectScripts } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  visibleCatalogProjects,
  confirmProjectRemoval,
} from "@/renderer/state/projectRemovalIntents";
import { forgetPendingCatalogEdit } from "@/renderer/state/pendingCatalogEdits";
import { finalizeProjectRemoval } from "@/renderer/state/projectRemovalPresentation";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import * as bridgeRuntime from "@/renderer/bridge";
import {
  saveProjectMcpServers,
  setProjectDisabled,
  relocateProject,
  updateProjectGhAccount,
  updateProjectIcon,
  updateProjectMcpServers,
  updateProjectScripts,
  deleteProject,
} from "./projectActions";

const { runProjectCommand, serverRuntime, toast } = vi.hoisted(() => ({
  runProjectCommand: vi.fn<(desktopId: string, command: unknown) => Promise<void>>(),
  serverRuntime: {} as Record<string, { status: string } | undefined>,
  toast: {
    danger: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@heroui/react", () => ({ toast }));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => ({ runProjectCommand, runtime: serverRuntime }),
  },
}));

const initialScripts: ProjectScripts = { actions: [] };
const project: Project = {
  id: "remote-project-view",
  name: "Remote project",
  location: {
    kind: "posix",
    path: "/repo",
    remoteServerId: "desktop-1",
  },
  remoteServerId: "desktop-1",
  remoteId: "remote-project",
  scripts: initialScripts,
  createdAt: "2026-08-02T00:00:00.000Z",
};

describe("remote project actions", () => {
  beforeEach(() => {
    confirmProjectRemoval(project.id);
    forgetPendingCatalogEdit("project", project.id);
    runProjectCommand.mockReset().mockResolvedValue(undefined);
    serverRuntime["desktop-1"] = { status: "online" };
    toast.danger.mockReset();
    toast.success.mockReset();
    useAppStore.setState({ projects: [project], threads: [] });
  });

  it("hides a project immediately and restores its latest metadata and draft on refusal", async () => {
    let reject!: (error: Error) => void;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise((_accept, refuse) => {
          reject = refuse;
        }),
    );
    const view = { kind: "draft" as const, projectId: project.id };
    const draft = {
      segments: [{ kind: "text" as const, content: "unsaved prompt" }],
      attachments: [],
    };
    useAppStore.setState({ view, draftContents: { [project.id]: draft } });
    deleteProject(project.id);
    expect(useAppStore.getState().projects).toEqual([]);
    expect(useAppStore.getState().view.kind).toBe("home");
    expect(useAppStore.getState().draftContents[project.id]).toBe(draft);
    expect(visibleCatalogProjects([{ ...project, name: "Updated on host" }])).toEqual([]);
    reject(new Error("refused"));
    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("refused"));
    expect(useAppStore.getState().projects[0]?.name).toBe("Updated on host");
    expect(useAppStore.getState().view).toEqual(view);
    expect(useAppStore.getState().draftContents[project.id]).toBe(draft);
  });

  it("releases hidden project drafts only after acceptance", async () => {
    let accept!: () => void;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    useAppStore.setState({ draftContents: { [project.id]: { segments: [], attachments: [] } } });
    deleteProject(project.id);
    expect(useAppStore.getState().draftContents[project.id]).toBeDefined();
    accept();
    await vi.waitFor(() =>
      expect(useAppStore.getState().draftContents[project.id]).toBeUndefined(),
    );
    expect(useAppStore.getState().projects).toEqual([]);
    confirmProjectRemoval(project.id);
  });

  it("keeps authoritative absence final when a held local removal subsequently refuses", async () => {
    let reject!: (error: Error) => void;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((_accept, refuse) => {
          reject = refuse;
        }),
    );
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "test" },
      prompt: "test",
    });
    const draft = { segments: [], attachments: [] };
    useAppStore.setState({
      view: { kind: "thread", panes: [thread.id] },
      draftContents: { [project.id]: draft },
      threadDraftContents: { [thread.id]: draft },
    });
    deleteProject(project.id);
    finalizeProjectRemoval(project.id);
    reject(new Error("lost reply"));
    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("lost reply"));
    expect(useAppStore.getState().projects).toEqual([]);
    expect(useAppStore.getState().threads).toEqual([]);
    expect(useAppStore.getState().draftContents[project.id]).toBeUndefined();
    expect(useAppStore.getState().threadDraftContents[thread.id]).toBeUndefined();
    expect(useAppStore.getState().view.kind).toBe("home");
  });

  it("restores cleared optional metadata from the latest complete host row", async () => {
    let reject!: (error: Error) => void;
    useAppStore.setState({
      projects: [{ ...project, disabled: true, icon: "old", mcpServers: [] }],
    });
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((_accept, refuse) => {
          reject = refuse;
        }),
    );
    deleteProject(project.id);
    visibleCatalogProjects([project]);
    reject(new Error("refused"));
    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalled());
    expect(useAppStore.getState().projects[0]?.disabled).toBeUndefined();
    expect(useAppStore.getState().projects[0]?.icon).toBeUndefined();
    expect(useAppStore.getState().projects[0]?.mcpServers).toEqual([]);
  });

  it("paints project settings while the remote host accepts them", async () => {
    let accept: (() => void) | undefined;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const scripts: ProjectScripts = { actions: [], setupScript: "pnpm install" };

    updateProjectScripts(project.id, scripts);

    expect(useAppStore.getState().projects[0]?.scripts).toEqual(scripts);
    accept?.();
    await vi.waitFor(() => expect(useAppStore.getState().projects[0]?.scripts).toEqual(scripts));
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "update",
      projectId: "remote-project",
      patch: { scripts },
    });
  });

  it("relocates a project through its host and surfaces the host's refusal", async () => {
    await relocateProject(project.id, "/moved/repo");
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "relocate",
      projectId: "remote-project",
      path: "/moved/repo",
    });
    expect(toast.success).toHaveBeenCalledTimes(1);

    runProjectCommand.mockRejectedValueOnce(
      new Error("This folder is already registered as a project."),
    );
    await relocateProject(project.id, "/other/repo");
    expect(toast.danger).toHaveBeenCalledWith("This folder is already registered as a project.");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("keeps project settings unchanged when the remote host is offline", async () => {
    runProjectCommand.mockRejectedValueOnce(new Error("remote server offline"));

    updateProjectScripts(project.id, { actions: [], cleanupScript: "cleanup" });

    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("remote server offline"));
    expect(useAppStore.getState().projects[0]?.scripts).toEqual(initialScripts);
  });

  it("applies MCP settings only after the remote host accepts them", async () => {
    let accept: (() => void) | undefined;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const mcpServers: McpServer[] = [
      {
        id: "memory-id",
        name: "memory-server",
        description: "Memory tools",
        enabled: true,
        timeoutMs: 30_000,
        transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
      },
    ];

    updateProjectMcpServers(project.id, mcpServers);

    expect(useAppStore.getState().projects[0]?.mcpServers).toBeUndefined();
    accept?.();
    await vi.waitFor(() =>
      expect(useAppStore.getState().projects[0]?.mcpServers).toEqual(mcpServers),
    );
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "update",
      projectId: "remote-project",
      patch: { mcpServers },
    });
  });

  it("saveProjectMcpServers resolves only after the host confirms the change", async () => {
    let accept: (() => void) | undefined;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const mcpServers: McpServer[] = [
      {
        id: "memory-id",
        name: "memory-server",
        description: "Memory tools",
        enabled: true,
        timeoutMs: 30_000,
        transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
      },
    ];

    let settled = false;
    const request = saveProjectMcpServers(project.id, mcpServers).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(runProjectCommand).toHaveBeenCalledOnce());

    // The seam is real: while the host command is in flight the save has not
    // resolved and the row is untouched — a sequenced follow-up write (the
    // source half of a move) can safely wait on this.
    expect(settled).toBe(false);
    expect(useAppStore.getState().projects[0]?.mcpServers).toBeUndefined();

    accept?.();
    await request;
    expect(settled).toBe(true);
    expect(useAppStore.getState().projects[0]?.mcpServers).toEqual(mcpServers);
  });

  it("refuses a save when the destination project disappeared instead of confirming a no-op", async () => {
    useAppStore.setState({ projects: [] });
    await expect(saveProjectMcpServers(project.id, [])).rejects.toThrow("Project not found.");
    expect(runProjectCommand).not.toHaveBeenCalled();
  });

  it("saveProjectMcpServers rejects when the host refuses and leaves the row untouched", async () => {
    runProjectCommand.mockRejectedValueOnce(
      new Error("mcp_redaction_without_existing_secret: The MCP server change is invalid."),
    );

    await expect(saveProjectMcpServers(project.id, [])).rejects.toThrow(
      "mcp_redaction_without_existing_secret",
    );
    expect(useAppStore.getState().projects[0]?.mcpServers).toBeUndefined();
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "update",
      projectId: "remote-project",
      patch: { mcpServers: null },
    });
  });

  it("keeps the fire-and-forget MCP save fully handled: refusal toasts once and keeps the row", async () => {
    runProjectCommand.mockRejectedValueOnce(new Error("remote server offline"));

    updateProjectMcpServers(project.id, []);

    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("remote server offline"));
    expect(toast.danger).toHaveBeenCalledOnce();
    expect(useAppStore.getState().projects[0]?.mcpServers).toBeUndefined();
  });

  it("persists the GitHub account on the remote host before applying it locally", async () => {
    let accept: (() => void) | undefined;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const account: GitHubAccountRef = { host: "github.com", login: "octocat" };

    const request = updateProjectGhAccount(project.id, account);

    expect(useAppStore.getState().projects[0]?.ghAccount).toBeUndefined();
    accept?.();
    await expect(request).resolves.toBe(true);
    await vi.waitFor(() => expect(useAppStore.getState().projects[0]?.ghAccount).toEqual(account));
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "update",
      projectId: "remote-project",
      patch: { ghAccount: account },
    });
  });

  it("serializes rapid GitHub account changes for a remote project", async () => {
    let acceptFirst: (() => void) | undefined;
    let acceptSecond: (() => void) | undefined;
    runProjectCommand
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            acceptFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            acceptSecond = resolve;
          }),
      );
    const first = { host: "github.com", login: "first" };
    const second = { host: "github.com", login: "second" };

    const firstRequest = updateProjectGhAccount(project.id, first);
    const secondRequest = updateProjectGhAccount(project.id, second);

    expect(runProjectCommand).toHaveBeenCalledTimes(1);
    acceptFirst?.();
    await vi.waitFor(() => expect(runProjectCommand).toHaveBeenCalledTimes(2));
    expect(useAppStore.getState().projects[0]?.ghAccount).toEqual(first);

    acceptSecond?.();
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([true, true]);
    expect(useAppStore.getState().projects[0]?.ghAccount).toEqual(second);
    expect(runProjectCommand.mock.calls.map(([, command]) => command)).toEqual([
      {
        kind: "update",
        projectId: "remote-project",
        patch: { ghAccount: first },
      },
      {
        kind: "update",
        projectId: "remote-project",
        patch: { ghAccount: second },
      },
    ]);
  });

  it("does not disable a remote project until the host accepts the command", async () => {
    runProjectCommand.mockRejectedValueOnce(new Error("remote server offline"));

    setProjectDisabled(project.id, true);

    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("remote server offline"));
    expect(useAppStore.getState().projects[0]?.disabled).not.toBe(true);
  });

  it("stops the owning host's git watch once it accepts disabling a paired project", async () => {
    const gitUnwatchProject = vi.fn<(payload: unknown) => Promise<void>>(async () => undefined);
    const readBridge = vi.spyOn(bridgeRuntime, "readBridge").mockReturnValue({
      gitUnwatchProject,
    } as unknown as ReturnType<typeof bridgeRuntime.readBridge>);
    try {
      setProjectDisabled(project.id, true);

      await vi.waitFor(() => expect(gitUnwatchProject).toHaveBeenCalledTimes(1));
      expect(gitUnwatchProject).toHaveBeenCalledWith({ projectId: project.id });
    } finally {
      readBridge.mockRestore();
    }
  });

  it("does not ask an unreachable paired host to stop its git watch", async () => {
    serverRuntime["desktop-1"] = { status: "offline" };
    const gitUnwatchProject = vi.fn<(payload: unknown) => Promise<void>>(async () => undefined);
    const readBridge = vi.spyOn(bridgeRuntime, "readBridge").mockReturnValue({
      gitUnwatchProject,
    } as unknown as ReturnType<typeof bridgeRuntime.readBridge>);
    try {
      setProjectDisabled(project.id, true);

      await vi.waitFor(() => expect(useAppStore.getState().projects[0]?.disabled).toBe(true));
      expect(gitUnwatchProject).not.toHaveBeenCalled();
    } finally {
      readBridge.mockRestore();
    }
  });

  it("releases a WSL distro only when no other project on the same host still uses it", async () => {
    const wsl = (id: string, remoteServerId?: string): Project => ({
      ...project,
      id,
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        ...(remoteServerId ? { remoteServerId } : {}),
      } as Project["location"],
      ...(remoteServerId ? { remoteServerId, remoteId: id } : {}),
    });
    const paired = wsl("paired-wsl", "desktop-1");
    // Same distro name on this machine must not keep the paired host's distro alive.
    const managed = { ...wsl("managed-wsl"), remoteServerId: undefined, remoteId: undefined };
    useAppStore.setState({ projects: [paired, managed] as Project[] });
    const gitUnwatchProject = vi.fn<(payload: unknown) => Promise<void>>(async () => undefined);
    const readBridge = vi.spyOn(bridgeRuntime, "readBridge").mockReturnValue({
      gitUnwatchProject,
    } as unknown as ReturnType<typeof bridgeRuntime.readBridge>);
    try {
      setProjectDisabled(paired.id, true);

      await vi.waitFor(() =>
        expect(gitUnwatchProject).toHaveBeenCalledWith({
          projectId: paired.id,
          releaseWslDistro: "Ubuntu",
        }),
      );
    } finally {
      readBridge.mockRestore();
    }
  });

  it("preserves dirty editor contents and restores navigation when disabling is refused", async () => {
    runProjectCommand.mockRejectedValueOnce(new Error("refused"));
    const context = {
      projectId: project.id,
      projectName: project.name,
      projectLocation: project.location,
      rootLabel: project.name,
    };
    const buffer = {
      path: "a.txt",
      status: "ready" as const,
      modifiedAtMs: 1,
      content: "unsaved",
      savedContent: "saved",
      lineEnding: "lf" as const,
      hasBom: false,
      isDirty: true,
      isLoading: false,
    };
    useFileEditorStore.setState({
      rootContext: context,
      buffers: { "a.txt": buffer },
      tabs: ["a.txt"],
      activePath: "a.txt",
    });
    usePanelStore.setState({
      filesPanelContext: {
        projectId: project.id,
        projectName: project.name,
        rootLabel: project.name,
      },
    });
    const view = { kind: "draft" as const, projectId: project.id };
    useAppStore.setState({ view });
    setProjectDisabled(project.id, true);
    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("refused"));
    expect(useFileEditorStore.getState().buffers["a.txt"]).toBe(buffer);
    expect(useFileEditorStore.getState().rootContext).toBe(context);
    expect(useAppStore.getState().view).toEqual(view);
    useFileEditorStore.getState().clearSession();
    usePanelStore.setState({ filesPanelContext: null });
  });

  it("paints a project icon while the remote host accepts it", async () => {
    let accept: (() => void) | undefined;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );

    updateProjectIcon(project.id, "lucide:rocket");

    expect(useAppStore.getState().projects[0]?.icon).toBe("lucide:rocket");
    accept?.();
    await vi.waitFor(() => expect(useAppStore.getState().projects[0]?.icon).toBe("lucide:rocket"));
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "update",
      projectId: "remote-project",
      patch: { icon: "lucide:rocket" },
    });
  });

  it("clears a remote project icon by patching null", async () => {
    useAppStore.setState({ projects: [{ ...project, icon: "auto" }], threads: [] });

    updateProjectIcon(project.id, undefined);

    await vi.waitFor(() => expect(runProjectCommand).toHaveBeenCalled());
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "update",
      projectId: "remote-project",
      patch: { icon: null },
    });
  });
});

describe("local project icon action", () => {
  const localProject: Project = {
    id: "local-project",
    name: "Local project",
    location: { kind: "windows", path: "E:/work/app" },
    createdAt: "2026-08-02T00:00:00.000Z",
  };

  beforeEach(() => {
    runProjectCommand.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({ projects: [localProject], threads: [] });
  });

  it("sets and clears the icon immediately without any remote call", () => {
    updateProjectIcon(localProject.id, "lucide:folder-git");
    expect(useAppStore.getState().projects[0]?.icon).toBe("lucide:folder-git");

    updateProjectIcon(localProject.id, "auto");
    expect(useAppStore.getState().projects[0]?.icon).toBe("auto");

    updateProjectIcon(localProject.id, undefined);
    expect(useAppStore.getState().projects[0]?.icon).toBeUndefined();
    expect(runProjectCommand).not.toHaveBeenCalled();
  });

  it("saves local MCP servers immediately and resolves without a host command", async () => {
    const mcpServers: McpServer[] = [
      {
        id: "local-memory",
        name: "local-memory",
        description: "",
        enabled: true,
        timeoutMs: 30_000,
        transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
      },
    ];

    await expect(saveProjectMcpServers(localProject.id, mcpServers)).resolves.toBeUndefined();
    expect(useAppStore.getState().projects[0]?.mcpServers).toEqual(mcpServers);
    expect(runProjectCommand).not.toHaveBeenCalled();
  });

  it("forgets a hidden terminal's scope when its project is disabled", () => {
    resetDevTerminalStore();
    useDevTerminalStore.getState().openPanel(localProject.id);
    useDevTerminalStore.getState().hidePanel();
    const readBridge = vi.spyOn(bridgeRuntime, "readBridge").mockReturnValue({
      gitUnwatchProject: async () => undefined,
    } as unknown as ReturnType<typeof bridgeRuntime.readBridge>);
    try {
      setProjectDisabled(localProject.id, true);

      expect(useDevTerminalStore.getState().activeProjectId).toBeNull();
    } finally {
      readBridge.mockRestore();
    }
  });

  it("keeps the global terminal open when its saved project scope is disabled", () => {
    resetDevTerminalStore();
    useDevTerminalStore.getState().openPanel(localProject.id);
    useDevTerminalStore.getState().openGlobalPanel();
    const readBridge = vi.spyOn(bridgeRuntime, "readBridge").mockReturnValue({
      gitUnwatchProject: async () => undefined,
    } as unknown as ReturnType<typeof bridgeRuntime.readBridge>);
    try {
      setProjectDisabled(localProject.id, true);
      expect(useDevTerminalStore.getState()).toMatchObject({ isOpen: true, source: "global" });
    } finally {
      readBridge.mockRestore();
      resetDevTerminalStore();
    }
  });

  it("keeps the global terminal open when the saved project is removed", async () => {
    resetDevTerminalStore();
    useDevTerminalStore.getState().openPanel(localProject.id);
    useDevTerminalStore.getState().openGlobalPanel();
    deleteProject(localProject.id);
    await vi.waitFor(() => expect(useAppStore.getState().projects).toEqual([]));
    expect(useDevTerminalStore.getState()).toMatchObject({ isOpen: true, source: "global" });
    resetDevTerminalStore();
  });
});
