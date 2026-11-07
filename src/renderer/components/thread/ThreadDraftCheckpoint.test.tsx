import "@/renderer/testUtils/clientDraftDatabase";
import "@/renderer/components/providers/bootstrap";
import type { ReactNode } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
function form(onStart = vi.fn<() => Promise<void>>()) {
  return render(
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
    />,
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
