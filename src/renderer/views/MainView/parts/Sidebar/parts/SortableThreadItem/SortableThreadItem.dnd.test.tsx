import { fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDragDropManager } from "@dnd-kit/react";
import { AppDndProvider } from "@/renderer/dnd";
import { buildPaneLayoutFromLegacy } from "@/shared/paneLayout";
import type { Experiment, Project, Thread } from "@/shared/contracts";
import { openThread } from "@/renderer/actions/threadActions";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
// jsdom polyfills (rAF, Web Animations, …) plus the dnd attribute settling
// helper shared with the pane drag suites.
import { settleDndAttributes } from "@/renderer/views/MainView/parts/AppContent/parts/paneDragTestUtils";
import { SortableThreadItem } from "./SortableThreadItem";

const layoutMock = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layoutMock.compact,
}));

vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: vi.fn<(threadId: string) => void>(),
  renameThread: vi.fn<(threadId: string, title: string) => void>(),
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useIsCurrentThread: () => false,
  useThreadHasBackgroundActivity: () => false,
  useThreadHasDraft: () => false,
}));

vi.mock("@/renderer/components/providers/statusTone", () => ({
  getStatusTone: () => "default",
}));

vi.mock("@/renderer/components/providers/ThreadProviderIcon", () => ({
  ThreadProviderIcon: (props: { className?: string }) => (
    <span className={props.className} data-testid="provider-icon" />
  ),
}));

vi.mock("@/renderer/views/MainView/parts/Sidebar/parts/ThreadContextMenu", () => ({
  ThreadContextMenu: (props: { children: React.ReactNode }) => <>{props.children}</>,
}));

vi.mock("./parts/ThreadItemSuffix", () => ({
  ThreadItemBottomSuffix: () => null,
  ThreadItemSuffix: () => null,
  ThreadItemTopSuffix: () => null,
}));

const PROJECT: Project = {
  id: "project-1",
  name: "Sidebar DnD Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-09-08T10:00:00.000Z",
};

const PANE_ID = "pane-sidebar-a11y";
const GROUP = "project-entries:project-1";
const EXPERIMENT_ID = "experiment-1";

function makeThread(threadId: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id: threadId,
    projectId: PROJECT.id,
    title: `Thread ${threadId}`,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
    ...overrides,
  };
}

function seedExperiment(): void {
  useExperimentStore.setState({
    experiments: {
      [EXPERIMENT_ID]: {
        id: EXPERIMENT_ID,
        projectId: PROJECT.id,
        title: "Sidebar experiment",
        status: "running",
        candidates: [],
        createdAt: "2026-09-08T10:00:00.000Z",
        updatedAt: "2026-09-08T10:00:00.000Z",
      } as unknown as Experiment,
    },
  });
}

type SortableSnapshot = {
  registered: boolean;
  hasElement: boolean;
  hasHandle: boolean;
  disabled: boolean;
  index: number;
  type: string;
  accept: string[];
};

/**
 * Reads the live sortable registration for `thread:<id>` from the real
 * manager registry, so tests assert registration behavior rather than DOM
 * guessing. dnd-kit registers entities in a microtask — settle first.
 */
function SortableRegistryProbe(props: {
  threadId: string;
  snapshotRef: { current: (() => SortableSnapshot) | null };
}) {
  const manager = useDragDropManager();
  const snapshotRef = props.snapshotRef;
  useEffect(() => {
    snapshotRef.current = () => {
      const id = `thread:${props.threadId}`;
      const draggable = Array.from(manager?.registry.draggables.value ?? []).find(
        (entry) => String(entry.id) === id,
      );
      const droppable = Array.from(manager?.registry.droppables.value ?? []).find(
        (entry) => String(entry.id) === id,
      );
      const draggableRecord = draggable as
        | {
            element?: Element;
            handle?: Element;
            disabled?: boolean;
            index?: number;
            type?: string;
          }
        | undefined;
      const accept = (droppable as { accept?: readonly string[] } | undefined)?.accept;
      return {
        registered: draggable != null,
        hasElement: draggableRecord?.element != null,
        hasHandle: draggableRecord?.handle != null,
        disabled: Boolean(draggableRecord?.disabled),
        index: Number(draggableRecord?.index ?? -1),
        type: String(draggableRecord?.type ?? ""),
        accept: accept == null ? [] : [...accept],
      };
    };
    return () => {
      snapshotRef.current = null;
    };
  });
  return null;
}

