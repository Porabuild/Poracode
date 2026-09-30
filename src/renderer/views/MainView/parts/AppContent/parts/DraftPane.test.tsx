import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { AppDndProvider } from "@/renderer/dnd";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { buildPaneLayoutFromLegacy } from "@/shared/paneLayout";
import type { AgentStatus, Project } from "@/shared/contracts";
import {
  PaneDropRegistryProbe,
  expectNoDisabledDraggableAncestor,
  queryDndActivatorArtifacts,
  settleDndAttributes,
} from "./paneDragTestUtils";
import { DraftPane } from "./DraftPane";

const { layoutState } = vi.hoisted(() => ({ layoutState: { compact: false } }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  isCompactLayoutViewport: () => layoutState.compact,
  useCompactLayout: () => layoutState.compact,
  initializeAdaptiveLayout: () => undefined,
  resetAdaptiveLayoutForTest: () => undefined,
}));

// The composer's internals are irrelevant here; the stub marks the composer
// node whose identity must survive pane-count transitions.
vi.mock("@/renderer/components/thread/ThreadDraftComposerArea", () => ({
  ThreadDraftComposerArea: () => <div data-draft-composer-stub="" />,
}));

const PANE_ID = "draft-pane-a11y";

const PROJECT: Project = {
  id: "project-1",
  name: "Draft Pane Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: new Date().toISOString(),
};

// Without a detectable agent the draft view renders its "no supported agents"
// empty state, which has no pane body or header at all.
const CODEX_STATUS: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "gpt-5.4", label: "5.4" }],
    efforts: ["low"],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [{ id: "on-request", label: "On Request" }],
    sandboxModes: [{ id: "read-only", label: "Read Only" }],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  },
};

function makeUi(paneCount: number, snapshotRef?: { current: () => string | null }) {
  return (
    <AppProvider>
      <AppDndProvider
        onSidebarSortEnd={() => undefined}
        onPaneDrop={() => undefined}
        onMainPanelDrop={() => undefined}
        onPanelDockDrop={() => undefined}
        paneLayout={buildPaneLayoutFromLegacy([PANE_ID])}
      >
        {snapshotRef ? <PaneDropRegistryProbe paneId={PANE_ID} snapshotRef={snapshotRef} /> : null}
        <DraftPane
          paneId={PANE_ID}
          projectId={PROJECT.id}
          paneCount={paneCount}
          paneAlign="center"
          onClose={() => undefined}
          onStart={() => undefined}
        />
      </AppDndProvider>
    </AppProvider>
  );
}

function getPaneElement(container: HTMLElement): HTMLElement {
  const pane = container.querySelector("[data-draft-body]")?.parentElement;
  expect(pane).not.toBeNull();
  return pane as HTMLElement;
}

describe("DraftPane drag registration accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    layoutState.compact = false;
    useAppStore.setState({ projects: [PROJECT] });
    useAgentStatusesStore.setState({ agentStatuses: [CODEX_STATUS], wslAgentStatuses: [] });
  });

  it("exposes a single-pane draft without drag-button semantics", async () => {
    const { container } = render(makeUi(1));
    await settleDndAttributes();
    const pane = getPaneElement(container);
    expect(queryDndActivatorArtifacts(pane)).toEqual([]);
    expectNoDisabledDraggableAncestor(pane);
    expect(container.querySelector("[data-poracode-thread-drag-handle]")).toBeNull();
    expect(pane.hasAttribute("role")).toBe(false);
    expect(pane.hasAttribute("aria-disabled")).toBe(false);
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
    expect(pane.hasAttribute("role")).toBe(false);
    expect(queryDndActivatorArtifacts(pane)).toEqual([handle]);
  });

  it("keeps the draft registered as a live drop target while single", async () => {
    const snapshotRef = { current: () => null as string | null };
    render(makeUi(1, snapshotRef));
    await settleDndAttributes();
    await waitFor(() => expect(snapshotRef.current()).toBe("attached"));
  });

  it("keeps draft content mounted across 1→2→1 while restoring clean semantics", async () => {
    const { container, rerender } = render(makeUi(1));
    await settleDndAttributes();
    const paneBefore = getPaneElement(container);
    const composerBefore = paneBefore.querySelector("[data-draft-composer-stub]");
    expect(composerBefore).not.toBeNull();

    rerender(makeUi(2));
    await waitFor(() => {
      expect(container.querySelector("[data-poracode-thread-drag-handle]")).not.toBeNull();
    });
    await settleDndAttributes();
    expect(getPaneElement(container)).toBe(paneBefore);
    expect(paneBefore.querySelector("[data-draft-composer-stub]")).toBe(composerBefore);

    rerender(makeUi(1));
    await settleDndAttributes();
    expect(getPaneElement(container)).toBe(paneBefore);
    expect(paneBefore.querySelector("[data-draft-composer-stub]")).toBe(composerBefore);
    expect(queryDndActivatorArtifacts(getPaneElement(container))).toEqual([]);
    expect(screen.getByText("New thread")).toBeInTheDocument();
  });
});
