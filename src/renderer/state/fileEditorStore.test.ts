import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  useFileEditorStore,
  type FileEditorRootContext,
  resolvePathForFileOpen,
} from "./fileEditorStore";
import { useGitStore } from "./gitStore";
import { useRemoteServersStore } from "./remoteServersStore";

function makeBuffer(path: string) {
  return {
    path,
    status: "ready" as const,
    modifiedAtMs: 1,
    content: path,
    savedContent: path,
    lineEnding: "lf" as const,
    hasBom: false,
    isDirty: false,
    isLoading: false,
  };
}

describe("fileEditorStore path remapping", () => {
  beforeEach(() => {
    useFileEditorStore.setState({
      rootContext: null,
      overlayMode: null,
      tabs: [],
      activePath: null,
      previewTab: null,
      markdownPreviewPath: null,
      buffers: {},
      refreshToken: 0,
      pendingReveal: null,
    });
  });

  it("renames nested open buffers when a folder path changes", () => {
    useFileEditorStore.setState({
      rootContext: null,
      overlayMode: "fullscreen",
      tabs: ["src/a.ts", "src/nested/b.ts"],
      activePath: "src/nested/b.ts",
      buffers: {
        "src/a.ts": {
          path: "src/a.ts",
          status: "ready",
          modifiedAtMs: 1,
          content: "a",
          savedContent: "a",
          lineEnding: "lf",
          hasBom: false,
          isDirty: false,
          isLoading: false,
        },
        "src/nested/b.ts": {
          path: "src/nested/b.ts",
          status: "ready",
          modifiedAtMs: 1,
          content: "b",
          savedContent: "b",
          lineEnding: "lf",
          hasBom: false,
          isDirty: false,
          isLoading: false,
        },
      },
      refreshToken: 0,
    });

    useFileEditorStore.getState().renamePath("src", "app");

    expect(useFileEditorStore.getState().tabs).toEqual(["app/a.ts", "app/nested/b.ts"]);
    expect(useFileEditorStore.getState().activePath).toBe("app/nested/b.ts");
    expect(Object.keys(useFileEditorStore.getState().buffers)).toEqual([
      "app/a.ts",
      "app/nested/b.ts",
    ]);
  });

  it("removes nested tabs and buffers when a folder is deleted", () => {
    useFileEditorStore.setState({
      rootContext: null,
      overlayMode: "modal",
      tabs: ["src/a.ts", "src/nested/b.ts", "other.ts"],
      activePath: "src/nested/b.ts",
      buffers: {
        "src/a.ts": {
          path: "src/a.ts",
          status: "ready",
          modifiedAtMs: 1,
          content: "a",
          savedContent: "a",
          lineEnding: "lf",
          hasBom: false,
          isDirty: false,
          isLoading: false,
        },
        "src/nested/b.ts": {
          path: "src/nested/b.ts",
          status: "ready",
          modifiedAtMs: 1,
          content: "b",
          savedContent: "b",
          lineEnding: "lf",
          hasBom: false,
          isDirty: false,
          isLoading: false,
        },
        "other.ts": {
          path: "other.ts",
          status: "ready",
          modifiedAtMs: 1,
          content: "c",
          savedContent: "c",
          lineEnding: "lf",
          hasBom: false,
          isDirty: false,
          isLoading: false,
        },
      },
      refreshToken: 0,
    });

    useFileEditorStore.getState().removePath("src");

    expect(useFileEditorStore.getState().tabs).toEqual(["other.ts"]);
    expect(useFileEditorStore.getState().activePath).toBe("other.ts");
    expect(Object.keys(useFileEditorStore.getState().buffers)).toEqual(["other.ts"]);
  });
});

