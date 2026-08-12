import { act, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { i18n } from "@/renderer/i18n/i18n";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { ProjectAuxiliaryPanel } from "./ProjectAuxiliaryPanel";

vi.mock("@/renderer/analytics/useProductViewTracking", () => ({
  productSurfaceView: vi.fn<(tab: string, mode: string) => string>(() => "git"),
  useProductViewTracking: vi.fn<() => void>(),
}));

vi.mock("@/renderer/state/gitRefresh", () => ({
  prefetchVisibleGitPanelPrData: vi.fn<(projectId: string, worktreePath?: string) => Promise<void>>(
    () => Promise.resolve(),
  ),
}));

const unifiedRightPanelProps = vi.hoisted(() => ({
  current: null as { activeTab: string } | null,
}));

vi.mock("@/renderer/components/layout/UnifiedRightPanel", () => ({
  UnifiedRightPanel: (props: { activeTab: string }) => {
    unifiedRightPanelProps.current = props;
    return null;
  },
}));

function makeThread(id: string, projectId: string, worktreePath: string): Thread {
  const now = "2026-08-03T00:00:00.000Z";
  return {
    id,
    projectId,
    worktreePath,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };
}

const threadA = makeThread("thread-a", "project-a", "/worktree-a");
const threadB = makeThread("thread-b", "project-b", "/worktree-b");
const threadC = makeThread("thread-c", "project-c", "/worktree-c");

function focusThread(threadId: string): void {
  useAppStore.setState({
    threads: [threadA, threadB, threadC],
    view: { kind: "thread", panes: [threadId] },
    focusedPaneId: threadId,
  });
}

describe("ProjectAuxiliaryPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    unifiedRightPanelProps.current = null;
    focusThread(threadA.id);
    usePanelStore.setState({
      gitReviewContext: {
        projectId: threadB.projectId,
        worktreePath: threadB.worktreePath!,
        originComposerId: threadB.id,
      },
      gitReviewAsPanel: true,
      rightPanelFollowsThread: true,
      rightPanelTab: "git",
      filesPanelContext: null,
      browserPanelOpen: false,
      usagePanelOpen: false,
      notesPanelOpen: false,
    });
  });

  afterEach(() => {
    resetClientRuntimeForTest();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
  });

  it("preserves a git badge target when the locked panel opens", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(usePanelStore.getState().gitReviewContext).toEqual({
        projectId: threadB.projectId,
        worktreePath: threadB.worktreePath!,
        originComposerId: threadB.id,
      });
    });

    act(() => focusThread(threadC.id));

    await waitFor(() => {
      expect(usePanelStore.getState().gitReviewContext).toEqual({
        projectId: threadC.projectId,
        worktreePath: threadC.worktreePath!,
      });
    });
  });

  it("leaves the browser tab when the browser panel was dismissed with it selected", async () => {
    // Closing the last browser tab clears browserPanelOpen over IPC but leaves
    // rightPanelTab on "browser"; the panel must fall back to an open panel
    // instead of rendering an empty browser layer.
    usePanelStore.setState({ rightPanelTab: "browser", browserPanelOpen: false });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("git");
    });
  });

  it("keeps the browser tab active while the browser panel is open", async () => {
    usePanelStore.setState({ rightPanelTab: "browser", browserPanelOpen: true });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("browser");
    });
  });

  it("keeps the restored Ports tab active with the terminal docked at the bottom", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "http://192.168.1.10:3200",
          accessToken: "token",
          scopes: ["ports:forward"],
        },
      ],
      runtime: {
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
    });
    usePanelStore.setState({ rightPanelTab: "ports", portsPanelOpen: true });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal={false} visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("ports");
    });
  });
});
