import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import { AppProvider } from "@/renderer/components/ui/provider";
import { AppDndProvider } from "@/renderer/dnd";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { buildPaneLayoutFromLegacy } from "@/shared/paneLayout";
import type { Project, Thread } from "@/shared/contracts";
import {
  PaneDropRegistryProbe,
  expectNoDisabledDraggableAncestor,
  queryDndActivatorArtifacts,
  settleDndAttributes,
} from "./paneDragTestUtils";
import { ThreadPane } from "./ThreadPane";

const { bridge, captureFileCheckpoint, runtimeActions, layoutState } = vi.hoisted(() => ({
  bridge: {
    startThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    interruptThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    clearPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    searchProjectFiles: vi
      .fn<() => Promise<{ entries: unknown[]; totalIndexed: number }>>()
      .mockResolvedValue({ entries: [], totalIndexed: 0 }),
    dbGetThreadRuntimeItems: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    dbGetThreadCompletedTurns: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    dbGetThreadContextUsage: vi.fn<() => Promise<unknown | null>>().mockResolvedValue(null),
    getProviderUsage: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    setRendererEventInterests: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
  captureFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  runtimeActions: {
    changeThreadConfig: vi.fn<() => void>(),
    resolveThreadServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    submitThreadInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
  layoutState: { compact: false },
}));

vi.mock("@/renderer/actions/threadRuntimeActions", () => ({
  changeThreadConfig: runtimeActions.changeThreadConfig,
  resolveThreadServerRequest: runtimeActions.resolveThreadServerRequest,
  submitThreadInput: runtimeActions.submitThreadInput,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isCompactClientSurface: () => layoutState.compact,
  isDevApp: () => false,
}));

vi.mock("@/renderer/actions/fileCheckpointActions", () => ({
  captureFileCheckpoint,
  hydrateFileCheckpoints: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  finalizeFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/renderer/components/thread/TerminalPane", () => ({
  TerminalPane: (props: { onTerminalResize?: (size: { cols: number; rows: number }) => void }) => (
    <div>
      terminal pane
      <button onClick={() => props.onTerminalResize?.({ cols: 120, rows: 40 })} type="button">
        report terminal size
      </button>
    </div>
  ),
}));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layoutState.compact,
}));