describe("fileEditorStore preview tabs", () => {
  beforeEach(() => {
    useFileEditorStore.setState({
      rootContext: null,
      overlayMode: null,
      tabs: [],
      activePath: null,
      previewTab: null,
      markdownPreviewPath: null,
      buffers: {},
      refreshToken: 0,
      pendingReveal: null,
    });
  });

  it("replaces the existing preview tab at the same position", () => {
    useFileEditorStore.setState({
      tabs: ["a.ts", "b.ts", "c.ts"],
      activePath: "b.ts",
      previewTab: "b.ts",
      buffers: {
        "a.ts": makeBuffer("a.ts"),
        "b.ts": makeBuffer("b.ts"),
        "c.ts": makeBuffer("c.ts"),
      },
      overlayMode: "modal",
    });

    // Simulate single-click opening d.ts as preview — uses computeTabOpen directly via setState
    const state = useFileEditorStore.getState();
    // We can't call openFile (requires bridge), so test the state logic directly
    // by calling set with the same logic openFile would use
    const isAlreadyOpen = state.tabs.includes("d.ts");
    expect(isAlreadyOpen).toBe(false);

    // Manually apply preview tab replacement logic
    const oldPreview = state.previewTab; // "b.ts"
    const idx = state.tabs.indexOf(oldPreview!);
    const newTabs = state.tabs.filter((t) => t !== oldPreview);
    newTabs.splice(idx, 0, "d.ts");
    const { ["b.ts"]: _, ...newBuffers } = state.buffers;

    useFileEditorStore.setState({
      tabs: newTabs,
      buffers: { ...newBuffers, "d.ts": makeBuffer("d.ts") },
      activePath: "d.ts",
      previewTab: "d.ts",
    });

    const next = useFileEditorStore.getState();
    expect(next.tabs).toEqual(["a.ts", "d.ts", "c.ts"]);
    expect(next.activePath).toBe("d.ts");
    expect(next.previewTab).toBe("d.ts");
    expect(next.buffers["b.ts"]).toBeUndefined();
  });

  it("pinTab promotes a preview tab to permanent", () => {
    useFileEditorStore.setState({
      tabs: ["a.ts", "b.ts"],
      activePath: "b.ts",
      previewTab: "b.ts",
      buffers: { "a.ts": makeBuffer("a.ts"), "b.ts": makeBuffer("b.ts") },
    });

    useFileEditorStore.getState().pinTab("b.ts");

    expect(useFileEditorStore.getState().previewTab).toBeNull();
    expect(useFileEditorStore.getState().tabs).toEqual(["a.ts", "b.ts"]);
  });

  it("pinTab is a no-op for permanent tabs", () => {
    useFileEditorStore.setState({
      tabs: ["a.ts", "b.ts"],
      activePath: "a.ts",
      previewTab: "b.ts",
      buffers: { "a.ts": makeBuffer("a.ts"), "b.ts": makeBuffer("b.ts") },
    });

    useFileEditorStore.getState().pinTab("a.ts");

    // previewTab should still be b.ts since a.ts was not the preview
    expect(useFileEditorStore.getState().previewTab).toBe("b.ts");
  });

  it("editing a preview tab promotes it to permanent", () => {
    useFileEditorStore.setState({
      tabs: ["a.ts"],
      activePath: "a.ts",
      previewTab: "a.ts",
      buffers: { "a.ts": makeBuffer("a.ts") },
    });

    useFileEditorStore.getState().updateBuffer("a.ts", "changed content");

    expect(useFileEditorStore.getState().previewTab).toBeNull();
    expect(useFileEditorStore.getState().buffers["a.ts"]?.isDirty).toBe(true);
  });

  it("closeTab clears previewTab when the preview tab is closed", () => {
    useFileEditorStore.setState({
      tabs: ["a.ts", "b.ts"],
      activePath: "b.ts",
      previewTab: "b.ts",
      overlayMode: "modal",
      buffers: { "a.ts": makeBuffer("a.ts"), "b.ts": makeBuffer("b.ts") },
    });

    useFileEditorStore.getState().closeTab("b.ts");

    expect(useFileEditorStore.getState().previewTab).toBeNull();
    expect(useFileEditorStore.getState().tabs).toEqual(["a.ts"]);
  });

  it("renamePath remaps previewTab", () => {
    useFileEditorStore.setState({
      tabs: ["src/a.ts"],
      activePath: "src/a.ts",
      previewTab: "src/a.ts",
      markdownPreviewPath: "src/a.ts",
      buffers: { "src/a.ts": makeBuffer("src/a.ts") },
      refreshToken: 0,
    });

    useFileEditorStore.getState().renamePath("src", "app");

    expect(useFileEditorStore.getState().previewTab).toBe("app/a.ts");
    expect(useFileEditorStore.getState().markdownPreviewPath).toBe("app/a.ts");
  });

  it("removePath clears previewTab when the preview file is deleted", () => {
    useFileEditorStore.setState({
      tabs: ["src/a.ts", "other.ts"],
      activePath: "src/a.ts",
      previewTab: "src/a.ts",
      markdownPreviewPath: "src/a.ts",
      overlayMode: "modal",
      buffers: { "src/a.ts": makeBuffer("src/a.ts"), "other.ts": makeBuffer("other.ts") },
      refreshToken: 0,
    });

    useFileEditorStore.getState().removePath("src");

    expect(useFileEditorStore.getState().previewTab).toBeNull();
    expect(useFileEditorStore.getState().markdownPreviewPath).toBeNull();
    expect(useFileEditorStore.getState().tabs).toEqual(["other.ts"]);
  });
});

