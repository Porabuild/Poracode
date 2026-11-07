import {
  TurnClientContextSource,
  type TurnClientContextCapture,
} from "@/renderer/components/composer/turnClientContext";
import * as draftSubmission from "@/renderer/actions/clientDraftSubmission";
import "@/renderer/testUtils/clientDraftDatabase";
import "@/renderer/components/providers/bootstrap";
import type { ReactNode, ComponentProps } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";
import { listClientSubmissions } from "@/renderer/state/composerDrafts/clientDraftDatabase";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import type { AgentStatus, Project } from "@/shared/contracts";
import { ThreadDraftComposerArea } from "./ThreadDraftComposerArea";

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
  isQuickComposerWindow: () => false,
  readBridge: () => ({
    scanSkills: async () => ({ skills: [], effectiveSkillIds: [], issues: [] }),
  }),
}));
vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: {
    inputContent: ReactNode;
    onSubmit(): void;
    submitDisabled: boolean;
  }) => (
    <div>
      {props.inputContent}
      <button type="button" disabled={props.submitDisabled} onClick={props.onSubmit}>
        Send fixture
      </button>
    </div>
  ),
}));
const project: Project = {
  id: "checkpoint",
  name: "Project",
  location: { kind: "posix", path: "/project" },
  createdAt: "2026-11-01",
};
const agent: AgentStatus = {
  kind: "codex",
  label: "Agent",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "test", label: "Test" }],
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
    settingDefs: [],
  },
};
const draft = {
  segments: [{ kind: "text" as const, content: "Preserve this prompt" }],
  attachments: [
    { id: "file", name: "notes.txt", path: "/notes.txt", isImage: false, mimeType: "text/plain" },
  ],
};
function form(
  onStart: ComponentProps<typeof ThreadDraftComposerArea>["onStart"] = vi.fn<() => Promise<void>>(),
  capture?: TurnClientContextCapture,
) {
  return render(
    <TurnClientContextSource value={capture}>
      <ThreadDraftComposerArea
        project={project}
        selectedAgent={agent}
        config={{ model: "test" }}
        controls={[]}
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
        onStart={onStart}
      />
    </TurnClientContextSource>,
  );
}
beforeEach(async () => {
  useAppStore.setState({
    projects: [project],
    draftContents: {},
    draftContentDiscardRequests: {},
    pendingComposerSeeds: {},
    pendingDraftWorktreeSelections: {},
  });
  useAppStore.getState().saveDraftContent(project.id, draft);
  await composerDraftStorage()!.flushRequired();
});

it("restores text and attachments without inventing a new draft revision", async () => {
  const before = composerDraftStorage()!.currentIdentity("project", project.id);
  const first = form();
  await waitFor(() =>
    expect(screen.getByRole("textbox")).toHaveTextContent("Preserve this prompt"),
  );
  expect(composerDraftStorage()!.currentIdentity("project", project.id)).toEqual(before);
  first.unmount();
  const second = form();
  expect(screen.getByRole("textbox")).toHaveTextContent("Preserve this prompt");
  expect(composerDraftStorage()!.currentIdentity("project", project.id)).toEqual(before);
  second.unmount();
});

it("refuses another dispatch of an unchanged uncertain draft after reopening", async () => {
  const report = vi.spyOn(toast, "danger").mockReturnValue("test-toast");
  try {
    const onStart = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(
        new RemoteClientError("Unknown delivery", 409, "command_outcome_uncertain"),
      );
    const first = form(onStart);
    fireEvent.click(screen.getByRole("button", { name: "Send fixture" }));
    await waitFor(async () =>
      expect(await listClientSubmissions()).toEqual([
        expect.objectContaining({ state: "uncertain" }),
      ]),
    );
    const before = composerDraftStorage()!.currentIdentity("project", project.id);
    first.unmount();
    const second = form(onStart);
    expect(composerDraftStorage()!.currentIdentity("project", project.id)).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Send fixture" }));
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith(expect.stringContaining("Couldn't confirm this command")),
    );
    expect(onStart).toHaveBeenCalledOnce();
    expect(await listClientSubmissions()).toHaveLength(1);
    second.unmount();
  } finally {
    report.mockRestore();
  }
});

it("captures browser focus before attachment preparation and keeps it out of recovery storage", async () => {
  let activeTab = 4;
  const capture = vi.fn<TurnClientContextCapture>(async () => ({
    browserFocus: { activeTab: { tabId: activeTab, title: "Page" } },
  }));
  let finish!: () => void;
  const materialize = vi.spyOn(draftSubmission, "materializeDraftSegments").mockImplementationOnce(
    (_target, segments) =>
      new Promise((resolve) => {
        finish = () => resolve([...segments]);
      }),
  );
  const report = vi.spyOn(toast, "danger").mockReturnValue("test-toast");
  try {
    const onStart = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(
        new RemoteClientError("Unknown delivery", 409, "command_outcome_uncertain"),
      );
    const view = form(onStart, capture);
    fireEvent.click(screen.getByRole("button", { name: "Send fixture" }));
    expect(capture).toHaveBeenCalledOnce();
    activeTab = 8;
    await waitFor(() => expect(materialize).toHaveBeenCalledOnce());
    await act(async () => finish());
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({
          clientContext: { browserFocus: { activeTab: { tabId: 4, title: "Page" } } },
        }),
      ),
    );
    const records = await listClientSubmissions();
    expect(records[0]?.content).toEqual(
      expect.objectContaining({
        configuration: expect.not.objectContaining({ clientContext: expect.anything() }),
      }),
    );
    expect(records[0]?.fingerprint).not.toContain("browserFocus");
    view.unmount();
  } finally {
    materialize.mockRestore();
    report.mockRestore();
  }
});

it("retains the draft when required submit-time context rejects", async () => {
  const capture = vi
    .fn<TurnClientContextCapture>()
    .mockRejectedValue(new Error("context unavailable"));
  const report = vi.spyOn(toast, "danger").mockReturnValue("test-toast");
  try {
    const onStart = vi.fn<() => Promise<void>>();
    const view = form(onStart, capture);
    fireEvent.click(screen.getByRole("button", { name: "Send fixture" }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("context unavailable"));
    expect(onStart).not.toHaveBeenCalled();
    expect(useAppStore.getState().draftContents[project.id]).toEqual(draft);
    expect(await listClientSubmissions()).toEqual([expect.objectContaining({ state: "failed" })]);
    view.unmount();
  } finally {
    report.mockRestore();
  }
});