const THREAD: Thread = {
  id: "thread-pane-a11y",
  projectId: "project-1",
  title: "Pane accessibility",
  agentKind: "codex",
  config: { model: "gpt-5.4" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const PROJECT: Project = {
  id: "project-1",
  name: "Pane Accessibility Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: new Date().toISOString(),
};

function getPaneElement(container: HTMLElement): HTMLElement {
  const pane = container.querySelector("[data-poracode-thread-pane]");
  expect(pane).not.toBeNull();
  return pane as HTMLElement;
}

function makeUi(paneCount: number, snapshotRef?: { current: () => string | null }) {
  return (
    <AppProvider>
      <AppDndProvider
        onSidebarSortEnd={() => undefined}
        onPaneDrop={() => undefined}
        onMainPanelDrop={() => undefined}
        onPanelDockDrop={() => undefined}
        paneLayout={buildPaneLayoutFromLegacy([THREAD.id])}
      >
        {snapshotRef ? (
          <PaneDropRegistryProbe paneId={THREAD.id} snapshotRef={snapshotRef} />
        ) : null}
        <ThreadPane
          threadId={THREAD.id}
          paneCount={paneCount}
          paneAlign="center"
          onClose={() => undefined}
        />
      </AppDndProvider>
    </AppProvider>
  );
}

describe("ThreadPane drag registration accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    layoutState.compact = false;
    useSharedSettings.setState({
      agentSettings: {},
      collapseTerminalComposer: false,
      threadDocksPlacement: "composer",
    });
    useThreadTodoDockStore.setState({ defaultCollapsed: false, byThreadId: {} });
    useAppStore.setState({
      threads: [THREAD],
      projects: [PROJECT],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      provisioningWorktreeThreadIds: {},
      connectingThreadIds: {},
    });
  });

  it("exposes a single-pane thread without drag-button semantics", async () => {
    const { container } = render(makeUi(1));
    await settleDndAttributes();
    const pane = getPaneElement(container);
    expect(queryDndActivatorArtifacts(pane)).toEqual([]);
    expectNoDisabledDraggableAncestor(pane);
    expect(container.querySelector("[data-poracode-thread-drag-handle]")).toBeNull();
    expect(pane.hasAttribute("role")).toBe(false);
    expect(pane.hasAttribute("aria-disabled")).toBe(false);
  });

  it("exposes clean semantics in compact layout where pane dragging is unavailable", async () => {
    layoutState.compact = true;
    const { container } = render(makeUi(1));
    await settleDndAttributes();
    const pane = getPaneElement(container);
    expect(queryDndActivatorArtifacts(pane)).toEqual([]);
    expectNoDisabledDraggableAncestor(pane);
    expect(container.querySelector("[data-poracode-thread-drag-handle]")).toBeNull();
  });

  it("activates multi-pane dragging on the dedicated header handle", async () => {
    const { container } = render(makeUi(2));
    await waitFor(() => {
      expect(container.querySelector("[data-poracode-thread-drag-handle]")).not.toBeNull();
    });
    await settleDndAttributes();
    const pane = getPaneElement(container);
    const handle = pane.querySelector("[data-poracode-thread-drag-handle]")!;
    expect(handle).toHaveAttribute("role", "button");
    expect(handle).toHaveAttribute("aria-roledescription", "draggable");
    expect(handle).toHaveAttribute("aria-disabled", "false");
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle.getAttribute("aria-describedby")).toMatch(/^dnd-kit-description/);
    // The pane itself must never become the activator, and nothing else inside
    // the pane may pick up activator branding (composer included).
    expect(pane.hasAttribute("role")).toBe(false);
    expect(pane.hasAttribute("aria-disabled")).toBe(false);
    expect(pane.hasAttribute("aria-roledescription")).toBe(false);
    expect(queryDndActivatorArtifacts(pane)).toEqual([handle]);
  });

  it("starts and cancels a keyboard pane drag from the handle", async () => {
    const { container } = render(makeUi(2));
    const handle = await waitFor(() => {
      const element = container.querySelector("[data-poracode-thread-drag-handle]");
      expect(element).not.toBeNull();
      return element!;
    });
    await settleDndAttributes();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBe("true");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBeUndefined();
  });

  it("keeps the pane registered as a live drop target while single", async () => {
    const snapshotRef = { current: () => null as string | null };
    render(makeUi(1, snapshotRef));
    await settleDndAttributes();
    await waitFor(() => expect(snapshotRef.current()).toBe("attached"));
  });

  it("keeps pane content mounted across 1→2→1 while restoring clean semantics", async () => {
    const snapshotRef = { current: () => null as string | null };
    const ui = (count: number) => makeUi(count, snapshotRef);
    const { container, rerender } = render(ui(1));
    await settleDndAttributes();
    const paneBefore = getPaneElement(container);
    const titleBefore = paneBefore.querySelector(".poracode-thread-pane-title");
    const terminalBefore = screen.getByText("terminal pane");

    rerender(ui(2));
    await waitFor(() => {
      expect(container.querySelector("[data-poracode-thread-drag-handle]")).not.toBeNull();
    });
    await settleDndAttributes();
    // No pane or content remount on split: composer, transcript, and scroll
    // state live in these nodes.
    expect(getPaneElement(container)).toBe(paneBefore);
    expect(paneBefore.querySelector(".poracode-thread-pane-title")).toBe(titleBefore);
    expect(screen.getByText("terminal pane")).toBe(terminalBefore);
    expect(snapshotRef.current()).toBe("attached");

    rerender(ui(1));
    await settleDndAttributes();
    expect(getPaneElement(container)).toBe(paneBefore);
    expect(paneBefore.querySelector(".poracode-thread-pane-title")).toBe(titleBefore);
    expect(screen.getByText("terminal pane")).toBe(terminalBefore);
    expect(queryDndActivatorArtifacts(getPaneElement(container))).toEqual([]);
    expectNoDisabledDraggableAncestor(getPaneElement(container));
    await waitFor(() => expect(snapshotRef.current()).toBe("attached"));
  });
});
