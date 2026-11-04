import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project, ProjectAction } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

type Writer = (...args: unknown[]) => void;
const writers = vi.hoisted(() => ({
  renameProject: vi.fn<Writer>(),
  setProjectPluginOverride: vi.fn<Writer>(),
  updateProjectIcon: vi.fn<Writer>(),
  updateProjectScripts: vi.fn<Writer>(),
  updateProjectSearchSettings: vi.fn<Writer>(),
  updateProjectWorktreeBaseBranch: vi.fn<Writer>(),
}));
const toastWarning = vi.hoisted(() => vi.fn<(message: string) => void>());

vi.mock("./projectActions", () => writers);
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { warning: toastWarning, danger: vi.fn<(message: string) => void>() },
}));

const {
  changeProjectActionsEverywhere,
  renameProjectEverywhere,
  setProjectActionsEverywhere,
  setProjectPluginOverrideEverywhere,
  setProjectPluginOverridesEverywhere,
  setWorktreeCopyPatternsEverywhere,
  sharedSettingsRows,
  updateProjectIconEverywhere,
  updateProjectSearchSettingsEverywhere,
  updateProjectWorktreeBaseBranchEverywhere,
} = await import("./projectGroupActions");

const ORIGIN = "https://github.com/porabuild/poracode.git";

const local: Project = {
  id: "pc",
  name: "Pora.code",
  location: { kind: "windows", path: "E:\\work\\pora" },
  createdAt: "2026-07-13T10:00:00.000Z",
  scripts: { actions: [], setupScript: "pnpm install" },
};

function mirror(server: string, overrides: Partial<Project> = {}): Project {
  return {
    id: `remote:${server}:project:p`,
    name: "Pora.code",
    remoteServerId: server,
    remoteId: "p",
    location: { kind: "posix", path: "/Users/me/pora", remoteServerId: server },
    createdAt: "2026-07-13T10:00:00.000Z",
    scripts: { actions: [], setupScript: `brew bundle # ${server}` },
    ...overrides,
  };
}

const MAC = mirror("mac").id;
const MAC2 = mirror("mac2").id;

/** Known origins prove the rows are one repository, so shared settings flow. */
function knownOrigins(ids: readonly string[], url = ORIGIN) {
  const statuses: Record<string, GitStatusResult> = {};
  for (const id of ids) {
    statuses[id] = {
      remoteInfo: { url, platform: "github", owner: "porabuild", repo: "poracode" },
    } as GitStatusResult;
  }
  useGitStore.setState({ statuses });
}

const ids = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls.map(([id]) => id);

let testClock = 0;