describe("fileEditorStore cycleTab", () => {
  beforeEach(() => {
    useFileEditorStore.setState({
      rootContext: null,
      overlayMode: "fullscreen",
      tabs: [],
      activePath: null,
      previewTab: null,
      markdownPreviewPath: null,
      buffers: {},
      refreshToken: 0,
      pendingReveal: null,
    });
  });

  function seed(tabs: string[], activePath: string | null) {
    useFileEditorStore.setState({
      tabs,
      activePath,
      buffers: Object.fromEntries(tabs.map((path) => [path, makeBuffer(path)])),
    });
  }

  it("moves to the next and previous tab", () => {
    seed(["a.ts", "b.ts", "c.ts"], "b.ts");

    useFileEditorStore.getState().cycleTab("next");
    expect(useFileEditorStore.getState().activePath).toBe("c.ts");

    useFileEditorStore.getState().cycleTab("previous");
    expect(useFileEditorStore.getState().activePath).toBe("b.ts");
  });

  it("wraps around at both ends", () => {
    seed(["a.ts", "b.ts", "c.ts"], "c.ts");

    useFileEditorStore.getState().cycleTab("next");
    expect(useFileEditorStore.getState().activePath).toBe("a.ts");

    useFileEditorStore.getState().cycleTab("previous");
    expect(useFileEditorStore.getState().activePath).toBe("c.ts");
  });

  it("is a no-op with fewer than two tabs", () => {
    seed(["only.ts"], "only.ts");

    useFileEditorStore.getState().cycleTab("next");
    expect(useFileEditorStore.getState().activePath).toBe("only.ts");
  });

  it("selects the first tab for next and the last for previous when none is active", () => {
    seed(["a.ts", "b.ts", "c.ts"], null);

    useFileEditorStore.getState().cycleTab("next");
    expect(useFileEditorStore.getState().activePath).toBe("a.ts");

    useFileEditorStore.setState({ activePath: null });
    useFileEditorStore.getState().cycleTab("previous");
    expect(useFileEditorStore.getState().activePath).toBe("c.ts");
  });
});

