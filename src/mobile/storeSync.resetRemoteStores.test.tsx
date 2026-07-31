import { describe, expect, it, vi } from "vitest";

// The Live Activity controller pulls in a native bridge; stub it so importing
// storeSync stays jsdom-safe. Everything else resetRemoteStores touches is
// plain renderer state.
vi.mock("./push/liveActivityController", () => ({
  notifyLiveActivityThreadState: vi.fn<() => Promise<void>>(async () => {}),
}));

import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitReviewActionStore } from "@/renderer/state/gitReviewActionStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useGitReadModelStore } from "@/renderer/state/gitReadModelStore";
import { emptyGitStateSnapshot } from "@/shared/gitState";
import { useNotesStore } from "@/renderer/state/notesStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { useDesktopPanelStore } from "./desktopPanelStore";
import { resetRemoteStores } from "./storeSync";

describe("resetRemoteStores", () => {
  it("clears every per-thread runtime map (guards against reset↔slice drift)", () => {
    const tid = "thread-1";
    useAppStore.setState({
      projects: [{ id: "p" } as never],
      threads: [{ id: tid } as never],
      // A representative of the maps reset already cleared…
      runtimeStructuralVersionByThread: { [tid]: 3 },
      // …plus the four it used to leak across desktop switches (stale "running"
      // badges + unbounded growth).
      runtimeOpenTurnByThread: { [tid]: true },
      fileCheckpointsByThread: { [tid]: {} },
      fileCheckpointTurnsByThread: { [tid]: {} },
      openSubAgentByThread: { [tid]: "parent" },
    });
    useProviderUsageStore.getState().setSnapshots([
      {
        providerId: "codex",
        status: "ok",
        windows: [],
        fetchedAt: 1,
      },
    ]);
    useNotesStore.setState({
      byProject: {
        p: {
          status: "ready",
          doc: { type: "doc" },
          todos: [],
        },
      },
    });
    useFileEditorStore.setState({
      rootContext: {
        projectId: "p",
        projectName: "Project",
        projectLocation: { kind: "posix", path: "/project" },
        rootLabel: "Project",
      },
      overlayMode: "modal",
      tabs: ["README.md"],
    });
    useProjectTreeStore.setState({
      rootKey: "p:",
      directoryEntries: { "": [] },
    });
    useGitStore.setState({
      statuses: { p: { isRepo: false } as never },
      prFiles: { "p#1": [] },
    });
    useGitReadModelStore.setState({ ...emptyGitStateSnapshot(), revision: 3 });
    useGitReviewActionStore.setState({
      panels: {
        p: {
          commitMessage: "old desktop",
        } as never,
      },
    });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "p",
      tabs: [
        {
          id: "shell:old",
          projectId: "p",
          title: "Old",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    useDesktopPanelStore.getState().show("files", tid);

    resetRemoteStores();

    const s = useAppStore.getState();
    expect(s.projects).toHaveLength(0);
    expect(s.threads).toHaveLength(0);
    expect(s.runtimeStructuralVersionByThread).toEqual({});
    expect(s.runtimeOpenTurnByThread).toEqual({});
    expect(s.fileCheckpointsByThread).toEqual({});
    expect(s.fileCheckpointTurnsByThread).toEqual({});
    expect(s.openSubAgentByThread).toEqual({});
    expect(useProviderUsageStore.getState().snapshots).toEqual({});
    expect(useNotesStore.getState().byProject).toEqual({});
    expect(useFileEditorStore.getState()).toMatchObject({
      rootContext: null,
      overlayMode: null,
      tabs: [],
      buffers: {},
    });
    expect(useProjectTreeStore.getState()).toMatchObject({
      rootKey: "",
      directoryEntries: {},
    });
    expect(useGitStore.getState()).toMatchObject({
      statuses: {},
      prFiles: {},
    });
    expect(useGitReadModelStore.getState().revision).toBe(0);
    expect(useGitReviewActionStore.getState().panels).toEqual({});
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: false,
      activeProjectId: null,
      tabs: [],
    });
    expect(useDesktopPanelStore.getState()).toMatchObject({
      open: false,
      threadId: null,
    });
  });
});
