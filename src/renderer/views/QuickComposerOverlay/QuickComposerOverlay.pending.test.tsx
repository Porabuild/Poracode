import type { ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    platform: "win32",
    windowKind: "quickComposer",
    getAgentStatuses:
      vi.fn<() => Promise<{ windows: AgentStatus[]; wsl: AgentStatus[]; fromCache: boolean }>>(),
    scanSkills: vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ skills: [], effectiveSkillIds: [] }),
    onSupervisorEvent: vi.fn<() => () => void>(() => () => {}),
    onQuickComposerShown: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    onQuickComposerDismissRequested: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    submitQuickComposer: vi.fn<(submission: unknown) => Promise<void>>(),
    dismissQuickComposer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    focusWindow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    pickFiles: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    pickQuickComposerFiles: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    dbGetProjects: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    dbGetThreads: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    dbGetState: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isQuickComposerWindow: () => true,
  isRemoteSession: () => false,
}));
vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock("@/renderer/components/thread/ThreadComposer", () => ({
  ThreadComposer: (props: {
    inputContent: ReactNode;
    submitPending: boolean;
    submitDisabled: boolean;
    onSubmit(): void;
  }) => (
    <div>
      {props.inputContent}
      <output data-testid="submit-pending">{String(props.submitPending)}</output>
      <button type="button" disabled={props.submitDisabled} onClick={props.onSubmit}>
        Submit fixture
      </button>
    </div>
  ),
}));

// Keep the real composer, editor, draft checkpoints and isSubmitting behavior.
// Only the surrounding model/project controls are reduced to test fixtures.
vi.mock("@/renderer/components/thread/ThreadDraftView", async () => {
  const { ThreadDraftComposerArea } =
    await import("@/renderer/components/thread/ThreadDraftComposerArea");
  return {
    ThreadDraftView: (props: {
      project: Project;
      agentStatuses: AgentStatus[];
      onStart(input: DraftStartInput): Promise<void>;
      onProjectChange(id: string): void;
    }) => (
      <>
        <button
          type="button"
          aria-label="Project fixture"
          onClick={() => props.onProjectChange("other")}
        >
          Project
        </button>
        <button type="button" aria-label="Model fixture">
          Model
        </button>
        <ThreadDraftComposerArea
          project={props.project}
          selectedAgent={props.agentStatuses[0]!}
          controls={[]}
          config={{ model: "fixture-model" }}
          compact={false}
          paneCount={1}
          gitBranch={undefined}
          worktreeMode={false}
          supportsModePicker={false}
          presentationMode="gui"
          onConfigChange={() => {}}
          onWorktreeModeChange={() => {}}
          onSwitchBranch={() => {}}
          onRememberPresentationMode={() => {}}
          onStart={props.onStart}
        />
      </>
    ),
  };
});

import "@/renderer/components/providers/bootstrap";
import { QuickComposerOverlay } from "./QuickComposerOverlay";

const project: Project = {
  id: "pending-project",
  name: "Pending",
  location: { kind: "windows", path: "C:\\pending" },
  createdAt: "2026-09-13T00:00:00.000Z",
};
const status: AgentStatus = {
  kind: "codex",
  label: "Fixture",
  installed: true,
  authState: "authenticated",
  capabilities: {
    settingDefs: [],
    models: [{ id: "fixture-model", label: "Fixture" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    presentationModes: ["gui"],
  },
};

describe("quick composer pending intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getAgentStatuses.mockResolvedValue({ windows: [status], wsl: [], fromCache: true });
    useAgentStatusesStore.getState().hydrateFromCache({ windows: [status], wsl: [] });
    useAppStore.setState({
      projects: [project],
      threads: [],
      view: { kind: "draft", projectId: project.id },
      draftContents: {},
    });
  });

  it.each([
    ["success", false],
    ["failure", false],
    ["success", true],
    ["failure", true],
  ] as const)(
    "preserves the submitted form across reopen until %s settles (external replacement: %s)",
    async (outcome, externalReplacement) => {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      bridge.submitQuickComposer.mockReturnValueOnce(
        new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
      );
      const { container } = render(<QuickComposerOverlay />);
      const editor = container.querySelector<HTMLElement>('[contenteditable="true"]')!;
      expect(editor).not.toBeNull();
      act(() => {
        editor.textContent = "Preserve this submitted intent";
        fireEvent.input(editor);
      });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Submit fixture" })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: "Submit fixture" }));
      await waitFor(() => expect(bridge.submitQuickComposer).toHaveBeenCalledOnce());
      act(() => {
        bridge.onQuickComposerShown.mock.calls[0]![0]();
      });
      await waitFor(() => expect(bridge.getAgentStatuses).toHaveBeenCalledTimes(2));
      if (externalReplacement) {
        await act(async () => {
          const other = { ...project, id: "other", name: "Other" };
          useAppStore.setState({
            projects: [project, other],
            view: { kind: "draft", projectId: other.id },
          });
          useAppStore.getState().saveDraftContent(other.id, {
            segments: [{ kind: "text", content: "A separately saved newer draft" }],
            attachments: [],
          });
          useAgentStatusesStore.getState().hydrateFromCache({ windows: [], wsl: [] });
        });
      }
      expect(container.querySelector('[contenteditable="true"]')).toBe(editor);
      expect(screen.getByTestId("submit-pending")).toHaveTextContent("true");
      expect(editor.closest("[inert]")).not.toBeNull();
      expect(
        container.querySelector('[aria-label="Project fixture"]')?.closest("[inert]"),
      ).not.toBeNull();
      expect(
        container.querySelector('[aria-label="Model fixture"]')?.closest("[inert]"),
      ).not.toBeNull();

      act(() => {
        useAgentStatusesStore.getState().hydrateFromCache({ windows: [status], wsl: [] });
      });

      await act(async () => {
        if (outcome === "success") resolve();
        else reject(new Error("Fixture native handoff refused"));
      });
      await waitFor(() => expect(screen.getByTestId("submit-pending")).toHaveTextContent("false"));
      expect(container.querySelector("[inert]")).toBeNull();
      expect(bridge.dismissQuickComposer).not.toHaveBeenCalled();
      const current = container.querySelector<HTMLElement>('[contenteditable="true"]')!;
      expect(current === editor).toBe(outcome === "failure" && !externalReplacement);
      expect(current.textContent?.includes("Preserve this submitted intent")).toBe(
        outcome === "failure" && !externalReplacement,
      );
      expect(current.textContent?.includes("A separately saved newer draft")).toBe(
        externalReplacement,
      );
      const saved = useAppStore.getState().draftContents[project.id]?.segments ?? [];
      expect(
        saved.some(
          (segment) =>
            segment.kind === "text" && segment.content === "Preserve this submitted intent",
        ),
      ).toBe(outcome === "failure");
      act(() => {
        current.textContent = "A newer editable intent";
        fireEvent.input(current);
      });
      await new Promise((done) => setTimeout(done, 250));
      expect(current.textContent).toBe("A newer editable intent");
      expect(bridge.dismissQuickComposer).not.toHaveBeenCalled();
    },
  );
});