describe("projectGroupActions", () => {
  beforeEach(() => {
    // Each test starts outside the previous test's offline-notice window.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, (testClock += 30)));
    for (const writer of Object.values(writers)) writer.mockReset();
    toastWarning.mockReset();
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useAppStore.setState({ projects: [local, mirror("mac"), mirror("mac2")] });
    knownOrigins(["pc", MAC, MAC2]);
    useRemoteServersStore.setState({
      servers: [
        { desktopId: "mac", label: "Poracode on MacBook" },
        { desktopId: "mac2", label: "Poracode on Mac mini" },
      ],
      runtime: {
        mac: { status: "online", projects: [], threads: [] },
        mac2: { status: "offline", projects: [], threads: [] },
      },
    } as never);
  });

  it("writes shared actions to every reachable linked row and keeps each setup script", () => {
    const action = { id: "a1", name: "Test", command: "bun test", icon: "play" };
    setProjectActionsEverywhere("pc", [action]);

    expect(writers.updateProjectScripts.mock.calls).toEqual([
      ["pc", { actions: [action], setupScript: "pnpm install" }],
      [MAC, { actions: [action], setupScript: "brew bundle # mac" }],
    ]);
    // The offline Mac mini is skipped and named once, never queued.
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(String(toastWarning.mock.calls[0]![0])).toContain("Mac mini");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("names an offline machine once while a field is being typed", () => {
    for (const command of ["b", "bu", "bun"]) {
      changeProjectActionsEverywhere("pc", {
        kind: "update",
        actionId: "x",
        patch: { command },
      });
    }
    expect(toastWarning).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 6000);
    changeProjectActionsEverywhere("pc", { kind: "remove", actionId: "x" });
    expect(toastWarning).toHaveBeenCalledTimes(2);
  });

  it("never writes to a row grouped only by its name", () => {
    useGitStore.setState({ statuses: {} });
    expect(sharedSettingsRows("pc").map((row) => row.id)).toEqual(["pc"]);
    setProjectActionsEverywhere("pc", []);
    expect(ids(writers.updateProjectScripts)).toEqual(["pc"]);

    // Different known origins never share settings either.
    knownOrigins(["pc"]);
    useGitStore.setState((state) => ({
      statuses: {
        ...state.statuses,
        [MAC]: {
          remoteInfo: {
            url: "https://github.com/someone/else.git",
            platform: "github",
            owner: "someone",
            repo: "else",
          },
        } as GitStatusResult,
      },
    }));
    expect(sharedSettingsRows("pc").map((row) => row.id)).toEqual(["pc"]);
  });

  it("writes to rows the user linked even without known origins", () => {
    useGitStore.setState({ statuses: {} });
    useProjectGroupStore.setState({
      manualGroups: { pc: "group:pc", [MAC]: "group:pc" },
      lastUsedAt: {},
    });
    updateProjectWorktreeBaseBranchEverywhere("pc", "develop");
    expect(writers.updateProjectWorktreeBaseBranch.mock.calls).toEqual([
      ["pc", "develop"],
      [MAC, "develop"],
    ]);
  });

  it("applies one action edit to each row's own list", () => {
    const shared: ProjectAction = { id: "a", name: "Build", command: "bun run build" };
    const macOnly: ProjectAction = { id: "m", name: "Mac only", command: "open ." };
    useAppStore.setState({
      projects: [
        { ...local, scripts: { actions: [shared] } },
        mirror("mac", { scripts: { actions: [shared, macOnly] } }),
      ],
    });
    const added: ProjectAction = { id: "n", name: "Lint", command: "bun run lint" };
    changeProjectActionsEverywhere("pc", { kind: "add", action: added });
    expect(writers.updateProjectScripts.mock.calls).toEqual([
      ["pc", { actions: [shared, added] }],
      [MAC, { actions: [shared, macOnly, added] }],
    ]);

    writers.updateProjectScripts.mockReset();
    changeProjectActionsEverywhere("pc", { kind: "update", actionId: "a", patch: { name: "B" } });
    expect(writers.updateProjectScripts.mock.calls).toEqual([
      ["pc", { actions: [{ ...shared, name: "B" }] }],
      [MAC, { actions: [{ ...shared, name: "B" }, macOnly] }],
    ]);

    writers.updateProjectScripts.mockReset();
    changeProjectActionsEverywhere("pc", { kind: "remove", actionId: "a" });
    expect(writers.updateProjectScripts.mock.calls).toEqual([
      ["pc", { actions: [] }],
      [MAC, { actions: [macOnly] }],
    ]);
  });

  it("clears copy patterns without touching other script fields", () => {
    useAppStore.setState({
      projects: [{ ...local, scripts: { actions: [], worktreeCopyPatterns: [".env"] } }],
    });
    setWorktreeCopyPatternsEverywhere("pc", undefined);
    expect(writers.updateProjectScripts).toHaveBeenCalledWith("pc", { actions: [] });
  });

  it("fans out search settings and single plugin switches to linked rows", () => {
    updateProjectSearchSettingsEverywhere("pc", { useIgnoreFiles: false });
    expect(ids(writers.updateProjectSearchSettings)).toEqual(["pc", MAC]);
    setProjectPluginOverrideEverywhere("pc", "browser", true);
    expect(writers.setProjectPluginOverride.mock.calls).toEqual([
      ["pc", "browser", true],
      [MAC, "browser", true],
    ]);
  });

  it("reconciles a whole plugin override map row by row", () => {
    useAppStore.setState({
      projects: [
        { ...local, pluginOverrides: { y: false } },
        mirror("mac", { pluginOverrides: { x: true } }),
      ],
    });
    setProjectPluginOverridesEverywhere("pc", { y: false });
    expect(writers.setProjectPluginOverride.mock.calls).toEqual([
      ["pc", "y", false],
      [MAC, "x", null],
      [MAC, "y", false],
    ]);
  });

  it("still writes the edited row when its own machine is offline", () => {
    renameProjectEverywhere(MAC2, "Renamed");
    expect(ids(writers.renameProject)).toEqual(["pc", MAC, MAC2]);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("falls back to the one row for a project that is not grouped", () => {
    useAppStore.setState({ projects: [local] });
    useGitStore.setState({ statuses: {} });
    updateProjectSearchSettingsEverywhere("pc", undefined);
    expect(ids(writers.updateProjectSearchSettings)).toEqual(["pc"]);
    updateProjectSearchSettingsEverywhere("missing", undefined);
    expect(ids(writers.updateProjectSearchSettings)).toEqual(["pc"]);
  });

  it("renames only rows whose name differs", () => {
    renameProjectEverywhere(MAC, "Pora.code");
    expect(writers.renameProject).not.toHaveBeenCalled();
    renameProjectEverywhere(MAC, "Poracode");
    expect(ids(writers.renameProject)).toEqual(["pc", MAC]);
  });

  it("keeps a file icon on the environment it was picked on", () => {
    updateProjectIconEverywhere("pc", "file:public/logo.png");
    expect(writers.updateProjectIcon.mock.calls).toEqual([["pc", "file:public/logo.png"]]);

    writers.updateProjectIcon.mockReset();
    updateProjectIconEverywhere("pc", "lucide:rocket");
    expect(ids(writers.updateProjectIcon)).toEqual(["pc", MAC]);
  });
});
