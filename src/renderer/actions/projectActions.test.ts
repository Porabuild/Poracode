import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, Project, ProjectScripts } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import {
  setProjectDisabled,
  updateProjectIcon,
  updateProjectMcpServers,
  updateProjectScripts,
} from "./projectActions";

const { runProjectCommand, toast } = vi.hoisted(() => ({
  runProjectCommand: vi.fn<(desktopId: string, command: unknown) => Promise<void>>(),
  toast: {
    danger: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@heroui/react", () => ({ toast }));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => ({ runProjectCommand }),
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
    runProjectCommand.mockReset().mockResolvedValue(undefined);
    toast.danger.mockReset();
    useAppStore.setState({ projects: [project], threads: [] });
  });

  it("applies project settings only after the remote host accepts them", async () => {
    let accept: (() => void) | undefined;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const scripts: ProjectScripts = { actions: [], setupScript: "pnpm install" };

    updateProjectScripts(project.id, scripts);

    expect(useAppStore.getState().projects[0]?.scripts).toEqual(initialScripts);
    accept?.();
    await vi.waitFor(() => expect(useAppStore.getState().projects[0]?.scripts).toEqual(scripts));
    expect(runProjectCommand).toHaveBeenCalledWith("desktop-1", {
      kind: "update",
      projectId: "remote-project",
      patch: { scripts },
    });
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

  it("does not disable a remote project until the host accepts the command", async () => {
    runProjectCommand.mockRejectedValueOnce(new Error("remote server offline"));

    setProjectDisabled(project.id, true);

    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("remote server offline"));
    expect(useAppStore.getState().projects[0]?.disabled).not.toBe(true);
  });

  it("applies a project icon only after the remote host accepts it", async () => {
    let accept: (() => void) | undefined;
    runProjectCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );

    updateProjectIcon(project.id, "lucide:rocket");

    expect(useAppStore.getState().projects[0]?.icon).toBeUndefined();
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
});