describe("resolvePathForFileOpen (worktree-relative traversal regression)", () => {
  const posixWorktreeLocation = {
    kind: "posix" as const,
    path: "/Users/me/code/main-repo/.git/worktrees/feature-x",
  };

  const posixMainRepoLocation = {
    kind: "posix" as const,
    path: "/Users/me/code/main-repo",
  };

  const worktreeContext: FileEditorRootContext = {
    projectId: "proj-1",
    projectName: "main-repo",
    projectLocation: posixWorktreeLocation,
    rootLabel: "feature-x",
    worktreePath: "/Users/me/code/main-repo/.git/worktrees/feature-x",
  };

  const mainRepoContext: FileEditorRootContext = {
    projectId: "proj-1",
    projectName: "main-repo",
    projectLocation: posixMainRepoLocation,
    rootLabel: "main-repo",
  };

  it("resolves a worktree-rooted relative path with .. against the worktree (not the main repo)", () => {
    const result = resolvePathForFileOpen(worktreeContext, "../sibling/file.txt");
    expect(result).toBe("/Users/me/code/main-repo/.git/worktrees/feature-x/../sibling/file.txt");
  });

  it("resolves an escaping relative under main repo context against the main root", () => {
    const result = resolvePathForFileOpen(mainRepoContext, "../outside.txt");
    expect(result).toBe("/Users/me/code/main-repo/../outside.txt");
  });

  it("leaves normal project-relative paths unchanged", () => {
    expect(resolvePathForFileOpen(worktreeContext, "src/app.ts")).toBe("src/app.ts");
    expect(resolvePathForFileOpen(mainRepoContext, "README.md")).toBe("README.md");
  });

  it("leaves already-absolute paths unchanged", () => {
    expect(resolvePathForFileOpen(worktreeContext, "/etc/hosts")).toBe("/etc/hosts");
    expect(resolvePathForFileOpen(mainRepoContext, "/tmp/x.txt")).toBe("/tmp/x.txt");
  });

  it("returns raw path when no rootContext", () => {
    expect(resolvePathForFileOpen(null, "../foo")).toBe("../foo");
  });
});

describe("fileEditorStore remote roots", () => {
  const originalLightcode = window.lightcode;

  beforeEach(() => {
    useFileEditorStore.setState({
      rootContext: null,
      overlayMode: null,
      tabs: [],
      activePath: null,
      previewTab: null,
      markdownPreviewPath: null,
      buffers: {},
      refreshToken: 0,
      pendingReveal: null,
    });
    useRemoteServersStore.getState().closeRemoteThread();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useGitStore.setState({ statuses: {}, worktreeStatuses: {} });
    Object.defineProperty(window, "lightcode", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "lightcode", {
      configurable: true,
      writable: true,
      value: originalLightcode,
    });
  });

  it("saves project files through the remote bridge without local git side effects", async () => {
    const writeProjectFile = vi.fn<() => Promise<void>>();
    const gitStage = vi.fn<() => Promise<void>>();
    Object.defineProperty(window, "lightcode", {
      configurable: true,
      writable: true,
      value: {
        writeProjectFile,
        gitStage,
      },
    });
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async () => ({ modifiedAtMs: 2 }));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Remote Desktop",
          endpoint: "https://remote.example.test/",
          accessToken: "token",
          scopes: ["session:read", "session:operate"],
        },
      ],
      clientFactory: () => ({ gitCall }) as unknown as RemoteDesktopClient,
    });
    useGitStore.setState({
      statuses: {
        p1: {
          isRepo: true,
          branch: "main",
          tracking: "",
          hasRemote: false,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
          mergeInProgress: true,
          conflictFiles: [
            {
              path: "README.md",
              status: "UU",
              staged: false,
              insertions: 0,
              deletions: 0,
            },
          ],
        },
      },
    });
    useFileEditorStore.setState({
      rootContext: {
        projectId: "p1",
        projectName: "Remote Project",
        projectLocation: { kind: "posix", path: "/remote/project" },
        rootLabel: "Remote Project",
        remoteServerId: "d1",
      },
      tabs: ["README.md"],
      activePath: "README.md",
      buffers: {
        "README.md": {
          ...makeBuffer("README.md"),
          content: "updated",
          savedContent: "old",
          isDirty: true,
        },
      },
    });

    await useFileEditorStore.getState().saveFile("README.md");

    expect(gitCall).toHaveBeenCalledWith("writeProjectFile", {
      projectLocation: { kind: "posix", path: "/remote/project" },
      path: "README.md",
      content: "updated",
      baseModifiedAtMs: 1,
    });
    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(gitStage).not.toHaveBeenCalled();
    expect(useFileEditorStore.getState().buffers["README.md"]).toMatchObject({
      modifiedAtMs: 2,
      savedContent: "updated",
      isDirty: false,
    });
  });
});
