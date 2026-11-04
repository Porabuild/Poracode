import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, ProjectDraftConfig } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { makeDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { ProjectSwitchMenu } from "./ProjectSwitchMenu";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
}));

function project(id: string, name: string, workspaceId?: string): Project {
  return {
    id,
    name,
    location: { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-07-01T00:00:00.000Z",
    ...(workspaceId ? { workspaceId } : {}),
  } as Project;
}

// Mirrors production: the synthetic Home row is persisted with `disabled: true`
// and must still be offered by every workspace.
const homeProject = { ...project(HOME_PROJECT_ID, HOME_PROJECT_NAME), disabled: true } as Project;

const workProject = project("a", "Alpha", "w1");
const sideHustleProject = project("b", "Beta", "w2");
const unfiledProject = project("c", "Gamma");

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
  return screen.findByRole("menu");
}

describe("ProjectSwitchMenu", () => {
  beforeEach(() => {
    localStorage.clear();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useGitStore.setState({ statuses: {} });
    useSharedSettings.setState({
      workspaces: [
        { id: "w1", name: "Work", icon: "briefcase", createdAt: "2026-07-27T00:00:00.000Z" },
        { id: "w2", name: "Side Hustle", icon: "rocket", createdAt: "2026-07-27T00:00:00.000Z" },
      ],
    });
    useWorkspaceStore.setState({ activeWorkspaceId: "w1", lastProjectIdByWorkspace: {} });
    useAppStore.setState({
      projects: [homeProject, workProject, sideHustleProject, unfiledProject],
      view: { kind: "draft", projectId: "a" },
      draftContents: {},
      draftContentDiscardRequests: {},
    });
  });

  afterEach(() => {
    composerDraftStorage()?.flush();
  });

  it("offers only the active workspace's projects, like the sidebar", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    // Home and unfiled projects belong to every workspace; Beta is filed in
    // Side Hustle and stays out of the list entirely.
    expect(within(menu).queryByRole("group")).not.toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual([HOME_PROJECT_NAME, "Alpha", "Gamma"]);
    expect(within(menu).queryByText("Other workspaces")).not.toBeInTheDocument();
  });

  it("keeps a flat list when every project belongs to the active workspace", async () => {
    useAppStore.setState({ projects: [homeProject, workProject, unfiledProject] });
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    expect(within(menu).queryByRole("group")).not.toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(3);
  });

  it("does not offer projects filed in another workspace", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    expect(within(menu).queryByRole("menuitemradio", { name: /Beta/ })).not.toBeInTheDocument();
  });

  it("remembers an in-workspace pick for the active workspace", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Gamma" }));

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "c" });
    });
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("w1");
    expect(useWorkspaceStore.getState().lastProjectIdByWorkspace).toEqual({ w1: "c" });
  });

  it.each([false, true])(
    "moves the typed prompt and model to the selected project (pane: %s)",
    async (inPane) => {
      const sourceConfig: ProjectDraftConfig = {
        agentKind: "codex",
        model: "gpt-5.4-mini",
        effort: "high",
        contextSize: "",
        fast: false,
        thinking: false,
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: { agentKind: "codex", presentationMode: "gui" },
          model: "gpt-5.4-mini",
          inertValues: { contextSize: "", fast: false },
        },
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        worktreeMode: true,
      };
      const targetConfig: ProjectDraftConfig = {
        agentKind: "codex",
        model: "gpt-5.4",
        approvalPolicy: "on-request",
        sandboxMode: "read-only",
        worktreeMode: false,
      };
      const content = {
        segments: [{ kind: "text" as const, content: "  Fix this bug\nwithout losing my draft  " }],
        attachments: [{ id: "image", path: "C:\\image.png", name: "image.png", isImage: true }],
      };
      const paneId = makeDraftPaneId("a");
      useAppStore.setState({
        projects: [
          { ...workProject, lastDraftConfig: sourceConfig },
          {
            ...unfiledProject,
            lastDraftConfig: targetConfig,
          },
        ],
        draftContents: { a: content },
        ...(inPane ? { view: { kind: "thread" as const, panes: [paneId] } } : {}),
      });
      render(
        <ProjectSwitchMenu
          currentProjectId="a"
          variant="compact"
          {...(inPane ? { paneId } : {})}
        />,
      );
      const menu = await openMenu();
      fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Gamma" }));

      await waitFor(() => {
        const view = useAppStore.getState().view;
        expect(view.kind).toBe(inPane ? "thread" : "draft");
        expect(
          view.kind === "thread"
            ? view.panes.map(parseDraftProjectId)
            : view.kind === "draft"
              ? [view.projectId]
              : [],
        ).toEqual(["c"]);
      });
      expect(useAppStore.getState().draftContents).toEqual({ c: content });
      expect(
        useAppStore.getState().projects.find((row) => row.id === "c")?.lastDraftConfig,
      ).toEqual({
        ...sourceConfig,
        approvalPolicy: targetConfig.approvalPolicy,
        sandboxMode: targetConfig.sandboxMode,
        worktreeMode: false,
      });
    },
  );

  it("replaces the target's complete model selection, including absent fields", async () => {
    useAppStore.setState({
      projects: [
        { ...workProject, lastDraftConfig: { agentKind: "claude", model: "sonnet" } },
        {
          ...unfiledProject,
          lastDraftConfig: {
            agentKind: "codex",
            model: "gpt-5.4-mini",
            effort: "high",
            contextSize: "1m",
            fast: true,
            thinking: true,
            selectionBinding: {
              version: 1,
              kind: "family-member",
              owner: { agentKind: "codex", presentationMode: "gui" },
              model: "gpt-5.4-mini",
              inertValues: { fast: true },
            },
            worktreeMode: false,
          },
        },
      ],
      draftContents: {
        a: { segments: [{ kind: "text", content: "Keep this prompt" }], attachments: [] },
      },
    });
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Gamma" }));

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "c" });
    });
    expect(useAppStore.getState().projects.find((row) => row.id === "c")?.lastDraftConfig).toEqual({
      agentKind: "claude",
      model: "sonnet",
      worktreeMode: false,
    });
  });

  it.each(["", " \n "])(
    "keeps the target project's draft and model when the prompt is empty (%j)",
    async (prompt) => {
      const targetConfig: ProjectDraftConfig = { agentKind: "claude", model: "sonnet" };
      const targetContent = {
        segments: [{ kind: "text" as const, content: "Existing target draft" }],
        attachments: [],
      };
      useAppStore.setState({
        projects: [
          { ...workProject, lastDraftConfig: { agentKind: "codex", model: "gpt-5.4-mini" } },
          { ...unfiledProject, lastDraftConfig: targetConfig },
        ],
        draftContents: {
          a: { segments: [{ kind: "text", content: prompt }], attachments: [] },
          c: targetContent,
        },
      });
      render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
      const menu = await openMenu();
      fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Gamma" }));

      await waitFor(() => {
        expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "c" });
      });
      expect(useAppStore.getState().draftContents).toEqual({ c: targetContent });
      expect(
        useAppStore.getState().projects.find((row) => row.id === "c")?.lastDraftConfig,
      ).toEqual(targetConfig);
    },
  );

  it("lists one project per repository and picks the environment separately", async () => {
    const mirrored = {
      ...project("r", "Alpha", "w1"),
      remoteServerId: "desktop-1",
      remoteId: "rp-1",
    } as Project;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({ projects: [workProject, mirrored, unfiledProject] });

    render(<ProjectSwitchMenu currentProjectId="r" variant="compact" />);

    // The local and mirrored "Alpha" are one project; the machine moves to the
    // environment switcher instead of a second project row.
    expect(screen.getByRole("button", { name: "Switch project" })).not.toHaveTextContent(
      "MacBook 16",
    );
    const environment = screen.getByRole("button", { name: /^Machine:/ });
    expect(environment).toHaveTextContent("MacBook 16");
    const projectTrigger = screen.getByRole("button", { name: "Switch project" });
    expect(projectTrigger.querySelector(".lucide-folder-open")).toBeInTheDocument();
    expect(within(projectTrigger).queryByTitle("Online")).not.toBeInTheDocument();
    expect(within(environment).getAllByTitle("Online")).toHaveLength(1);
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["Alpha", "Gamma"]);
  });

  it("moves the draft to another environment of the same project", async () => {
    const mirrored = {
      ...project("r", "Alpha", "w1"),
      remoteServerId: "desktop-1",
      remoteId: "rp-1",
    } as Project;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({
      projects: [workProject, mirrored],
      view: { kind: "draft", projectId: "a" },
    });

    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    fireEvent.click(screen.getByRole("button", { name: /^Machine:/ }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /MacBook 16/ }));

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "r" });
    });
  });

  it("names the machine of a project that only lives on a paired machine", () => {
    const mirrored = {
      ...project("r", "Remote only", "w1"),
      remoteServerId: "desktop-1",
      remoteId: "rp-1",
    } as Project;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({ projects: [workProject, mirrored] });

    render(<ProjectSwitchMenu currentProjectId="r" variant="compact" />);
    expect(screen.queryByRole("button", { name: /^Machine:/ })).not.toBeInTheDocument();
    expect(screen.getByText("MacBook 16")).toBeInTheDocument();
    const projectTrigger = screen.getByRole("button", { name: "Switch project" });
    expect(projectTrigger.querySelector(".lucide-folder-open")).toBeInTheDocument();
    expect(within(projectTrigger).queryByTitle("Online")).not.toBeInTheDocument();
    expect(screen.getAllByTitle("Online")).toHaveLength(1);
  });

  it("pins Home first, then local projects, then remote mirrors regardless of store order", async () => {
    const remoteAlpha = {
      ...project("r1", "RemoteAlpha"),
      remoteServerId: "desktop-1",
      remoteId: "rp-1",
    } as Project;
    const remoteGamma = {
      ...project("r2", "RemoteGamma"),
      remoteServerId: "desktop-1",
      remoteId: "rp-2",
    } as Project;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    // Store order interleaves remote mirrors among local projects — the
    // selector must ignore it and bucket Home, local, then remote.
    useAppStore.setState({
      projects: [
        remoteAlpha,
        homeProject,
        project("l1", "LocalBeta"),
        remoteGamma,
        project("l2", "LocalDelta"),
      ],
    });

    render(<ProjectSwitchMenu currentProjectId="l1" variant="compact" />);
    const menu = await openMenu();
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      HOME_PROJECT_NAME,
      "LocalBeta",
      "LocalDelta",
      "RemoteAlphaMacBook 16",
      "RemoteGammaMacBook 16",
    ]);
  });

  it("omits Home from the selector when the Home scope setting is off", async () => {
    useSharedSettings.setState({ homeScopeEnabled: false });
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["Alpha", "Gamma"]);
  });

  it("labels the trigger with a draft that outlived a workspace switch", async () => {
    render(<ProjectSwitchMenu currentProjectId="b" variant="compact" />);

    expect(screen.getByRole("button", { name: "Switch project" })).toHaveTextContent("Beta");

    // Beta is filed in Side Hustle, so the Work-scoped menu offers the active
    // workspace's projects instead.
    const menu = await openMenu();
    expect(within(menu).queryByRole("menuitemradio", { name: /Beta/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
  });

  it("keeps a hidden current project switchable when one active target remains", async () => {
    useSharedSettings.setState({ homeScopeEnabled: false });
    useAppStore.setState({ projects: [workProject, sideHustleProject] });
    render(<ProjectSwitchMenu currentProjectId="b" variant="compact" />);

    expect(screen.getByRole("button", { name: "Switch project" })).not.toBeDisabled();
    const menu = await openMenu();
    expect(within(menu).getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
  });
  describe("machines of one project", () => {
    function mirrorOf(server: string, workspaceId = "w1"): Project {
      return {
        ...project(`remote:${server}:project:a`, "Alpha", workspaceId),
        remoteServerId: server,
        remoteId: "a",
        location: { kind: "posix", path: "/alpha", remoteServerId: server },
      } as Project;
    }
    const mac = mirrorOf("mac");
    const mini = mirrorOf("mini");

    function pair(statuses: Record<string, "online" | "offline">) {
      useRemoteServersStore.setState({
        servers: [
          { desktopId: "mac", label: "Poracode on MacBook" },
          { desktopId: "mini", label: "Poracode on Mac mini" },
        ],
        runtime: Object.fromEntries(
          Object.entries(statuses).map(([id, status]) => [
            id,
            { status, projects: [], threads: [] },
          ]),
        ),
      } as never);
    }

    it("lists an offline machine as unavailable and never switches to it", async () => {
      pair({ mac: "online", mini: "offline" });
      useAppStore.setState({ projects: [workProject, mac, mini] });
      render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);

      fireEvent.click(screen.getByRole("button", { name: "Machine: Local" }));
      const menu = await screen.findByRole("menu");
      const offline = within(menu).getByRole("menuitemradio", { name: /Mac mini/ });
      expect(offline).toHaveAttribute("aria-disabled", "true");
      expect(offline).toHaveTextContent("Offline");
      fireEvent.click(offline);
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "a" });
    });

    it("offers only machines whose copy is in the active workspace", async () => {
      pair({ mac: "online", mini: "online" });
      useAppStore.setState({ projects: [workProject, mac, mirrorOf("mini", "w2")] });
      render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);

      fireEvent.click(screen.getByRole("button", { name: "Machine: Local" }));
      const menu = await screen.findByRole("menu");
      expect(
        within(menu)
          .getAllByRole("menuitemradio")
          .map((item) => item.textContent),
      ).toEqual(["Local", "MacBook"]);
    });

    it("opens the machine used most recently, or the next reachable one", async () => {
      pair({ mac: "online", mini: "online" });
      useAppStore.setState({ projects: [workProject, mac, unfiledProject] });
      useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: { [mac.id]: 5 } });
      const { unmount } = render(<ProjectSwitchMenu currentProjectId="c" variant="compact" />);
      fireEvent.click(within(await openMenu()).getByRole("menuitemradio", { name: /Alpha/ }));
      await waitFor(() => {
        expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: mac.id });
      });
      unmount();

      pair({ mac: "offline", mini: "online" });
      useAppStore.setState({ view: { kind: "draft", projectId: "c" } });
      render(<ProjectSwitchMenu currentProjectId="c" variant="compact" />);
      fireEvent.click(within(await openMenu()).getByRole("menuitemradio", { name: /Alpha/ }));
      await waitFor(() => {
        expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "a" });
      });
    });

    it("carries the typed draft to the other machine and remembers it", async () => {
      pair({ mac: "online", mini: "online" });
      const content = {
        segments: [{ kind: "text" as const, content: "Ship it" }],
        attachments: [],
      };
      useAppStore.setState({ projects: [workProject, mac], draftContents: { a: content } });
      render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);

      fireEvent.click(screen.getByRole("button", { name: "Machine: Local" }));
      fireEvent.click(
        within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /MacBook/ }),
      );
      await waitFor(() => {
        expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: mac.id });
      });
      expect(useAppStore.getState().draftContents).toEqual({ [mac.id]: content });
      expect(useProjectGroupStore.getState().lastUsedAt[mac.id]).toBeTypeOf("number");
    });
  });
});