function makeUi(props: {
  thread: Thread;
  threadIndex?: number;
  sortDisabled?: boolean;
  editingThreadId?: string | null;
  snapshotRef?: { current: (() => SortableSnapshot) | null };
}) {
  return (
    <AppDndProvider
      onSidebarSortEnd={() => undefined}
      onPaneDrop={() => undefined}
      onMainPanelDrop={() => undefined}
      onPanelDockDrop={() => undefined}
      paneLayout={buildPaneLayoutFromLegacy([PANE_ID])}
    >
      {props.snapshotRef ? (
        <SortableRegistryProbe threadId={props.thread.id} snapshotRef={props.snapshotRef} />
      ) : null}
      <SortableThreadItem
        thread={props.thread}
        threadIndex={props.threadIndex ?? 0}
        project={PROJECT}
        showWorktreeBadge={false}
        editingThreadId={props.editingThreadId ?? null}
        setEditingThreadId={() => undefined}
        group={GROUP}
        {...(props.sortDisabled ? { sortDisabled: true } : {})}
      />
    </AppDndProvider>
  );
}

function getRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>(".poracode-sidebar-thread-row");
  if (!row) throw new Error("sidebar thread row not rendered");
  return row;
}

/** Branding only dnd-kit's accessibility plugin paints onto a drag activator. */
function expectRowNotDragBranded(row: HTMLElement): void {
  expect(row).not.toHaveAttribute("aria-disabled");
  expect(row).not.toHaveAttribute("aria-roledescription");
  const describedBy = row.getAttribute("aria-describedby");
  expect(describedBy === null || !describedBy.startsWith("dnd-kit")).toBe(true);
}

