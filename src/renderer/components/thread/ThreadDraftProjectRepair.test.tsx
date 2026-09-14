import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { parseDraftProjectId } from "@/shared/paneId";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { applyProjectStateSnapshot } from "@/renderer/state/projectStateSync";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    platform: "win32",
    windowKind: "main",
    scanSkills: vi.fn<NonNullable<PoracodeBridge["scanSkills"]>>(),
    onSupervisorEvent: vi.fn<PoracodeBridge["onSupervisorEvent"]>(() => () => {}),
  },
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isQuickComposerWindow: () => false,
  isRemoteSession: () => false,
}));
vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: {
    inputContent?: ReactNode;
    onAttachFiles: (paths: string[]) => void;
    onSubmit: () => void;
  }) => (
    <div>
      {props.inputContent}
      <button type="button" onClick={() => props.onAttachFiles(["C:\\draft-note.txt"])}>
        Attach
      </button>
      <button type="button" onClick={props.onSubmit}>
        Send
      </button>
    </div>
  ),
}));

import { ThreadDraftComposerArea, type DraftStartInput } from "./ThreadDraftComposerArea";

const canonical: Project = {
  id: "canonical",
  name: "Repo",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-09-12T00:00:00.000Z",
};
const duplicate: Project = { ...canonical, id: "duplicate" };
const agent: AgentStatus = {
  kind: "test-agent",
  label: "Agent",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "test-model", label: "Model" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
  },
};

function Drafts({ onStart }: { onStart: (input: DraftStartInput) => void }) {
  const view = useAppStore((state) => state.view);
  const projects = useAppStore((state) => state.projects);
  const panes =
    view.kind === "thread" ? view.panes : view.kind === "draft" ? [`draft:${view.projectId}`] : [];
  return panes.map((paneId) => {
    const project = projects.find((item) => item.id === parseDraftProjectId(paneId));
    if (!project) return null;
    return (
      <div key={paneId} data-testid={paneId}>
        <ThreadDraftComposerArea
          project={project}
          paneId={paneId}
          selectedAgent={agent}
          controls={[]}
          config={{ model: "test-model" }}
          compact={false}
          paneCount={panes.length}
          gitBranch={undefined}
          worktreeMode={false}
          supportsModePicker={false}
          presentationMode="gui"
          onConfigChange={() => {}}
          onWorktreeModeChange={() => {}}
          onSwitchBranch={() => {}}
          onRememberPresentationMode={() => {}}
          onStart={onStart}
        />
      </div>
    );
  });
}

beforeEach(() => {
  bridge.scanSkills.mockResolvedValue({
    skills: [],
    effectiveSkillIds: [],
    invocation: null,
    issues: [],
    canLinkToGlobal: true,
  });
  useAppStore.setState({
    projects: [canonical, duplicate],
    threads: [],
    draftContents: {},
    pendingComposerSeeds: {},
    pendingDraftWorktreeSelections: {},
    draftContentDiscardRequests: {},
  });
});
afterEach(cleanup);

describe("draft project repair", () => {
  it("delivers both pending insertions when duplicate IDs merge before the editor mounts", () => {
    useAppStore.setState({
      view: { kind: "draft", projectId: duplicate.id },
      pendingComposerSeeds: {
        canonical: { text: "First queued note", nonce: 1 },
        duplicate: { text: "Second queued note", nonce: 1 },
      },
    });
    applyProjectStateSnapshot([canonical]);
    render(<Drafts onStart={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveTextContent("First queued note");
    expect(screen.getByRole("textbox")).toHaveTextContent("Second queued note");
    expect(useAppStore.getState().pendingComposerSeeds).toEqual({});
  });

  it.each([false, true])(
    "preserves typed rich content and attachments across a canonical-only snapshot (split=%s)",
    (split) => {
      useAppStore.setState({
        view: split
          ? { kind: "thread", panes: ["draft:canonical#first", "draft:duplicate#second"] }
          : { kind: "draft", projectId: duplicate.id },
      });
      const onStart = vi.fn<(input: DraftStartInput) => void>();
      render(<Drafts onStart={onStart} />);
      const editors = screen.getAllByRole("textbox");
      act(() => {
        if (split) {
          editors[0]!.textContent = "Canonical draft";
          fireEvent.input(editors[0]!);
        }
        const editor = editors.at(-1)!;
        editor.innerHTML =
          '<span data-mention-path="C:\\src\\main.ts">main.ts</span> unsent duplicate draft';
        fireEvent.input(editor);
        fireEvent.click(screen.getAllByRole("button", { name: "Attach" }).at(-1)!);
      });

      act(() => applyProjectStateSnapshot([canonical]));
      const repairedPane = screen.getByTestId(split ? "draft:canonical#second" : "draft:canonical");
      expect(within(repairedPane).getByRole("textbox")).toHaveTextContent("unsent duplicate draft");
      for (const editor of screen.getAllByRole("textbox")) {
        expect(editor.textContent?.includes("Canonical draft")).toBe(split);
        expect(editor).toHaveTextContent("unsent duplicate draft");
      }
      expect(useAppStore.getState().draftContents.duplicate).toBeUndefined();
      const content = within(repairedPane).getByRole("textbox").textContent;
      act(() => applyProjectStateSnapshot([canonical, duplicate]));
      expect(within(repairedPane).getByRole("textbox").textContent).toBe(content);
      act(() => {
        fireEvent.click(within(repairedPane).getByRole("button", { name: "Send" }));
      });
      expect(onStart).toHaveBeenCalledOnce();
      expect(onStart.mock.calls[0]![0].segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "attachment", path: "C:\\draft-note.txt" }),
          { kind: "file", path: "C:\\src\\main.ts" },
          { kind: "text", content: " unsent duplicate draft" },
        ]),
      );
    },
  );
});