describe("SortableThreadItem drag registration accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    layoutMock.compact = false;
    useExperimentStore.setState({ experiments: {} });
  });

  it("keeps an experiment candidate row operable instead of branding it a disabled draggable", async () => {
    seedExperiment();
    const thread = makeThread("thread-candidate", { groupId: EXPERIMENT_ID });
    const { container } = render(makeUi({ thread }));
    await settleDndAttributes();

    const row = getRow(container);
    expectRowNotDragBranded(row);

    // The experiment owns the candidate's order, so the row must not drag —
    // but Enter still opens the thread and no drag may start.
    fireEvent.keyDown(row, { key: "Enter", code: "Enter" });
    await settleDndAttributes();
    expect(vi.mocked(openThread)).toHaveBeenCalledWith(thread.id);
    expect(document.documentElement.dataset.poracodeDragActive).toBeUndefined();
  });

  it("keeps normal rows registered as keyboard-draggable on desktop", async () => {
    const snapshotRef: { current: (() => SortableSnapshot) | null } = { current: null };
    const thread = makeThread("thread-normal");
    const { container } = render(makeUi({ thread, snapshotRef }));
    await settleDndAttributes();

    const row = getRow(container);
    // The row genuinely drags here, so the draggable affordance is correct.
    expect(row).toHaveAttribute("aria-roledescription", "draggable");
    expect(snapshotRef.current?.()).toMatchObject({
      registered: true,
      hasElement: true,
      hasHandle: true,
      disabled: false,
      type: "thread",
      accept: ["thread", "worktree-group"],
    });

    fireEvent.keyDown(row, { key: " ", code: "Space" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBe("true");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBeUndefined();
  });

  it("keeps automatic-sort rows draggable out of the sidebar while blocking reorder targets", async () => {
    const snapshotRef: { current: (() => SortableSnapshot) | null } = { current: null };
    const thread = makeThread("thread-sorted");
    const { container } = render(makeUi({ thread, sortDisabled: true, snapshotRef }));
    await settleDndAttributes();

    const row = getRow(container);
    expect(row).toHaveAttribute("aria-roledescription", "draggable");
    expect(snapshotRef.current?.()).toMatchObject({
      registered: true,
      hasElement: true,
      hasHandle: true,
      disabled: false,
      accept: [],
    });

    fireEvent.keyDown(row, { key: " ", code: "Space" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBe("true");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBeUndefined();
  });

  it("stops branding compact rows as draggables when no drag can start", async () => {
    layoutMock.compact = true;
    const snapshotRef: { current: (() => SortableSnapshot) | null } = { current: null };
    const thread = makeThread("thread-compact");
    const { container } = render(makeUi({ thread, snapshotRef }));
    await settleDndAttributes();

    const row = getRow(container);
    expectRowNotDragBranded(row);

    fireEvent.keyDown(row, { key: "Enter", code: "Enter" });
    await settleDndAttributes();
    expect(vi.mocked(openThread)).toHaveBeenCalledWith(thread.id);
    expect(document.documentElement.dataset.poracodeDragActive).toBeUndefined();
    // The row stays reachable and operable; only the drag affordance is gone.
    expect(row).toHaveAttribute("tabindex", "0");
    expect(snapshotRef.current?.()).toMatchObject({
      registered: true,
      hasElement: false,
      hasHandle: false,
    });
  });

  it("keeps a compact experiment candidate row operable with no drag branding", async () => {
    layoutMock.compact = true;
    seedExperiment();
    const thread = makeThread("thread-compact-candidate", { groupId: EXPERIMENT_ID });
    const { container } = render(makeUi({ thread }));
    await settleDndAttributes();

    const row = getRow(container);
    expectRowNotDragBranded(row);
    fireEvent.keyDown(row, { key: "Enter", code: "Enter" });
    expect(vi.mocked(openThread)).toHaveBeenCalledWith(thread.id);
  });

  it("gates rows independently: a candidate row stays clean next to a draggable neighbour", async () => {
    seedExperiment();
    const candidate = makeThread("thread-candidate", { groupId: EXPERIMENT_ID });
    const normal = makeThread("thread-normal");
    const { container } = render(
      <AppDndProvider
        onSidebarSortEnd={() => undefined}
        onPaneDrop={() => undefined}
        onMainPanelDrop={() => undefined}
        onPanelDockDrop={() => undefined}
        paneLayout={buildPaneLayoutFromLegacy([PANE_ID])}
      >
        <SortableThreadItem
          thread={candidate}
          threadIndex={0}
          project={PROJECT}
          showWorktreeBadge={false}
          editingThreadId={null}
          setEditingThreadId={() => undefined}
          group={GROUP}
        />
        <SortableThreadItem
          thread={normal}
          threadIndex={1}
          project={PROJECT}
          showWorktreeBadge={false}
          editingThreadId={null}
          setEditingThreadId={() => undefined}
          group={GROUP}
        />
      </AppDndProvider>,
    );
    await settleDndAttributes();

    const rows = container.querySelectorAll<HTMLElement>(".poracode-sidebar-thread-row");
    expect(rows).toHaveLength(2);
    expectRowNotDragBranded(rows[0]!);

    expect(rows[1]).toHaveAttribute("aria-roledescription", "draggable");
    fireEvent.keyDown(rows[1]!, { key: " ", code: "Space" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBe("true");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBeUndefined();
  });

  // A mounted candidate row only ever transitions the other way: experiments
  // are decided/removed while the row stays mounted, and the same node must
  // re-arm as an ordinary draggable row without losing rename/focus state.
  // (The reverse transition has no production trigger — see the lane report:
  // splash-gated hydration, batched creation, no remote experiment wire.)
  it("re-arms dragging when an experiment decision frees its candidate rows", async () => {
    seedExperiment();
    const thread = makeThread("thread-candidate", { groupId: EXPERIMENT_ID });
    const view = render(makeUi({ thread }));
    await settleDndAttributes();
    const rowBefore = getRow(view.container);
    expectRowNotDragBranded(rowBefore);

    // The experiment is decided/removed: the same row becomes draggable again.
    useExperimentStore.setState({ experiments: {} });
    view.rerender(makeUi({ thread }));
    await settleDndAttributes();

    expect(getRow(view.container)).toBe(rowBefore);
    expect(getRow(view.container)).toHaveAttribute("aria-roledescription", "draggable");
    fireEvent.keyDown(getRow(view.container), { key: " ", code: "Space" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBe("true");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await settleDndAttributes();
    expect(document.documentElement.dataset.poracodeDragActive).toBeUndefined();
  });

  it("preserves an in-progress rename across an experiment decision flip", async () => {
    seedExperiment();
    const thread = makeThread("thread-rename", { groupId: EXPERIMENT_ID });
    const view = render(makeUi({ thread, editingThreadId: thread.id }));
    await settleDndAttributes();
    const rowBefore = getRow(view.container);
    const inputBefore = screen.getByRole("textbox", { name: "Rename thread" });
    expect(document.activeElement).toBe(inputBefore);
    expectRowNotDragBranded(rowBefore);

    useExperimentStore.setState({ experiments: {} });
    view.rerender(makeUi({ thread, editingThreadId: thread.id }));
    await settleDndAttributes();

    // The flip only re-arms dragging: the row and the focused rename editor
    // keep their nodes, so focus and typed value survive the mode change.
    expect(getRow(view.container)).toBe(rowBefore);
    expect(screen.getByRole("textbox", { name: "Rename thread" })).toBe(inputBefore);
    expect(document.activeElement).toBe(inputBefore);
    expect(getRow(view.container)).toHaveAttribute("aria-roledescription", "draggable");
  });

  it("keeps the rename editor working across a compact mode flip", async () => {
    const thread = makeThread("thread-flip");
    const view = render(makeUi({ thread, editingThreadId: thread.id }));
    await settleDndAttributes();

    layoutMock.compact = true;
    view.rerender(makeUi({ thread, editingThreadId: thread.id }));
    await settleDndAttributes();

    // Crossing the compact boundary swaps the DnD provider, which remounts
    // the tree; the rename editor must come back focused, and the fresh
    // compact row must carry no drag branding.
    const input = screen.getByRole("textbox", { name: "Rename thread" });
    expect(input).toHaveValue("Thread thread-flip");
    expect(document.activeElement).toBe(input);
    expectRowNotDragBranded(getRow(view.container));
  });
});
