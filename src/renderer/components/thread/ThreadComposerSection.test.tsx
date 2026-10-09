import { keyDownAt } from "@/renderer/testUtils/keyboard";
import {
  composerDraftStorage,
  createComposerDraftStorage,
} from "@/renderer/state/composerDraftStorage";
import type { DraftContent } from "@/renderer/state/slices/types";
import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type {
  AgentStatus,
  CanonicalContentBlock,
  GitStatusResult,
  Thread,
} from "@/shared/contracts";
import "@/renderer/components/providers/bootstrap";
import * as skills from "@/renderer/components/skills/useSkills";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  useComposerInputInbox,
  worktreeComposerInboxKey,
} from "@/renderer/state/composerInputInbox";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useThreadFollowUpQueueStore } from "@/renderer/state/threadFollowUpQueueStore";
import type { SaveClipboardImage } from "../composer/useAttachments";
import { ThreadComposerSection } from "./ThreadComposerSection";
import { ImplicitMcpServersContext } from "../composer/implicitMcpServers";
import {
  TurnClientContextSource,
  type TurnClientContextCapture,
} from "../composer/turnClientContext";
import type { ComposerMcpMenuItem } from "../composer/ComposerAddMenu";
import { useRevertedPromptStore } from "./revertedPrompt";
import type { ThreadErrorDockState } from "./threadErrorState";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
  isCompactClientSurface: vi.fn<() => boolean>(() => false),
  clearPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  interruptThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  setPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  queueThreadFollowUp: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getThreadFollowUpQueue: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  refreshAgentStatuses: vi
    .fn<() => Promise<{ windows: AgentStatus[]; wsl: AgentStatus[] }>>()
    .mockResolvedValue({ windows: [], wsl: [] }),
  getProviderUsage: vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
}));

const runtimeActions = vi.hoisted(() => ({
  changeThreadConfig: vi.fn<() => void>(),
  resolveThreadServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  submitThreadInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const loginActions = vi.hoisted(() => ({
  runAgentLoginCommand: vi.fn<
    (input: { onCommandComplete?: (exitCode: number) => void }) => boolean
  >(() => true),
}));

const analytics = vi.hoisted(() => ({
  captureProductEvent: vi.fn<() => void>(),
  captureThreadPromptSubmitted: vi.fn<() => void>(),
}));

const composerAddMenuSpy = vi.hoisted(() => vi.fn<(props: unknown) => void>());

vi.mock("@/renderer/analytics/posthog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/analytics/posthog")>()),
  captureThreadPromptSubmitted: analytics.captureThreadPromptSubmitted,
}));
vi.mock("@/renderer/analytics/productAnalytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/analytics/productAnalytics")>()),
  captureProductEvent: analytics.captureProductEvent,
}));

// Partial mock: `clearThreadPendingSteer` keeps its real implementation so the
// pending-steer cancel path still exercises the (mocked) bridge and its toast.
vi.mock("@/renderer/actions/threadRuntimeActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/threadRuntimeActions")>()),
  changeThreadConfig: runtimeActions.changeThreadConfig,
  resolveThreadServerRequest: runtimeActions.resolveThreadServerRequest,
  submitThreadInput: runtimeActions.submitThreadInput,
}));

vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentLoginCommand: loginActions.runAgentLoginCommand,
}));

vi.mock("../composer/ComposerAddMenu", () => ({
  ComposerAddMenu: (props: unknown) => {
    composerAddMenuSpy(props);
    return null;
  },
}));

vi.mock("../../bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
  isCompactClientSurface: bridgeMock.isCompactClientSurface,
  readBridge: () => ({
    pickFiles: vi.fn<() => Promise<string[] | undefined>>().mockResolvedValue(undefined),
    clearPendingSteer: bridgeMock.clearPendingSteer,
    interruptThread: bridgeMock.interruptThread,
    setPendingSteer: bridgeMock.setPendingSteer,
    queueThreadFollowUp: bridgeMock.queueThreadFollowUp,
    getThreadFollowUpQueue: bridgeMock.getThreadFollowUpQueue,
    writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    refreshAgentStatuses: bridgeMock.refreshAgentStatuses,
    getProviderUsage: bridgeMock.getProviderUsage,
  }),
}));

const toastDangerSpy = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);

vi.mock("./ThreadComposer", () => ({
  resolveComposerControlIcon: () => null,
  ThreadComposer: (props: {
    controls?: Array<{
      kind?: string;
      label?: string;
      currentModel?: string;
      effortValue?: string;
      efforts?: Array<{ id: string; label: string }>;
    }>;
    fixedContent?: ReactNode;
    attachmentBar?: ReactNode;
    inputContent?: ReactNode;
    leadingControls?: ReactNode | (() => ReactNode);
    afterControls?: ReactNode | (() => ReactNode);
    onAttachFiles?: (paths: string[]) => void;
    onStop?: () => void;
    onSubmit: () => void;
    submitDisabled?: boolean;
  }) => (
    <div>
      {props.fixedContent}
      {props.attachmentBar}
      {props.inputContent}
      {typeof props.leadingControls === "function"
        ? props.leadingControls()
        : props.leadingControls}
      {typeof props.afterControls === "function" ? props.afterControls() : props.afterControls}
      <output data-testid="control-kinds">
        {props.controls?.map((control) => control.kind ?? control.label ?? "").join(",") ?? ""}
      </output>
      <output data-testid="effort-options">
        {props.controls
          ?.find((control) => control.kind === "effort-context")
          ?.efforts?.map((option) => option.id)
          .join(",") ?? ""}
      </output>
      <output data-testid="attach-files-enabled">{props.onAttachFiles ? "yes" : "no"}</output>
      {props.onStop && props.submitDisabled ? (
        <button type="button" aria-label="Stop response" onClick={props.onStop}>
          stop
        </button>
      ) : null}
      <button type="button" data-submit-disabled={props.submitDisabled} onClick={props.onSubmit}>
        send
      </button>
    </div>
  ),
}));

const guiThread: Thread = {
  id: "thread-gui-idle",
  projectId: "project-1",
  title: "Codex GUI thread",
  agentKind: "codex",
  config: {
    model: "gpt-5.4",
  },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  sessionRef: {
    providerSessionId: "session-gui",
    discoveredAt: new Date().toISOString(),
  },
  presentationMode: "gui",
  archived: false,
  done: false,
  starred: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const secondGuiThread: Thread = {
  ...guiThread,
  id: "thread-gui-second",
  title: "Second Codex GUI thread",
  sessionRef: {
    providerSessionId: "session-gui-second",
    discoveredAt: new Date().toISOString(),
  },
};

const codexGuiStatus: AgentStatus = {
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
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
  },
};

const terminalThread: Thread = {
  ...guiThread,
  id: "thread-terminal-idle",
  agentKind: "claude",
  config: { model: "claude" },
  presentationMode: "terminal",
};

const claudeTerminalStatus: AgentStatus = {
  kind: "claude",
  label: "Claude",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "claude", label: "Claude" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  },
};

function typeComposerText(editor: HTMLElement, text: string) {
  const textNode = document.createTextNode(text);
  editor.replaceChildren(textNode);
  const range = document.createRange();
  range.setStart(textNode, text.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.input(editor);
}

function pasteImageFile(editor: HTMLElement, file: File) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [file],
      items: [{ type: file.type, getAsFile: () => file }],
      getData: () => "",
    },
  });
  fireEvent(editor, event);
}

describe("ThreadComposerSection", () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    composerDraftStorage()?.flush();
    localStorage.clear();
    useSharedSettings.setState({
      collapseTerminalComposer: false,
      followUpBehavior: "steer",
      disabledBuiltInMcpServers: {},
    });
    useThreadTodoDockStore.setState({
      defaultCollapsed: false,
      byThreadId: {},
    });
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      pendingSteerByThreadId: {},
      connectingThreadIds: {},
      pendingComposerFocusThreadId: null,
      threadDraftContents: {},
      provisioningWorktreeThreadIds: {},
      runtimeLaunchConfigByThreadId: {},
      mcpLaunchCustomServerNamesByThreadId: {},
    });
    useGitStore.setState({ statuses: {} });
    useComposerInputInbox.setState({ itemsByComposer: {} });
    useRevertedPromptStore.setState({ byThread: {} });
    useThreadFollowUpQueueStore.setState({ byThread: {} });
    bridgeMock.queueThreadFollowUp.mockReset().mockResolvedValue(undefined);
    bridgeMock.getThreadFollowUpQueue.mockReset().mockResolvedValue(null);
    bridgeMock.isRemoteSession.mockReturnValue(false);
    bridgeMock.isCompactClientSurface.mockReturnValue(false);
    bridgeMock.clearPendingSteer.mockClear();
    bridgeMock.clearPendingSteer.mockResolvedValue(undefined);
    bridgeMock.refreshAgentStatuses.mockClear();
    loginActions.runAgentLoginCommand.mockClear();
    bridgeMock.interruptThread.mockClear();
    bridgeMock.interruptThread.mockResolvedValue(undefined);
    bridgeMock.setPendingSteer.mockClear();
    bridgeMock.setPendingSteer.mockResolvedValue(undefined);
    analytics.captureProductEvent.mockClear();
    analytics.captureThreadPromptSubmitted.mockClear();
    composerAddMenuSpy.mockClear();
    runtimeActions.changeThreadConfig.mockClear();
    runtimeActions.resolveThreadServerRequest.mockClear();
    runtimeActions.resolveThreadServerRequest.mockResolvedValue(undefined);
    runtimeActions.submitThreadInput.mockClear();
    runtimeActions.submitThreadInput.mockResolvedValue(undefined);
    toastDangerSpy.mockClear();
  });

  it("hides base-checkout changes while a new worktree is provisioning", () => {
    useAppStore.setState({
      provisioningWorktreeThreadIds: { [guiThread.id]: true },
    });
    useGitStore.setState({
      statuses: {
        "project-1": {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 12,
          totalDeletions: 3,
        } as GitStatusResult,
      },
    });

    render(
      composerElement({
        thread: {
          ...guiThread,
          status: "launching",
          sessionRef: undefined,
          worktreeBranch: "poracode/feature",
        },
      }),
    );

    expect(screen.queryByRole("button", { name: "Review changes" })).toBeNull();
  });

  it("floats the composer bubbles in one anchored wrapper above the composer", () => {
    useGitStore.setState({
      statuses: {
        "project-1": {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 12,
          totalDeletions: 3,
        } as GitStatusResult,
      },
    });

    const { container } = render(
      composerElement({
        thread: {
          ...guiThread,
          worktreePath: "C:\\repo\\.poracode\\worktrees\\feature",
          worktreeBranch: "poracode/feature",
        },
      }),
    );

    // The bubbles keep an out-of-flow, right-aligned row above the composer;
    // the row spans the pane so the scroll button can center on it without
    // shadowing chat content.
    const wrapper = container.querySelector("div.absolute.inset-x-0.bottom-full");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass("z-10", "mb-1.5", "pointer-events-none");
    const row = screen.getByRole("button", { name: "Review changes" }).closest(".flex-wrap");
    expect(row).toHaveClass("justify-end", "items-center", "*:pointer-events-auto");
    expect(wrapper).toContainElement(row as HTMLElement);
  });

  function composerElement(opts?: {
    thread?: Thread;
    agentStatus?: AgentStatus;
    autoFocusComposer?: boolean;
    errorDockStates?: ThreadErrorDockState[];
    onSubmitInput?: (prompt: string, segments?: unknown) => Promise<void>;
    onOpenProjectRelativePath?: (path: string, lineNumber?: number) => void;
    saveClipboardImage?: SaveClipboardImage;
    pickFiles?: () => Promise<string[] | null>;
  }) {
    const thread = opts?.thread ?? guiThread;
    const agentStatus = opts?.agentStatus ?? codexGuiStatus;
    return (
      <ThreadComposerSection
        threadId={thread.id}
        fallbackThread={thread}
        agentStatus={agentStatus}
        projectLocation={{ kind: "windows", path: "C:\\repo" }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={opts?.errorDockStates ?? []}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        {...(opts?.onSubmitInput ? { onSubmitInput: opts.onSubmitInput } : {})}
        {...(opts?.autoFocusComposer !== undefined
          ? { autoFocusComposer: opts.autoFocusComposer }
          : {})}
        {...(opts?.onOpenProjectRelativePath
          ? { onOpenProjectRelativePath: opts.onOpenProjectRelativePath }
          : {})}
        {...(opts?.saveClipboardImage ? { saveClipboardImage: opts.saveClipboardImage } : {})}
        {...(opts?.pickFiles ? { pickFiles: opts.pickFiles } : {})}
        onTodoDockCollapsedChange={() => undefined}
      />
    );
  }

  function renderComposer(opts?: {
    thread?: Thread;
    agentStatus?: AgentStatus;
    autoFocusComposer?: boolean;
    errorDockStates?: ThreadErrorDockState[];
    onSubmitInput?: ReturnType<typeof vi.fn<(prompt: string, segments?: unknown) => Promise<void>>>;
    onOpenProjectRelativePath?: (path: string, lineNumber?: number) => void;
    saveClipboardImage?: SaveClipboardImage;
    pickFiles?: () => Promise<string[] | null>;
  }) {
    const onSubmitInput =
      opts?.onSubmitInput ??
      vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(() => Promise.resolve());
    const result = render(composerElement({ ...opts, onSubmitInput }));
    return { ...result, onSubmitInput };
  }

  describe.each([
    ["a stored session", { ...guiThread, status: "inactive", canResumeWithConfig: false }],
    ["configuration only", { ...guiThread, status: "inactive", sessionRef: undefined }],
  ] as const)("inactive GUI resume with %s", (_source, thread) => {
    it("enables the editor and submits through the canonical runtime action", async () => {
      render(composerElement({ thread }));
      const input = screen.getByRole("textbox");
      const send = screen.getByRole("button", { name: "send" });
      expect(input).toHaveAttribute("contenteditable", "true");
      expect(send).toHaveAttribute("data-submit-disabled", "true");
      typeComposerText(input, "resume this thread");
      expect(send).toHaveAttribute("data-submit-disabled", "false");
      fireEvent.click(send);

      await waitFor(() =>
        expect(runtimeActions.submitThreadInput).toHaveBeenCalledExactlyOnceWith(
          thread.id,
          "resume this thread",
          [{ kind: "text", content: "resume this thread" }],
          { clientContext: undefined },
        ),
      );
      expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
      expect(bridgeMock.queueThreadFollowUp).not.toHaveBeenCalled();
      expect(input).toBeEmptyDOMElement();
    });

    it.each(["authentication", "connection"] as const)(
      "blocks submission while awaiting %s",
      async (guard) => {
        if (guard === "connection") {
          useAppStore.setState({ connectingThreadIds: { [thread.id]: "connection-1" } });
        }
        render(
          composerElement({
            thread,
            agentStatus: {
              ...codexGuiStatus,
              authState: guard === "authentication" ? "missing" : "authenticated",
            },
          }),
        );
        const input = screen.getByRole("textbox");
        typeComposerText(input, "keep this draft");
        const send = screen.getByRole("button", { name: "send" });
        expect(send).toHaveAttribute("data-submit-disabled", "true");
        fireEvent.click(send);
        fireEvent.keyDown(input, { key: "Enter" });
        await act(async () => Promise.resolve());

        expect(runtimeActions.submitThreadInput).not.toHaveBeenCalled();
        expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
        expect(bridgeMock.queueThreadFollowUp).not.toHaveBeenCalled();
        expect(input).toHaveTextContent("keep this draft");
      },
    );

    it("blocks another submit until the resume send settles", async () => {
      let finishSubmit!: () => void;
      runtimeActions.submitThreadInput.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishSubmit = resolve;
        }),
      );
      render(composerElement({ thread }));
      const input = screen.getByRole("textbox");
      const send = screen.getByRole("button", { name: "send" });
      typeComposerText(input, "first prompt");
      fireEvent.click(send);
      await waitFor(() => expect(runtimeActions.submitThreadInput).toHaveBeenCalledTimes(1));

      typeComposerText(input, "next prompt");
      expect(send).toHaveAttribute("data-submit-disabled", "true");
      fireEvent.click(send);
      fireEvent.keyDown(input, { key: "Enter" });
      await act(async () => Promise.resolve());
      expect(runtimeActions.submitThreadInput).toHaveBeenCalledTimes(1);
      expect(input).toHaveTextContent("next prompt");
      expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
      expect(bridgeMock.queueThreadFollowUp).not.toHaveBeenCalled();

      await act(async () => finishSubmit());
      expect(send).toHaveAttribute("data-submit-disabled", "false");
      fireEvent.click(send);
      await waitFor(() => expect(runtimeActions.submitThreadInput).toHaveBeenCalledTimes(2));
      expect(runtimeActions.submitThreadInput).toHaveBeenNthCalledWith(
        2,
        thread.id,
        "next prompt",
        [{ kind: "text", content: "next prompt" }],
        { clientContext: undefined },
      );
    });
  });

  it.each([
    [
      "a GUI thread without a session or config resume",
      { ...guiThread, status: "inactive", sessionRef: undefined, canResumeWithConfig: false },
      codexGuiStatus,
    ],
    [
      "a terminal thread with resume metadata",
      { ...terminalThread, status: "inactive" },
      claudeTerminalStatus,
    ],
  ] as const)("keeps %s disabled", async (_label, thread, agentStatus) => {
    render(composerElement({ thread, agentStatus }));
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("contenteditable", "false");
    expect(input).toHaveAttribute("aria-disabled", "true");
    typeComposerText(input, "should not resume");
    const send = screen.getByRole("button", { name: "send" });
    expect(send).toHaveAttribute("data-submit-disabled", "true");
    fireEvent.click(send);
    await act(async () => Promise.resolve());

    expect(runtimeActions.submitThreadInput).not.toHaveBeenCalled();
    expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
    expect(bridgeMock.queueThreadFollowUp).not.toHaveBeenCalled();
  });

  describe.each([
    ["GUI", guiThread, codexGuiStatus],
    ["CLI", terminalThread, claudeTerminalStatus],
  ] as const)("IME keyboard handling in the %s composer", (_surface, thread, agentStatus) => {
    it.each([
      { isComposing: true, keyCode: 13 },
      { isComposing: false, keyCode: 229 },
    ])(
      "preserves candidate-confirming Enter and its replay before exactly one ordinary submit (isComposing=$isComposing, keyCode=$keyCode)",
      async (compositionFlags) => {
        const { onSubmitInput } = renderComposer({ thread, agentStatus });
        const editor = screen.getByRole("textbox");
        typeComposerText(editor, "日本語");

        for (const modifiers of [{}, { ctrlKey: true }, { metaKey: true }]) {
          const confirmation = keyDownAt(
            editor,
            {
              key: "Enter",
              ...compositionFlags,
              ...modifiers,
            },
            100,
          );
          fireEvent(editor, confirmation);
          fireEvent.compositionEnd(editor, { data: "日本語" });
          fireEvent.keyUp(editor, { key: "Enter" });
          const replay = keyDownAt(editor, { key: "Enter", keyCode: 13, ...modifiers }, 100);
          fireEvent(editor, replay);
          await act(async () => Promise.resolve());
          expect(confirmation.defaultPrevented).toBe(false);
          expect(replay.defaultPrevented).toBe(true);
          expect(editor).toHaveTextContent("日本語");
          expect(onSubmitInput).not.toHaveBeenCalled();
          expect(bridgeMock.queueThreadFollowUp).not.toHaveBeenCalled();
          expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
        }

        const nextPress = keyDownAt(editor, { key: "Enter", keyCode: 13 }, 101);
        fireEvent(editor, nextPress);
        await waitFor(() => {
          expect(onSubmitInput).toHaveBeenCalledExactlyOnceWith("日本語", [
            { kind: "text", content: "日本語" },
          ]);
          expect(editor).toBeEmptyDOMElement();
        });
      },
    );

    it.each([
      { isComposing: true, keyCode: 13 },
      { isComposing: false, keyCode: 229 },
    ])(
      "keeps slash autocomplete open during IME confirmation (isComposing=$isComposing, keyCode=$keyCode)",
      async (compositionFlags) => {
        const { onSubmitInput } = renderComposer({
          thread: {
            ...thread,
            slashCommands: [{ id: "review", label: "Review code", section: "skills" }],
          },
          agentStatus,
        });
        const editor = screen.getByRole("textbox");
        typeComposerText(editor, "/rev");
        expect(await screen.findByRole("option", { name: /review/i })).toBeInTheDocument();

        const confirmation = keyDownAt(editor, { key: "Enter", ...compositionFlags }, 100);
        fireEvent(editor, confirmation);
        const replay = keyDownAt(editor, { key: "Enter", keyCode: 13 }, 100);
        fireEvent(editor, replay);
        await act(async () => Promise.resolve());
        expect(confirmation.defaultPrevented).toBe(false);
        expect(replay.defaultPrevented).toBe(true);
        expect(editor).toHaveTextContent("/rev");
        expect(editor.querySelector("[data-slash-command]")).toBeNull();
        expect(screen.getByRole("option", { name: /review/i })).toBeInTheDocument();
        expect(onSubmitInput).not.toHaveBeenCalled();

        const selection = keyDownAt(editor, { key: "Enter" }, 101);
        fireEvent(editor, selection);
        expect(editor.querySelector("[data-slash-command]")).toHaveAttribute(
          "data-slash-command",
          "review",
        );
        expect(screen.queryByRole("option", { name: /review/i })).not.toBeInTheDocument();
        expect(onSubmitInput).not.toHaveBeenCalled();
      },
    );

    it.each([{}, { ctrlKey: true }, { metaKey: true }])(
      "submits ASCII exactly once with non-composing Enter and modifiers %j",
      async (modifiers) => {
        const { onSubmitInput } = renderComposer({ thread, agentStatus });
        const editor = screen.getByRole("textbox");
        typeComposerText(editor, "hello");
        fireEvent.keyDown(editor, { key: "Enter", keyCode: 13, ...modifiers });
        await waitFor(() =>
          expect(onSubmitInput).toHaveBeenCalledExactlyOnceWith("hello", [
            { kind: "text", content: "hello" },
          ]),
        );
      },
    );

    it("leaves Shift+Enter available for a newline after IME confirmation", async () => {
      const { onSubmitInput } = renderComposer({ thread, agentStatus });
      const editor = screen.getByRole("textbox");
      typeComposerText(editor, "日本語");
      fireEvent(editor, keyDownAt(editor, { key: "Enter", keyCode: 229 }, 100));
      const newline = keyDownAt(editor, { key: "Enter", keyCode: 13, shiftKey: true }, 101);
      fireEvent(editor, newline);
      await act(async () => Promise.resolve());

      expect(newline.defaultPrevented).toBe(false);
      expect(editor).toHaveTextContent("日本語");
      expect(onSubmitInput).not.toHaveBeenCalled();
    });
  });

  it("uses the live session ladder in the existing composer control", () => {
    renderComposer({
      thread: {
        ...guiThread,
        config: { ...guiThread.config, effort: "high" },
        sessionConfigOptions: [
          {
            id: "model-select",
            type: "select",
            role: "model",
            currentValue: guiThread.config.model,
            values: [{ value: guiThread.config.model, name: "Example model" }],
            groups: [],
          },
          {
            id: "reasoning-select",
            type: "select",
            role: "effort",
            currentValue: "high",
            values: ["low", "medium", "high", "xhigh", "max"].map((value) => ({ value })),
            groups: [],
          },
        ],
      },
      agentStatus: {
        ...codexGuiStatus,
        capabilities: {
          ...codexGuiStatus.capabilities,
          modelEfforts: { [guiThread.config.model]: ["medium", "high", "max"] },
          presentationCapabilities: {
            gui: {
              models: codexGuiStatus.capabilities.models,
              efforts: ["medium", "high", "max"],
              modelEfforts: { [guiThread.config.model]: ["medium", "high", "max"] },
            },
          },
        },
      },
    });
    expect(screen.getByTestId("effort-options")).toHaveTextContent("low,medium,high,xhigh,max");
  });

  it("omits client-inherent tools from chat controls without altering session bindings", () => {
    const thread = { ...guiThread, config: { ...guiThread.config, chromeMcp: true } };
    const { rerender } = render(
      <ImplicitMcpServersContext value={["chrome"]}>
        {composerElement({ thread })}
      </ImplicitMcpServersContext>,
    );
    const menu = () =>
      composerAddMenuSpy.mock.lastCall?.[0] as {
        mcpServers: ComposerMcpMenuItem[];
      };
    expect(menu().mcpServers.map((item) => item.descriptor.id)).not.toContain("chrome");
    expect(thread.config.chromeMcp).toBe(true);
    expect(runtimeActions.changeThreadConfig).not.toHaveBeenCalled();
    rerender(composerElement({ thread }));
    expect(menu().mcpServers.find((item) => item.descriptor.id === "chrome")?.visible).toBe(true);
  });

  it("hides provider controls for active terminal threads", () => {
    renderComposer({
      thread: { ...terminalThread, config: { model: "claude", effort: "low" } },
      agentStatus: {
        ...claudeTerminalStatus,
        capabilities: {
          ...claudeTerminalStatus.capabilities,
          models: [
            { id: "claude", label: "Claude" },
            { id: "opus", label: "Opus" },
          ],
          efforts: ["low", "high"],
          modelEfforts: {
            claude: ["low", "high"],
            opus: ["high"],
          },
        },
      },
    });

    expect(screen.getByTestId("control-kinds")).toBeEmptyDOMElement();
  });

  it("does not offer plugin-backed MCPs as @ mentions", () => {
    const rangeRectDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      "getBoundingClientRect",
    );
    const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0 }),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined,
    });
    try {
      renderComposer();
      const input = screen.getByRole("textbox");
      typeComposerText(input, "@ter");
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      typeComposerText(input, "@bro");
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    } finally {
      if (rangeRectDescriptor) {
        Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRectDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
      }
      if (scrollIntoViewDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("hides @Terminal when the provider owns MCP configuration", () => {
    renderComposer({
      agentStatus: {
        ...codexGuiStatus,
        capabilities: {
          ...codexGuiStatus.capabilities,
          mcpConfigSource: "agentSettings",
        },
      },
    });
    const input = screen.getByRole("textbox");
    typeComposerText(input, "@ter");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("shows provider-owned enabled MCPs in the indicator and @ mentions", () => {
    useAppStore.setState({
      runtimeLaunchConfigByThreadId: {
        [guiThread.id]: { model: "gpt-5.4", crossagentMcp: true },
      },
      mcpLaunchCustomServerNamesByThreadId: {
        [guiThread.id]: ["Vision-MCP"],
      },
    });
    const rangeRectDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      "getBoundingClientRect",
    );
    const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0 }),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined,
    });

    try {
      renderComposer({
        agentStatus: {
          ...codexGuiStatus,
          capabilities: {
            ...codexGuiStatus.capabilities,
            mcpConfigSource: "agentSettings",
          },
        },
      });

      const menuProps = composerAddMenuSpy.mock.lastCall?.[0] as {
        mcpServers: Array<{ descriptor: { id: string }; visible: boolean }>;
        customMcpServers: Array<{ name: string; enabled: boolean }>;
        readOnly: boolean;
      };
      expect(
        menuProps.mcpServers
          .filter((server) => server.visible)
          .map((server) => server.descriptor.id),
      ).toEqual(["crossagents"]);
      expect(menuProps.customMcpServers).toEqual([
        expect.objectContaining({ name: "Vision-MCP", enabled: true }),
      ]);
      expect(menuProps.readOnly).toBe(true);

      const input = screen.getByRole("textbox");
      typeComposerText(input, "@cro");
      expect(screen.queryByRole("option")).not.toBeInTheDocument();

      typeComposerText(input, "@vis");
      expect(screen.getByRole("option")).toHaveTextContent("Vision-MCP");
    } finally {
      if (rangeRectDescriptor) {
        Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRectDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
      }
      if (scrollIntoViewDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("does not report client-local custom MCPs for a remote provider-owned thread", () => {
    useAppStore.setState({
      runtimeLaunchConfigByThreadId: {
        [guiThread.id]: { model: "gpt-5.4", crossagentMcp: true },
      },
      mcpLaunchCustomServerNamesByThreadId: {
        [guiThread.id]: ["Client-only MCP"],
      },
    });

    renderComposer({
      thread: { ...guiThread, remoteServerId: "desktop-1", remoteId: "remote-thread-1" },
      agentStatus: {
        ...codexGuiStatus,
        capabilities: {
          ...codexGuiStatus.capabilities,
          mcpConfigSource: "agentSettings",
        },
      },
    });

    const menuProps = composerAddMenuSpy.mock.lastCall?.[0] as {
      customMcpServers: unknown[];
    };
    expect(menuProps.customMcpServers).toEqual([]);
  });

  it("uses GUI presentation capabilities for slash commands and /fast submission", () => {
    const divergentStatus: AgentStatus = {
      ...codexGuiStatus,
      capabilities: {
        ...codexGuiStatus.capabilities,
        models: [{ id: "cli-model", label: "CLI model" }],
        efforts: [],
        modelEfforts: {},
        fastModels: [],
        liveInputMode: "terminal",
        presentationMode: "terminal",
        presentationModes: ["terminal", "gui"],
        presentationCapabilities: {
          gui: {
            models: [{ id: "gpt-5.4", label: "5.4" }],
            efforts: ["high"],
            defaultEffort: "high",
            modelEfforts: { "gpt-5.4": ["high"] },
            fastModels: ["gpt-5.4"],
            modes: ["agent"],
            approvalPolicies: [{ id: "on-request", label: "On Request" }],
            sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
            supportsResume: true,
            supportsDirectInput: true,
            liveInputMode: "server",
            presentationMode: "gui",
            settingDefs: [],
          },
        },
      },
    };
    renderComposer({ agentStatus: divergentStatus });

    const input = screen.getByRole("textbox");
    typeComposerText(input, "/fast");

    expect(screen.getByRole("option", { name: /\/fast/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    expect(runtimeActions.changeThreadConfig).toHaveBeenCalledWith(guiThread.id, {
      model: "gpt-5.4",
      fast: true,
    });
  });

  it("hides the terminal composer collapse button in remote sessions", () => {
    const { unmount } = renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
    });
    expect(screen.getByRole("button", { name: "Collapse composer" })).toBeInTheDocument();
    unmount();

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
    });

    expect(screen.queryByRole("button", { name: "Collapse composer" })).not.toBeInTheDocument();
  });

  it("starts the canonical GUI composer in the old PWA floating dock on compact layouts", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: query === "(max-width: 767px)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      })),
    );

    renderComposer();

    const input = screen.getByRole("textbox");
    const section = input.closest(".poracode-thread-composer-section");
    const dock = input.closest(".m-thread-compose-dock");
    expect(section).toHaveAttribute("data-compact-collapsed");
    expect(section?.querySelector("[inert]")).toBeNull();
    expect(dock).not.toHaveAttribute("data-expanded");
    expect(dock).not.toHaveAttribute("data-input-has-content");

    // WebKit leaves a filler <br> in an empty contenteditable. Compact chrome
    // must follow the composer's semantic text state, not DOM child count, or
    // the full selector row flashes together with the compact summary.
    input.innerHTML = "<br>";
    fireEvent.input(input);
    expect(dock).not.toHaveAttribute("data-input-has-content");

    typeComposerText(input, "Follow up");
    expect(dock).toHaveAttribute("data-input-has-content");

    fireEvent.focus(input);

    expect(dock).toHaveAttribute("data-expanded");
    fireEvent.click(screen.getByRole("button", { name: "Collapse composer" }));
    expect(dock).not.toHaveAttribute("data-expanded");
  });

  it("collapses the compact floating dock after the canonical submit succeeds", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: query === "(max-width: 767px)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      })),
    );
    const { onSubmitInput } = renderComposer();
    const input = screen.getByRole("textbox");
    const dock = input.closest(".m-thread-compose-dock");
    typeComposerText(input, "Ship it");
    fireEvent.focus(input);

    expect(dock).toHaveAttribute("data-expanded");
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("Ship it", [{ kind: "text", content: "Ship it" }]);
      expect(dock).not.toHaveAttribute("data-expanded");
    });
  });

  it("submits on unmodified Enter on the desktop PWA composer", async () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    const { onSubmitInput } = renderComposer();
    const input = screen.getByRole("textbox");
    typeComposerText(input, "Ship it from desktop");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("Ship it from desktop", [
        { kind: "text", content: "Ship it from desktop" },
      ]);
    });
  });

  it("keeps unmodified Enter as a newline on the compact PWA composer", async () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: query === "(max-width: 767px)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      })),
    );
    const { onSubmitInput } = renderComposer();
    const input = screen.getByRole("textbox");
    typeComposerText(input, "Keep writing");
    const event = createEvent.keyDown(input, { key: "Enter" });
    fireEvent(input, event);

    expect(event.defaultPrevented).toBe(false);
    expect(onSubmitInput).not.toHaveBeenCalled();
    expect(input).toHaveTextContent("Keep writing");
  });

  it("preserves an unsent draft when the composer unmounts and restores it on remount", async () => {
    const { unmount } = renderComposer();

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("half-written thought"));
    fireEvent.input(input);

    unmount();

    expect(useAppStore.getState().threadDraftContents[guiThread.id]?.segments).toEqual([
      { kind: "text", content: "half-written thought" },
    ]);

    renderComposer();

    await waitFor(() => {
      expect(screen.getByRole("textbox").textContent).toContain("half-written thought");
    });
    // Active drafts retain their checkpoint until cleared or submitted.
    expect(useAppStore.getState().threadDraftContents[guiThread.id]?.segments).toEqual([
      { kind: "text", content: "half-written thought" },
    ]);
  });

  it("appends rapid queued inputs to an existing draft as separate blocks", async () => {
    const { onSubmitInput } = renderComposer();
    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("existing draft"));
    fireEvent.input(input);

    act(() => {
      const inbox = useComposerInputInbox.getState();
      inbox.enqueue(guiThread.id, [{ kind: "text", content: "first note" }]);
      inbox.enqueue(guiThread.id, [{ kind: "text", content: "second note" }]);
    });

    fireEvent.click(screen.getByText("send"));
    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("existing draft\n\nfirst note\n\nsecond note", [
        { kind: "text", content: "existing draft\n\nfirst note\n\nsecond note" },
      ]);
    });
  });

  it("a reverted prompt overwrites an existing draft", async () => {
    const { onSubmitInput } = renderComposer();
    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("existing draft"));
    fireEvent.input(input);

    act(() => {
      useRevertedPromptStore
        .getState()
        .restore(guiThread.id, [{ kind: "text", text: "reverted prompt" }]);
    });

    fireEvent.click(screen.getByText("send"));
    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("reverted prompt", [
        { kind: "text", content: "reverted prompt" },
      ]);
    });
  });

  it("restores attachments with their MIME type for resend", async () => {
    const { onSubmitInput } = renderComposer();

    act(() => {
      useRevertedPromptStore.getState().restore(guiThread.id, [
        { kind: "text", text: "see this" },
        {
          kind: "image",
          path: "C:\\tmp\\shot",
          mimeType: "image/png",
          dataUrl: "",
          source: "attachment",
        },
      ]);
    });

    fireEvent.click(screen.getByText("send"));
    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("see this", [
        { kind: "attachment", path: "C:\\tmp\\shot", mimeType: "image/png" },
        { kind: "text", content: "see this" },
      ]);
    });
  });

  it("restores inline skill references as executable skill chips", async () => {
    const thread = {
      ...guiThread,
      slashCommands: [
        {
          id: "review",
          label: "Review",
          section: "skills" as const,
          skillName: "review",
          skillInvocation: "/skill:review",
          skillPath: "/skills/review/SKILL.md",
          skillProvider: "Example",
          skillScope: "project" as const,
        },
      ],
    };
    const { onSubmitInput } = renderComposer({ thread });
    act(() => {
      useRevertedPromptStore.getState().restore(thread.id, [
        { kind: "text", text: "Please " },
        { kind: "skill", name: "review", invocation: "Use the review skill." },
      ]);
    });
    await waitFor(() =>
      expect(useRevertedPromptStore.getState().byThread[thread.id]).toBeUndefined(),
    );
    fireEvent.click(screen.getByText("send"));
    await waitFor(() =>
      expect(onSubmitInput).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            kind: "skill",
            name: "review",
            path: "/skills/review/SKILL.md",
            invocation: "/skill:review",
          }),
        ]),
      ),
    );
  });

  it("waits for skill discovery before consuming a reverted prompt", async () => {
    const skillState = vi.spyOn(skills, "useSkillSlashCommandState").mockReturnValue({
      commands: [],
      resolved: false,
    });
    try {
      const { rerender, onSubmitInput } = renderComposer();
      typeComposerText(screen.getByRole("textbox"), "existing draft");
      act(() => {
        useRevertedPromptStore.getState().restore(guiThread.id, [
          { kind: "text", text: "Please " },
          { kind: "skill", name: "review", invocation: "/review", pluginId: "review-plugin" },
        ]);
      });

      expect(screen.getByRole("textbox")).toHaveTextContent("existing draft");
      expect(useRevertedPromptStore.getState().byThread[guiThread.id]).toBeDefined();
      expect(onSubmitInput).not.toHaveBeenCalled();

      skillState.mockReturnValue({
        resolved: true,
        commands: [
          {
            id: "review",
            label: "Review",
            section: "skills",
            skillName: "review",
            skillInvocation: "/skill:review",
            skillPath: "/skills/review/SKILL.md",
            skillProvider: "Example",
            skillScope: "project",
            pluginId: "review-plugin",
          },
        ],
      });
      rerender(composerElement({ onSubmitInput }));

      await waitFor(() =>
        expect(useRevertedPromptStore.getState().byThread[guiThread.id]).toBeUndefined(),
      );
      expect(screen.getByRole("textbox")).not.toHaveTextContent("existing draft");
      fireEvent.click(screen.getByText("send"));
      await waitFor(() =>
        expect(onSubmitInput).toHaveBeenCalledWith(expect.any(String), [
          { kind: "text", content: "Please " },
          {
            kind: "skill",
            name: "review",
            invocation: "/skill:review",
            path: "/skills/review/SKILL.md",
            provider: "Example",
            scope: "project",
            pluginId: "review-plugin",
          },
        ]),
      );
    } finally {
      skillState.mockRestore();
    }
  });

  it("preserves a reverted prompt and its attachment when switching away and back", async () => {
    const { rerender, onSubmitInput } = renderComposer();
    act(() => {
      useRevertedPromptStore.getState().restore(guiThread.id, [
        { kind: "text", text: "reverted draft" },
        {
          kind: "image",
          path: "C:\\attachments\\reverted.png",
          mimeType: "image/png",
          dataUrl: "",
          source: "attachment",
        },
      ]);
    });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveTextContent("reverted draft"));
    expect(screen.getByAltText("reverted.png")).toBeInTheDocument();
    expect(useRevertedPromptStore.getState().byThread[guiThread.id]).toBeUndefined();

    rerender(composerElement({ thread: secondGuiThread, onSubmitInput }));
    expect(screen.getByRole("textbox")).not.toHaveTextContent("reverted draft");
    expect(screen.queryByAltText("reverted.png")).not.toBeInTheDocument();
    expect(useAppStore.getState().threadDraftContents[guiThread.id]).toEqual({
      segments: [{ kind: "text", content: "reverted draft" }],
      attachments: [
        {
          id: expect.any(String),
          path: "C:\\attachments\\reverted.png",
          name: "reverted.png",
          mimeType: "image/png",
          isImage: true,
        },
      ],
    });
    expect(onSubmitInput).not.toHaveBeenCalled();

    rerender(composerElement({ onSubmitInput }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveTextContent("reverted draft"));
    expect(screen.getByAltText("reverted.png")).toHaveAttribute(
      "src",
      "poracode-local://local/C:/attachments/reverted.png",
    );
    expect(useAppStore.getState().threadDraftContents[guiThread.id]?.segments).toEqual([
      { kind: "text", content: "reverted draft" },
    ]);
    fireEvent.click(screen.getByText("send"));
    await waitFor(() =>
      expect(onSubmitInput).toHaveBeenCalledWith("reverted draft", [
        { kind: "attachment", path: "C:\\attachments\\reverted.png", mimeType: "image/png" },
        { kind: "text", content: "reverted draft" },
      ]),
    );
  });

  it.each([
    { action: "undo", keys: ["z"], prompt: "draft a", image: "a.png", otherImage: "b.png" },
    { action: "redo", keys: ["z", "y"], prompt: "prompt b", image: "b.png", otherImage: "a.png" },
  ])(
    "sends the text and image of the same draft after a revert and $action",
    async ({ keys, prompt, image, otherImage }) => {
      useAppStore.setState({
        threadDraftContents: {
          [guiThread.id]: {
            segments: [{ kind: "text", content: "draft a" }],
            attachments: [
              {
                id: "draft-a-image",
                path: "C:\\attachments\\a.png",
                name: "a.png",
                mimeType: "image/png",
                isImage: true,
              },
            ],
          },
        },
      });
      const { onSubmitInput } = renderComposer();
      const input = screen.getByRole("textbox");
      await waitFor(() => expect(input).toHaveTextContent("draft a"));

      act(() => {
        useRevertedPromptStore.getState().restore(guiThread.id, [
          { kind: "text", text: "prompt b" },
          {
            kind: "image",
            path: "C:\\attachments\\b.png",
            mimeType: "image/png",
            dataUrl: "",
            source: "attachment",
          },
        ]);
      });
      await waitFor(() => expect(input).toHaveTextContent("prompt b"));
      expect(screen.getByAltText("b.png")).toBeInTheDocument();

      for (const key of keys) fireEvent.keyDown(input, { key, ctrlKey: true });
      expect(input).toHaveTextContent(prompt);
      expect(screen.getByAltText(image)).toBeInTheDocument();
      expect(screen.queryByAltText(otherImage)).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("send"));
      await waitFor(() =>
        expect(onSubmitInput).toHaveBeenCalledWith(prompt, [
          { kind: "attachment", path: `C:\\attachments\\${image}`, mimeType: "image/png" },
          { kind: "text", content: prompt },
        ]),
      );
    },
  );

  it("keeps a reverted prompt until its target thread is shown", async () => {
    const { rerender } = renderComposer();
    act(() => {
      useRevertedPromptStore
        .getState()
        .restore(secondGuiThread.id, [{ kind: "text", text: "retry this" }]);
    });
    expect(screen.getByRole("textbox")).not.toHaveTextContent("retry this");
    rerender(composerElement({ thread: secondGuiThread }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveTextContent("retry this"));
    expect(useRevertedPromptStore.getState().byThread[secondGuiThread.id]).toBeUndefined();
  });

  it("leaves queued input untouched until its target thread is shown", async () => {
    const { rerender } = renderComposer();

    act(() => {
      useComposerInputInbox
        .getState()
        .enqueue(secondGuiThread.id, [{ kind: "text", content: "second thread only" }]);
    });

    expect(screen.getByRole("textbox")).not.toHaveTextContent("second thread only");
    expect(useComposerInputInbox.getState().itemsByComposer[secondGuiThread.id]).toBeDefined();

    rerender(
      composerElement({
        thread: secondGuiThread,
        onSubmitInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveTextContent("second thread only");
    });
    expect(useComposerInputInbox.getState().itemsByComposer[secondGuiThread.id]).toBeUndefined();
  });

  it("drains a worktree-scoped note only when a matching thread opens", async () => {
    const worktreeThread = {
      ...guiThread,
      id: "thread-worktree",
      worktreePath: "C:\\repo\\review",
    };
    const inboxKey = worktreeComposerInboxKey(
      worktreeThread.projectId,
      worktreeThread.worktreePath,
    );
    useComposerInputInbox
      .getState()
      .enqueue(inboxKey, [{ kind: "text", content: "worktree note" }]);

    renderComposer({ thread: worktreeThread });

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveTextContent("worktree note");
    });
    expect(useComposerInputInbox.getState().itemsByComposer[inboxKey]).toBeUndefined();
  });

  it("keeps queued input until an in-flight submit finishes", async () => {
    let finishSubmit!: () => void;
    const onSubmitInput = vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finishSubmit = resolve;
        }),
    );
    renderComposer({ onSubmitInput });
    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("send this"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));
    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalled();
    });

    act(() => {
      useComposerInputInbox
        .getState()
        .enqueue(guiThread.id, [{ kind: "text", content: "next prompt note" }]);
    });

    expect(useComposerInputInbox.getState().itemsByComposer[guiThread.id]).toBeDefined();
    expect(input).not.toHaveTextContent("next prompt note");

    await act(async () => finishSubmit());
    await waitFor(() => {
      expect(input).toHaveTextContent("next prompt note");
    });
    expect(useComposerInputInbox.getState().itemsByComposer[guiThread.id]).toBeUndefined();
  });

  it("switches drafts without remounting the primary GUI composer shell", async () => {
    useAppStore.setState({
      threadDraftContents: {
        [secondGuiThread.id]: {
          segments: [{ kind: "text", content: "second thread draft" }],
          attachments: [],
        },
      },
    });
    const { rerender } = renderComposer();
    const firstInput = screen.getByRole("textbox");
    firstInput.appendChild(document.createTextNode("first thread draft"));
    fireEvent.input(firstInput);

    rerender(
      composerElement({
        thread: secondGuiThread,
        onSubmitInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveTextContent("second thread draft");
    });
    expect(screen.getByRole("textbox")).toBe(firstInput);
    expect(useAppStore.getState().threadDraftContents[guiThread.id]?.segments).toEqual([
      { kind: "text", content: "first thread draft" },
    ]);
    expect(useAppStore.getState().threadDraftContents[secondGuiThread.id]?.segments).toEqual([
      { kind: "text", content: "second thread draft" },
    ]);
  });

  it("restores an unsent image attachment preview after switching threads", async () => {
    // jsdom does not implement object URLs.
    const createObjectURL = vi.fn<(source: File) => string>(() => "blob:app/pasted-1");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const saveClipboardImage = vi.fn<SaveClipboardImage>(() =>
      Promise.resolve("C:\\attachments\\thread-gui-idle\\image-1.png"),
    );
    try {
      const { rerender } = renderComposer({ saveClipboardImage });
      const input = screen.getByRole("textbox");
      pasteImageFile(
        input,
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );

      // The just-pasted image previews from its local object URL.
      const pastedThumb = await screen.findByAltText("Image 1.png");
      expect(pastedThumb).toHaveAttribute("src", "blob:app/pasted-1");
      typeComposerText(input, "unsent note");

      // Switch to another thread: the composer shell stays mounted, saves the
      // draft, then clears the attachments (revoking the object URL) for the
      // next thread.
      rerender(composerElement({ thread: secondGuiThread, saveClipboardImage }));

      const savedDraft = useAppStore.getState().threadDraftContents[guiThread.id];
      expect(savedDraft?.attachments).toHaveLength(1);
      // The stashed draft must not reference the ephemeral object URL — the
      // reset path revokes it as part of clearing the composer.
      expect(savedDraft?.attachments[0]).not.toHaveProperty("previewUrl");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");

      // Switching back restores the attachment; its preview renders from the
      // durable saved file instead of the revoked object URL.
      rerender(composerElement({ saveClipboardImage }));
      await waitFor(() => {
        expect(screen.getByAltText("Image 1.png")).toHaveAttribute(
          "src",
          "poracode-local://local/C:/attachments/thread-gui-idle/image-1.png",
        );
      });
      expect(screen.getByRole("textbox")).toHaveTextContent("unsent note");
    } finally {
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("does not attach a pasted image that resolves after switching threads", async () => {
    // jsdom does not implement object URLs.
    const createObjectURL = vi.fn<(source: File) => string>(() => "blob:app/pasted-1");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let resolveSave: ((path: string) => void) | undefined;
    const saveClipboardImage = vi.fn<SaveClipboardImage>(
      () =>
        new Promise<string>((resolve) => {
          resolveSave = resolve;
        }),
    );
    try {
      const { rerender } = renderComposer({ saveClipboardImage });
      pasteImageFile(
        screen.getByRole("textbox"),
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );
      await waitFor(() => expect(saveClipboardImage).toHaveBeenCalled());

      rerender(composerElement({ thread: secondGuiThread, saveClipboardImage }));
      await act(async () => {
        resolveSave?.("C:\\attachments\\thread-gui-idle\\image-1.png");
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createObjectURL).not.toHaveBeenCalled();
      expect(screen.queryByAltText("Image 1.png")).toBeNull();
    } finally {
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  describe("asynchronous file picks", () => {
    function deferredPicker() {
      const resolvers: Array<(paths: string[] | null) => void> = [];
      const pickFiles = vi.fn<() => Promise<string[] | null>>(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          }),
      );
      return { pickFiles, resolvers };
    }

    function startPick() {
      const props = composerAddMenuSpy.mock.lastCall?.[0] as { onPickFiles?: () => void };
      act(() => props.onPickFiles?.());
    }

    async function finishPick(
      resolve: ((paths: string[] | null) => void) | undefined,
      paths: string[] | null = ["C:\\attachments\\thread-gui-idle\\private-A.txt"],
    ) {
      expect(resolve).toBeTypeOf("function");
      await act(async () => {
        resolve?.(paths);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    it("attaches a file picked in the same thread", async () => {
      const { pickFiles, resolvers } = deferredPicker();
      renderComposer({ pickFiles });
      startPick();
      await finishPick(resolvers[0]);
      expect(screen.getByText("private-A.txt")).toBeInTheDocument();
    });

    it("keeps an upload that finishes after switching threads out of the new thread", async () => {
      const { pickFiles, resolvers } = deferredPicker();
      const { rerender } = renderComposer({ pickFiles });
      startPick();
      rerender(composerElement({ thread: secondGuiThread, pickFiles }));
      await finishPick(resolvers[0]);

      expect(screen.queryByText("private-A.txt")).toBeNull();
      expect(useAppStore.getState().threadDraftContents[secondGuiThread.id]).toBeUndefined();
      expect(
        useAppStore.getState().threadDraftContents[guiThread.id]?.attachments.map((a) => a.name),
      ).toEqual(["private-A.txt"]);

      // The file reappears with the thread it was picked for.
      rerender(composerElement({ pickFiles }));
      expect(await screen.findByText("private-A.txt")).toBeInTheDocument();
    });

    it("attaches to the originating thread when the user returns before the upload finishes", async () => {
      const { pickFiles, resolvers } = deferredPicker();
      const { rerender } = renderComposer({ pickFiles });
      startPick();
      rerender(composerElement({ thread: secondGuiThread, pickFiles }));
      rerender(composerElement({ pickFiles }));
      await finishPick(resolvers[0]);

      expect(screen.getByText("private-A.txt")).toBeInTheDocument();
      expect(
        useAppStore.getState().threadDraftContents[guiThread.id]?.attachments.map((a) => a.name),
      ).toEqual(["private-A.txt"]);

      rerender(composerElement({ thread: secondGuiThread, pickFiles }));
      expect(screen.queryByText("private-A.txt")).toBeNull();
    });

    it("persists concurrent late picks with the origin draft and preserves the active draft", async () => {
      const originDraft: DraftContent = {
        segments: [{ kind: "text", content: "origin note" }],
        attachments: [
          {
            id: "existing",
            path: "C:\\attachments\\existing.txt",
            name: "existing.txt",
            isImage: false,
            mimeType: "text/plain",
          },
        ],
      };
      const activeDraft: DraftContent = {
        segments: [{ kind: "text", content: "active note" }],
        attachments: [],
      };
      useAppStore.getState().saveThreadDraftContent(guiThread.id, originDraft);
      useAppStore.getState().saveThreadDraftContent(secondGuiThread.id, activeDraft);
      const { pickFiles, resolvers } = deferredPicker();
      const { rerender } = renderComposer({ pickFiles });
      expect(screen.getByText("existing.txt")).toBeInTheDocument();
      startPick();
      startPick();
      expect(pickFiles).toHaveBeenCalledTimes(2);
      rerender(composerElement({ thread: secondGuiThread, pickFiles }));
      await finishPick(resolvers[1], ["C:\\attachments\\private-B.txt"]);
      await finishPick(resolvers[0]);

      const savedDraft = useAppStore.getState().threadDraftContents[guiThread.id];
      expect(savedDraft?.segments).toEqual(originDraft.segments);
      expect(savedDraft?.attachments[0]).toEqual(originDraft.attachments[0]);
      expect(savedDraft?.attachments.map(({ name }) => name)).toEqual([
        "existing.txt",
        "private-B.txt",
        "private-A.txt",
      ]);
      expect(useAppStore.getState().threadDraftContents[secondGuiThread.id]).toEqual(activeDraft);
      expect(screen.getByRole("textbox")).toHaveTextContent("active note");
      expect(screen.queryByText("private-A.txt")).toBeNull();
      expect(screen.queryByText("private-B.txt")).toBeNull();

      composerDraftStorage()?.flush();
      const reloadedDrafts = createComposerDraftStorage(localStorage, window).load("thread");
      expect(reloadedDrafts[guiThread.id]).toEqual(savedDraft);
      expect(reloadedDrafts[secondGuiThread.id]).toEqual(activeDraft);
      await act(() => useAppStore.setState({ threadDraftContents: reloadedDrafts }));
      rerender(composerElement({ pickFiles }));
      expect(screen.getByRole("textbox")).toHaveTextContent("origin note");
      for (const name of ["existing.txt", "private-A.txt", "private-B.txt"]) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    });

    it.each([
      { label: "cancelled", paths: null },
      { label: "empty", paths: [] },
    ])("does not create a late draft for a $label pick", async ({ paths }) => {
      const { pickFiles, resolvers } = deferredPicker();
      const { rerender } = renderComposer({ pickFiles });
      startPick();
      expect(pickFiles).toHaveBeenCalledTimes(1);
      rerender(composerElement({ thread: secondGuiThread, pickFiles }));
      await finishPick(resolvers[0], paths);
      composerDraftStorage()?.flush();

      expect(useAppStore.getState().threadDraftContents).toEqual({});
      expect(createComposerDraftStorage(localStorage, window).load("thread")).toEqual({});
    });

    it("saves an upload that finishes after the composer unmounts to its thread draft", async () => {
      const { pickFiles, resolvers } = deferredPicker();
      const { unmount } = renderComposer({ pickFiles });
      startPick();
      unmount();
      await finishPick(resolvers[0]);

      expect(
        useAppStore.getState().threadDraftContents[guiThread.id]?.attachments.map((a) => a.name),
      ).toEqual(["private-A.txt"]);
    });
  });

  it("focuses the reused composer when the desktop switches threads", async () => {
    const { rerender } = renderComposer();
    const input = screen.getByRole("textbox");
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(outsideButton).toHaveFocus();

    act(() => {
      useAppStore.getState().requestComposerFocus(secondGuiThread.id);
    });
    rerender(
      composerElement({
        thread: secondGuiThread,
        onSubmitInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    );

    await waitFor(() => expect(input).toHaveFocus());
    outsideButton.remove();
  });

  it("does not focus a reused composer without an explicit request", () => {
    const { rerender } = renderComposer();
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    rerender(
      composerElement({
        thread: secondGuiThread,
        onSubmitInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    );

    expect(outsideButton).toHaveFocus();
    outsideButton.remove();
  });

  it("defers an explicit focus request while the terminal composer is collapsed", async () => {
    useSharedSettings.setState({ collapseTerminalComposer: true });
    renderComposer({ thread: terminalThread, agentStatus: claudeTerminalStatus });
    const input = screen.getByRole("textbox", { hidden: true });
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    act(() => {
      useAppStore.getState().requestComposerFocus(terminalThread.id);
    });
    expect(input).not.toHaveFocus();
    expect(useAppStore.getState().pendingComposerFocusThreadId).toBe(terminalThread.id);

    fireEvent.click(screen.getByRole("button", { name: "Show composer" }));

    await waitFor(() => {
      expect(input).toHaveFocus();
      expect(useAppStore.getState().pendingComposerFocusThreadId).toBeNull();
    });
    outsideButton.remove();
  });

  it("drops an explicit focus request on compact touch surfaces instead of focusing", async () => {
    bridgeMock.isCompactClientSurface.mockReturnValue(true);
    renderComposer();
    const input = screen.getByRole("textbox");
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    act(() => {
      useAppStore.getState().requestComposerFocus(guiThread.id);
    });

    // The compact dock owns focus via the guarded tap choreography; a deferred
    // raw focus() would land mid keyboard-rise and iOS pans the page for it.
    await waitFor(() => {
      expect(useAppStore.getState().pendingComposerFocusThreadId).toBeNull();
    });
    expect(input).not.toHaveFocus();
    expect(outsideButton).toHaveFocus();
    outsideButton.remove();
  });

  it("lets desktop PWA input opt into autofocus without enabling it for touch", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    const { unmount } = renderComposer({ autoFocusComposer: false });
    expect(screen.getByRole("textbox")).not.toHaveFocus();
    unmount();

    renderComposer({ autoFocusComposer: true });
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("does not let an older thread's failed submit overwrite the reused composer", async () => {
    let rejectSubmit: ((reason: Error) => void) | undefined;
    const onSubmitInput = vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSubmit = reject;
        }),
    );
    const { rerender } = renderComposer({ onSubmitInput });
    const firstInput = screen.getByRole("textbox");
    firstInput.appendChild(document.createTextNode("send from first"));
    fireEvent.input(firstInput);
    fireEvent.click(screen.getByText("send"));
    await waitFor(() => expect(onSubmitInput).toHaveBeenCalledOnce());

    rerender(composerElement({ thread: secondGuiThread, onSubmitInput }));
    const secondInput = screen.getByRole("textbox");
    secondInput.appendChild(document.createTextNode("keep in second"));
    fireEvent.input(secondInput);
    await act(async () => {
      rejectSubmit?.(new Error("send failed"));
      await Promise.resolve();
    });

    expect(secondInput).toHaveTextContent("keep in second");
    expect(useAppStore.getState().threadDraftContents[guiThread.id]?.segments).toEqual([
      { kind: "text", content: "send from first" },
    ]);
  });

  it("checkpoints an active GUI draft before unmount and removes it after sending", async () => {
    const { onSubmitInput } = renderComposer();
    typeComposerText(screen.getByRole("textbox"), "reload 日本語");
    window.dispatchEvent(new Event("pagehide"));
    expect(composerDraftStorage()?.load("thread")[guiThread.id]?.segments).toEqual([
      { kind: "text", content: "reload 日本語" },
    ]);
    fireEvent.click(screen.getByText("send"));
    await waitFor(() => expect(onSubmitInput).toHaveBeenCalled());
    composerDraftStorage()?.flush();
    expect(composerDraftStorage()?.load("thread")[guiThread.id]).toBeUndefined();
  });

  it("does not leave a draft behind once the message is sent", async () => {
    const { unmount, onSubmitInput } = renderComposer();

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("ship it"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("ship it", [{ kind: "text", content: "ship it" }]);
    });

    unmount();

    expect(useAppStore.getState().threadDraftContents[guiThread.id]).toBeUndefined();
  });

  describe("prompt recall", () => {
    function seedPrompts(threadId: string, contents: CanonicalContentBlock[][]) {
      const items = contents.map((content, index) => ({
        id: `user-${index}`,
        type: "user_message" as const,
        state: "completed" as const,
        streams: {},
        payload: { content },
      }));
      useAppStore.setState({
        runtimeItemIdsByThread: { [threadId]: items.map((item) => item.id) },
        runtimeItemsByIdByThread: {
          [threadId]: Object.fromEntries(items.map((item) => [item.id, item])),
        },
      });
    }

    function seedTextPrompts(threadId: string, texts: string[]) {
      seedPrompts(
        threadId,
        texts.map((text) => [{ kind: "text", text }]),
      );
    }

    function press(editor: HTMLElement, key: "ArrowUp" | "ArrowDown") {
      fireEvent.keyDown(editor, { key });
    }

    it("steps through the thread's prompts with Up and Down from an empty composer", () => {
      seedTextPrompts(guiThread.id, ["first", "second"]);
      renderComposer();
      const input = screen.getByRole("textbox");

      press(input, "ArrowUp");
      expect(input.textContent).toBe("second");
      press(input, "ArrowUp");
      expect(input.textContent).toBe("first");
      press(input, "ArrowDown");
      expect(input.textContent).toBe("second");
      press(input, "ArrowDown");
      expect(input.textContent).toBe("");
    });

    it("leaves Up to the caret when the composer has a draft", () => {
      seedTextPrompts(guiThread.id, ["sent before"]);
      renderComposer();
      const input = screen.getByRole("textbox");
      typeComposerText(input, "half-written");

      press(input, "ArrowUp");

      expect(input.textContent).toBe("half-written");
    });

    it("stops browsing once the recalled prompt is edited", () => {
      seedTextPrompts(guiThread.id, ["first", "second"]);
      renderComposer();
      const input = screen.getByRole("textbox");

      press(input, "ArrowUp");
      typeComposerText(input, "second, edited");
      press(input, "ArrowUp");

      expect(input.textContent).toBe("second, edited");
    });

    it("moves through a multi-line prompt before stepping to the next one", () => {
      seedTextPrompts(guiThread.id, ["older", "line one\nline two"]);
      renderComposer();
      const input = screen.getByRole("textbox");

      press(input, "ArrowUp");
      expect(input.textContent).toBe("line oneline two");
      // The caret lands on the first line, so Down belongs to the editor.
      press(input, "ArrowDown");
      expect(input.textContent).toBe("line oneline two");
      press(input, "ArrowUp");
      expect(input.textContent).toBe("older");
    });

    it("restores a recalled prompt's attachments for resend", async () => {
      seedPrompts(guiThread.id, [
        [
          { kind: "text", text: "see this" },
          {
            kind: "image",
            path: "C:\\tmp\\shot",
            mimeType: "image/png",
            dataUrl: "",
            source: "attachment",
          },
        ],
      ]);
      const { onSubmitInput } = renderComposer();

      press(screen.getByRole("textbox"), "ArrowUp");
      fireEvent.click(screen.getByText("send"));

      await waitFor(() => {
        expect(onSubmitInput).toHaveBeenCalledWith("see this", [
          { kind: "attachment", path: "C:\\tmp\\shot", mimeType: "image/png" },
          { kind: "text", content: "see this" },
        ]);
      });
    });

    it("keeps its place when a new prompt lands while browsing", () => {
      seedTextPrompts(guiThread.id, ["first", "second"]);
      renderComposer();
      const input = screen.getByRole("textbox");

      press(input, "ArrowUp");
      act(() => seedTextPrompts(guiThread.id, ["first", "second", "queued follow-up"]));
      press(input, "ArrowUp");

      expect(input.textContent).toBe("first");
    });

    it("leaves the arrows to terminal threads", () => {
      seedTextPrompts(terminalThread.id, ["sent before"]);
      renderComposer({ thread: terminalThread, agentStatus: claudeTerminalStatus });
      const input = screen.getByRole("textbox");

      press(input, "ArrowUp");

      expect(input.textContent).toBe("");
    });

    it("ends browsing when the user leaves the thread", () => {
      seedTextPrompts(guiThread.id, ["first", "second"]);
      const { rerender } = renderComposer();
      const input = screen.getByRole("textbox");

      press(input, "ArrowUp");
      rerender(composerElement({ thread: secondGuiThread }));
      rerender(composerElement());
      press(screen.getByRole("textbox"), "ArrowUp");

      expect(screen.getByRole("textbox").textContent).toBe("second");
    });
  });

  it("does not re-save an in-flight terminal send as a stale draft when navigating away", async () => {
    // Terminal threads clear the composer only after the send resolves, so the
    // checkpoint must skip saving while a submit is in flight.
    let resolveSubmit: (() => void) | undefined;
    const onSubmitInput = vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const { unmount } = renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
      onSubmitInput,
    });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("terminal message"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("terminal message", [
        { kind: "text", content: "terminal message" },
      ]);
    });

    // Send is still pending — navigating away must not stash the sent text.
    unmount();
    expect(useAppStore.getState().threadDraftContents[terminalThread.id]).toBeUndefined();

    await act(async () => {
      resolveSubmit?.();
      await Promise.resolve();
    });
  });

  it("defers a terminal thread's draft restore until the composer mounts after launching", async () => {
    useAppStore.setState({
      threadDraftContents: {
        [terminalThread.id]: {
          segments: [{ kind: "text", content: "resume me" }],
          attachments: [],
        },
      },
    });

    const { rerender } = render(
      composerElement({
        thread: { ...terminalThread, status: "launching" },
        agentStatus: claudeTerminalStatus,
      }),
    );

    // While launching, the terminal composer (and its editor) is not rendered,
    // so the draft must be left intact rather than silently consumed.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(useAppStore.getState().threadDraftContents[terminalThread.id]).toBeDefined();

    // Same instance leaves launching → editor mounts → draft restores + consumes.
    rerender(composerElement({ thread: terminalThread, agentStatus: claudeTerminalStatus }));

    await waitFor(() => {
      expect(screen.getByRole("textbox").textContent).toContain("resume me");
    });
    expect(useAppStore.getState().threadDraftContents[terminalThread.id]?.segments).toEqual([
      { kind: "text", content: "resume me" },
    ]);
  });

  it("clears the GUI ACP composer as soon as a direct send starts", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmitInput = vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={onSubmitInput}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("slow send"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    expect(input.textContent).toBe("");
    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("slow send", [
        { kind: "text", content: "slow send" },
      ]);
    });

    await act(async () => {
      resolveSubmit?.();
      await Promise.resolve();
    });
  });

  it("reports active-thread send failures and restores the GUI composer", async () => {
    const onSubmitInput = vi
      .fn<(prompt: string, segments?: unknown) => Promise<void>>()
      .mockRejectedValue(new Error("send failed"));

    renderComposer({ onSubmitInput });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("retry me"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("send failed");
    });
    expect(screen.getByRole("textbox")).toHaveTextContent("retry me");
  });

  it("restores a pasted image preview from its saved path when a GUI send fails", async () => {
    // jsdom does not implement object URLs.
    const createObjectURL = vi.fn<(source: File) => string>(() => "blob:app/pasted-1");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const saveClipboardImage = vi.fn<SaveClipboardImage>(() =>
      Promise.resolve("C:\\attachments\\thread-gui-idle\\image-1.png"),
    );
    const onSubmitInput = vi
      .fn<(prompt: string, segments?: unknown) => Promise<void>>()
      .mockRejectedValue(new Error("send failed"));
    try {
      renderComposer({ onSubmitInput, saveClipboardImage });
      const input = screen.getByRole("textbox");
      pasteImageFile(
        input,
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );
      await screen.findByAltText("Image 1.png");
      typeComposerText(input, "with a note");

      fireEvent.click(screen.getByText("send"));

      await waitFor(() => {
        expect(toastDangerSpy).toHaveBeenCalledWith("send failed");
      });
      // The pre-send clear revoked the pasted bytes' object URL, so the
      // restored attachment must render from the durable saved file.
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
      expect(screen.getByAltText("Image 1.png")).toHaveAttribute(
        "src",
        "poracode-local://local/C:/attachments/thread-gui-idle/image-1.png",
      );
    } finally {
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("stashes a failed send attachment when switching threads before rejection", async () => {
    // jsdom does not implement object URLs.
    const createObjectURL = vi.fn<(source: File) => string>(() => "blob:app/pasted-1");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const saveClipboardImage = vi.fn<SaveClipboardImage>(() =>
      Promise.resolve("C:\\attachments\\thread-gui-idle\\image-1.png"),
    );
    let rejectSubmit: ((error: Error) => void) | undefined;
    const onSubmitInput = vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(
      () =>
        new Promise<void>((_, reject) => {
          rejectSubmit = reject;
        }),
    );
    try {
      const { rerender } = renderComposer({ onSubmitInput, saveClipboardImage });
      const input = screen.getByRole("textbox");
      pasteImageFile(
        input,
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );
      await screen.findByAltText("Image 1.png");
      typeComposerText(input, "with a note");
      fireEvent.click(screen.getByText("send"));
      await waitFor(() => expect(onSubmitInput).toHaveBeenCalled());

      rerender(composerElement({ thread: secondGuiThread, onSubmitInput, saveClipboardImage }));
      await act(async () => {
        rejectSubmit?.(new Error("send failed"));
        await Promise.resolve();
      });
      await waitFor(() => expect(toastDangerSpy).toHaveBeenCalledWith("send failed"));

      const savedDraft = useAppStore.getState().threadDraftContents[guiThread.id];
      expect(savedDraft?.attachments).toHaveLength(1);
      expect(savedDraft?.attachments[0]).not.toHaveProperty("previewUrl");
      expect(savedDraft?.attachments[0]?.path).toBe(
        "C:\\attachments\\thread-gui-idle\\image-1.png",
      );
      composerDraftStorage()?.flush();
      expect(composerDraftStorage()?.load("thread")[guiThread.id]).toEqual(savedDraft);
    } finally {
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("counts a pending steer after it is successfully staged", async () => {
    renderComposer({
      thread: { ...guiThread, status: "working", attention: "working" },
    });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("change direction"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(bridgeMock.setPendingSteer).toHaveBeenCalledWith({
        threadId: guiThread.id,
        prompt: "change direction",
        segments: [{ kind: "text", content: "change direction" }],
        config: guiThread.config,
      });
    });
    expect(analytics.captureThreadPromptSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ id: guiThread.id }),
      "change direction",
      [{ kind: "text", content: "change direction" }],
      "pending_steer",
    );
  });

  it("queues a working thread's message and attachments when Queue is the default", async () => {
    useSharedSettings.setState({ followUpBehavior: "queue" });
    renderComposer({ thread: { ...guiThread, status: "working", attention: "working" } });
    act(() =>
      useRevertedPromptStore.getState().restore(guiThread.id, [
        { kind: "text", text: "do this next" },
        {
          kind: "image",
          path: "C:\\attachments\\shot.png",
          mimeType: "image/png",
          dataUrl: "",
          source: "attachment",
        },
      ]),
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() =>
      expect(bridgeMock.queueThreadFollowUp).toHaveBeenCalledWith({
        threadId: guiThread.id,
        prompt: "do this next",
        config: guiThread.config,
        segments: [
          { kind: "attachment", path: "C:\\attachments\\shot.png", mimeType: "image/png" },
          { kind: "text", content: "do this next" },
        ],
      }),
    );
    expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
    expect(bridgeMock.interruptThread).not.toHaveBeenCalled();
  });

  describe("surface client context", () => {
    const clientContext = {
      browserFocus: { activeTab: { tabId: 8, title: "Docs", url: "https://docs.test/" } },
    };

    function renderWithContext(thread: Thread) {
      const capture = vi.fn<TurnClientContextCapture>(async () => clientContext);
      render(
        <TurnClientContextSource value={capture}>
          {composerElement({ thread })}
        </TurnClientContextSource>,
      );
      return capture;
    }

    it("captures once at submit and sends it with an ordinary message", async () => {
      const capture = renderWithContext(guiThread);
      const editor = screen.getByRole("textbox");
      typeComposerText(editor, "explain this page");
      fireEvent.click(screen.getByText("send"));
      expect(capture).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(runtimeActions.submitThreadInput).toHaveBeenCalledWith(
          guiThread.id,
          "explain this page",
          [{ kind: "text", content: "explain this page" }],
          { clientContext },
        ),
      );
    });

    it("retains it with a staged steer", async () => {
      renderWithContext({ ...guiThread, status: "working", attention: "working" });
      typeComposerText(screen.getByRole("textbox"), "change direction");
      fireEvent.click(screen.getByText("send"));
      await waitFor(() =>
        expect(bridgeMock.setPendingSteer).toHaveBeenCalledWith({
          threadId: guiThread.id,
          prompt: "change direction",
          segments: [{ kind: "text", content: "change direction" }],
          config: guiThread.config,
          clientContext,
        }),
      );
    });

    it("retains it with a queued follow-up", async () => {
      useSharedSettings.setState({ followUpBehavior: "queue" });
      renderWithContext({ ...guiThread, status: "working", attention: "working" });
      typeComposerText(screen.getByRole("textbox"), "after this");
      fireEvent.click(screen.getByText("send"));
      await waitFor(() =>
        expect(bridgeMock.queueThreadFollowUp).toHaveBeenCalledWith({
          threadId: guiThread.id,
          prompt: "after this",
          config: guiThread.config,
          segments: [{ kind: "text", content: "after this" }],
          clientContext,
        }),
      );
    });

    it("sends no context from a surface that provides none", async () => {
      render(composerElement({ thread: guiThread }));
      typeComposerText(screen.getByRole("textbox"), "desktop send");
      fireEvent.click(screen.getByText("send"));
      await waitFor(() => expect(runtimeActions.submitThreadInput).toHaveBeenCalled());
      expect(runtimeActions.submitThreadInput.mock.calls.at(-1)).toEqual([
        guiThread.id,
        "desktop send",
        [{ kind: "text", content: "desktop send" }],
        { clientContext: undefined },
      ]);
    });
  });

  it.each([
    ["steer", "ctrlKey"],
    ["steer", "metaKey"],
    ["queue", "ctrlKey"],
    ["queue", "metaKey"],
  ] as const)(
    "uses the opposite of %s for %s+Enter without changing the default",
    async (behavior, modifier) => {
      useSharedSettings.setState({ followUpBehavior: behavior });
      renderComposer({ thread: { ...guiThread, status: "working", attention: "working" } });
      const editor = screen.getByRole("textbox");
      typeComposerText(editor, "one-time override");
      fireEvent.keyDown(editor, { key: "Enter", [modifier]: true });
      const expected =
        behavior === "steer" ? bridgeMock.queueThreadFollowUp : bridgeMock.setPendingSteer;
      const unused =
        behavior === "steer" ? bridgeMock.setPendingSteer : bridgeMock.queueThreadFollowUp;
      await waitFor(() =>
        expect(expected).toHaveBeenCalledWith(
          expect.objectContaining({
            threadId: guiThread.id,
            prompt: "one-time override",
          }),
        ),
      );
      expect(unused).not.toHaveBeenCalled();
      expect(useSharedSettings.getState().followUpBehavior).toBe(behavior);
    },
  );

  it("leaves a pending approval open when queueing a follow-up", async () => {
    useSharedSettings.setState({ followUpBehavior: "queue" });
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "approval-before-queue",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run first" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });
    const { onSubmitInput } = renderComposer({
      thread: { ...guiThread, status: "needs_approval" },
    });
    typeComposerText(screen.getByRole("textbox"), "after this approval");
    fireEvent.click(screen.getByText("send"));
    await waitFor(() => expect(bridgeMock.queueThreadFollowUp).toHaveBeenCalled());
    expect(runtimeActions.resolveThreadServerRequest).not.toHaveBeenCalled();
    expect(onSubmitInput).not.toHaveBeenCalled();
    expect(useAppStore.getState().runtimeRequestsByThread[guiThread.id]).toHaveLength(1);
  });

  it("uses the follow-up override while slash autocomplete is open", async () => {
    renderComposer({
      thread: {
        ...guiThread,
        status: "working",
        slashCommands: [{ id: "review", label: "Review code", section: "skills" }],
      },
    });
    const editor = screen.getByRole("textbox");
    typeComposerText(editor, "/rev");
    expect(await screen.findByRole("option", { name: /review/i })).toBeInTheDocument();
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    await waitFor(() =>
      expect(bridgeMock.queueThreadFollowUp).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "/rev" }),
      ),
    );
    expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
  });

  it("restores the draft if the queue request fails", async () => {
    useSharedSettings.setState({ followUpBehavior: "queue" });
    bridgeMock.queueThreadFollowUp.mockRejectedValueOnce(new Error("Queue unavailable"));
    renderComposer({ thread: { ...guiThread, status: "working" } });
    typeComposerText(screen.getByRole("textbox"), "keep this message");
    fireEvent.click(screen.getByText("send"));
    await waitFor(() => expect(toastDangerSpy).toHaveBeenCalledWith("Queue unavailable"));
    expect(screen.getByRole("textbox")).toHaveTextContent("keep this message");
    expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
  });

  it.each([
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 },
  ])(
    "does not apply GUI follow-up shortcuts to IME confirmation (isComposing=$isComposing, keyCode=$keyCode)",
    async (compositionFlags) => {
      renderComposer({ thread: { ...guiThread, status: "working" } });
      const editor = screen.getByRole("textbox");
      typeComposerText(editor, "unfinished input");
      for (const modifier of ["ctrlKey", "metaKey"] as const) {
        const confirmation = keyDownAt(
          editor,
          {
            key: "Enter",
            [modifier]: true,
            ...compositionFlags,
          },
          100,
        );
        fireEvent(editor, confirmation);
        const replay = keyDownAt(editor, { key: "Enter", [modifier]: true, keyCode: 13 }, 100);
        fireEvent(editor, replay);
        await act(async () => Promise.resolve());
        expect(confirmation.defaultPrevented).toBe(false);
        expect(replay.defaultPrevented).toBe(true);
        expect(bridgeMock.queueThreadFollowUp).not.toHaveBeenCalled();
        expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
        expect(editor).toHaveTextContent("unfinished input");
      }

      const nextPress = keyDownAt(editor, { key: "Enter", ctrlKey: true, keyCode: 13 }, 101);
      fireEvent(editor, nextPress);
      await waitFor(() =>
        expect(bridgeMock.queueThreadFollowUp).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ prompt: "unfinished input" }),
        ),
      );
      expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
    },
  );

  it("does not submit or steer while a stored GUI session is reconnecting", async () => {
    useAppStore.setState({ connectingThreadIds: { [guiThread.id]: "connection-1" } });
    const onSubmitInput = vi
      .fn<(prompt: string, segments?: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    renderComposer({ onSubmitInput });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("wait for connection"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));
    await act(async () => Promise.resolve());

    expect(onSubmitInput).not.toHaveBeenCalled();
    expect(bridgeMock.setPendingSteer).not.toHaveBeenCalled();
    expect(input).toHaveTextContent("wait for connection");
  });

  it("restores approval requests and composer text when auto-deny before submit fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runtimeActions.resolveThreadServerRequest.mockRejectedValueOnce(new Error("deny failed"));
    const onSubmitInput = vi
      .fn<(prompt: string, segments?: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "approval-before-submit",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run first" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer({ onSubmitInput });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("do this instead"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("deny failed");
    });
    expect(onSubmitInput).not.toHaveBeenCalled();
    expect(screen.getByText("Run first")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveTextContent("do this instead");
    expect(useAppStore.getState().runtimeRequestsByThread[guiThread.id]).toEqual([
      expect.objectContaining({ requestId: "approval-before-submit" }),
    ]);
    consoleError.mockRestore();
  });

  it("shows an auth row and blocks active-thread input when the agent needs login", () => {
    const onSubmitInput = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={{ ...codexGuiStatus, authState: "missing", loginCommand: "codex login" }}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={onSubmitInput}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("should not send"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    expect(onSubmitInput).not.toHaveBeenCalled();
  });

  it("shows compact authentication as a key bubble that opens the sign-in card", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: query === "(max-width: 767px)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      })),
    );

    renderComposer({
      agentStatus: { ...codexGuiStatus, authState: "missing", loginCommand: "codex login" },
    });

    const authBubble = screen.getByRole("button", { name: "Sign in required" });
    expect(authBubble.parentElement).toHaveClass("m-chip-row__trailing");
    expect(authBubble.parentElement?.lastElementChild).toBe(authBubble);
    expect(screen.queryByText("Codex: Run codex login before this thread can run.")).toBeNull();

    fireEvent.click(authBubble);

    expect(authBubble).toHaveAttribute("aria-expanded", "true");
    const description = screen.getByText("Codex: Run codex login before this thread can run.");
    expect(description).toBeVisible();
    expect(description).toHaveClass("line-clamp-2", "whitespace-normal");
    expect(description).not.toHaveClass("truncate");
    expect(description.parentElement).toHaveAttribute("data-stacked", "true");
    expect(screen.getByRole("button", { name: "Login" })).toBeVisible();
  });

  it("shows a concise command in the auth dock for wrapped WSL login", () => {
    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={{
          ...codexGuiStatus,
          authState: "missing",
          loginCommand: "wsl.exe -d 'Ubuntu' --exec bash -l -i -c 'muse login'",
          loginCommandDisplay: "muse login",
        }}
        projectLocation={{ kind: "windows", path: "C:\\repo" }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    expect(
      screen.getByText("Codex: Run muse login before this thread can run."),
    ).toBeInTheDocument();
  });

  it("keeps remote auth docks actionable without desktop-only login controls", async () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: terminalThread,
      agentStatus: {
        ...claudeTerminalStatus,
        authState: "missing",
        loginCommand: "claude login",
      },
    });

    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(
      screen.getByText("Claude: Sign in on the paired desktop, then refresh this status."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh Claude authentication" }));

    await waitFor(() => {
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledTimes(1);
    });
  });

  it("refreshes the owning remote desktop after remote agent authentication", async () => {
    const refreshServer = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const originalRefreshServer = useRemoteServersStore.getState().refreshServer;
    useRemoteServersStore.setState({ refreshServer });
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Remote repo",
          location: { kind: "posix", path: "/repo", remoteServerId: "desktop-1" },
          remoteServerId: "desktop-1",
          remoteId: "remote-project-1",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    renderComposer({
      thread: { ...terminalThread, remoteServerId: "desktop-1", remoteId: "remote-thread-1" },
      agentStatus: {
        ...claudeTerminalStatus,
        authState: "missing",
        loginCommand: "claude auth login",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    const onCommandComplete =
      loginActions.runAgentLoginCommand.mock.calls[0]?.[0].onCommandComplete;
    expect(onCommandComplete).toBeDefined();
    act(() => onCommandComplete?.(0));

    await waitFor(() => expect(refreshServer).toHaveBeenCalledWith("desktop-1"));
    expect(bridgeMock.refreshAgentStatuses).not.toHaveBeenCalled();
    useRemoteServersStore.setState({ refreshServer: originalRefreshServer });
  });

  it("disables desktop-local attachment drops in remote sessions", () => {
    renderComposer();
    expect(screen.getByTestId("attach-files-enabled")).toHaveTextContent("yes");

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer();
    expect(screen.getAllByTestId("attach-files-enabled").at(-1)!).toHaveTextContent("no");
  });

  it("shows generic error docks for remote terminal sessions only", () => {
    const errorDockStates = [{ sourceItemId: "err-1", message: "Tool failed remotely." }];
    const { unmount } = renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
      errorDockStates,
    });

    expect(screen.queryByText("Tool failed remotely.")).not.toBeInTheDocument();
    unmount();

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
      errorDockStates,
    });

    expect(screen.getByText("Tool failed remotely.")).toBeInTheDocument();
  });

  it("keeps runtime approval requests actionable in remote terminal sessions", async () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    useAppStore.setState({
      runtimeRequestsByThread: {
        [terminalThread.id]: [
          {
            requestId: "terminal-approval",
            threadId: terminalThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run mobile terminal command" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
    });

    expect(screen.getByText("Run mobile terminal command")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(terminalThread.id, {
        requestId: "terminal-approval",
        method: "requestPermission",
        response: { optionId: "allow" },
        analytics: {
          outcome: "accepted",
          requestType: "command_execution_approval",
        },
      });
    });
  });

  it("restores runtime approval requests when resolving fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runtimeActions.resolveThreadServerRequest.mockRejectedValueOnce(new Error("approval failed"));
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "approval-fails",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run fragile command" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("approval failed");
    });
    expect(screen.getByText("Run fragile command")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
    expect(useAppStore.getState().runtimeRequestsByThread[guiThread.id]).toEqual([
      expect.objectContaining({ requestId: "approval-fails" }),
    ]);
    consoleError.mockRestore();
  });

  it("shows todo and goal docks in remote terminal sessions only", () => {
    const terminalTodoDockState = {
      sourceItemId: "plan-1",
      itemState: "completed" as const,
      steps: [{ text: "Patch mobile runtime chrome", status: "pending" as const }],
      activeIndex: 0,
      sourceKind: "steps" as const,
    };
    const terminalGoalDockState = {
      sourceItemId: "goal-1",
      itemState: "completed" as const,
      objective: "No mobile dead ends",
      status: "active" as const,
      action: "set" as const,
    };
    const renderTerminalDocks = () =>
      render(
        <ThreadComposerSection
          threadId={terminalThread.id}
          fallbackThread={terminalThread}
          agentStatus={claudeTerminalStatus}
          projectLocation={{ kind: "windows", path: "C:\\repo" }}
          paneCount={1}
          terminalPaneRef={{ current: null }}
          todoDockCollapsed={false}
          docksPlacement="composer"
          todoDockState={terminalTodoDockState}
          goalDockState={terminalGoalDockState}
          errorDockStates={[]}
          onGoalDockDismiss={() => undefined}
          onDismissError={() => undefined}
          onSubmitInput={async () => undefined}
          onTodoDockCollapsedChange={() => undefined}
        />,
      );

    const { unmount } = renderTerminalDocks();
    expect(screen.queryByLabelText("Thread todo dock")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Thread goal dock")).not.toBeInTheDocument();
    unmount();

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderTerminalDocks();

    expect(screen.getByLabelText("Thread todo dock")).toHaveTextContent(
      "Patch mobile runtime chrome",
    );
    expect(screen.getByLabelText("Thread goal dock")).toHaveTextContent("No mobile dead ends");
  });

  it.each(["different thread", "return to the same thread", "next turn"] as const)(
    "keeps the newer GUI Stop pending after an old failure: %s",
    async (scenario) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      let rejectOld!: (error: Error) => void;
      bridgeMock.interruptThread
        .mockImplementationOnce(
          () =>
            new Promise<void>((_, reject) => {
              rejectOld = reject;
            }),
        )
        .mockImplementationOnce(() => new Promise<void>(() => {}));
      const first = {
        ...guiThread,
        id: "stop-owner-a",
        status: "working",
        attention: "working",
      } as Thread;
      const second = { ...first, id: "stop-owner-b" };
      try {
        const { rerender } = renderComposer({ thread: first });
        fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
        expect(bridgeMock.interruptThread).toHaveBeenCalledTimes(1);
        if (scenario === "next turn") {
          rerender(composerElement({ thread: { ...first, status: "idle", attention: "none" } }));
          rerender(composerElement({ thread: first }));
        } else {
          rerender(composerElement({ thread: second }));
          if (scenario === "return to the same thread")
            rerender(composerElement({ thread: first }));
        }
        fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
        expect(bridgeMock.interruptThread).toHaveBeenCalledTimes(2);
        await act(async () => {
          rejectOld(new Error("old interrupt failed"));
        });
        fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
        expect(bridgeMock.interruptThread).toHaveBeenCalledTimes(2);
        // The old error is still reported; it simply cannot release the new Stop.
        expect(toastDangerSpy).toHaveBeenCalledWith("old interrupt failed");
      } finally {
        consoleError.mockRestore();
      }
    },
  );

  it("captures a successful remote terminal interrupt", async () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: {
        ...terminalThread,
        id: "thread-terminal-working",
        status: "working",
        attention: "working",
      },
      agentStatus: claudeTerminalStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));

    expect(bridgeMock.interruptThread).toHaveBeenCalledWith({
      threadId: "thread-terminal-working",
    });
    await waitFor(() => {
      expect(analytics.captureProductEvent).toHaveBeenCalledWith(
        "thread.interrupted",
        expect.objectContaining({ provider: "claude" }),
      );
    });
  });

  it("reports failed remote terminal interrupts instead of only logging them", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bridgeMock.isRemoteSession.mockReturnValue(true);
    bridgeMock.interruptThread.mockRejectedValueOnce(new Error("interrupt failed"));
    renderComposer({
      thread: {
        ...terminalThread,
        id: "thread-terminal-working",
        status: "working",
        attention: "working",
      },
      agentStatus: claudeTerminalStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("interrupt failed");
    });
    expect(analytics.captureProductEvent).not.toHaveBeenCalledWith(
      "thread.interrupted",
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  it("reports failed pending steer cancellation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bridgeMock.clearPendingSteer.mockRejectedValueOnce(new Error("cancel failed"));
    useAppStore.setState({
      pendingSteerByThreadId: {
        [guiThread.id]: {
          id: "pending-1",
          prompt: "Actually inspect the diff first",
          stagedAt: Date.now() - 2_000,
        },
      },
    });

    renderComposer({
      thread: { ...guiThread, status: "working", attention: "working" },
      agentStatus: codexGuiStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel pending steer" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("cancel failed");
    });
    expect(bridgeMock.clearPendingSteer).toHaveBeenCalledWith({ threadId: guiThread.id });
    consoleError.mockRestore();
  });

  it("keeps queued runtime approval requests actionable after resolving the first one", async () => {
    let resolveRequest: (() => void) | undefined;
    runtimeActions.resolveThreadServerRequest.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "r1",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run first command" },
            receivedAt: new Date().toISOString(),
          },
          {
            requestId: "r2",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run second command" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    expect(screen.getByText("Run first command")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(screen.getByText("Run second command")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();

    await act(async () => {
      resolveRequest?.();
      await Promise.resolve();
    });
  });

  it("routes plan file opens through the mobile workspace callback when provided", () => {
    const onOpenProjectRelativePath = vi.fn<(path: string, lineNumber?: number) => void>();
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: { kind: "windows", path: "C:\\repo" },
          createdAt: new Date().toISOString(),
        },
      ],
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "plan-approval",
            threadId: guiThread.id,
            requestType: "tool_user_input",
            payload: {
              summary: "Proposed plan",
              details: {
                toolName: "ExitPlanMode",
                input: {
                  planFilePath: "C:\\Users\\sdsle\\.claude\\plans\\plan.md",
                },
              },
              options: [
                { optionId: "deny", label: "No, keep planning" },
                { optionId: "default", label: "Yes, and manually approve edits" },
              ],
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer({ onOpenProjectRelativePath });

    fireEvent.click(screen.getByRole("button", { name: "Open plan" }));

    expect(onOpenProjectRelativePath).toHaveBeenCalledWith(
      "C:\\Users\\sdsle\\.claude\\plans\\plan.md",
    );
  });

  it("renders multi-question user input forms with answer options instead of approval fallback buttons", async () => {
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "claude-question-1",
            threadId: guiThread.id,
            requestType: "tool_user_input",
            payload: {
              summary: "Which split scope should I execute?",
              details: {
                userInputForm: {
                  questions: [
                    {
                      question: "Which split scope should I execute?",
                      header: "Scope",
                      options: [
                        {
                          optionId: "Scope A: minimal",
                          label: "Scope A: minimal",
                          description: "Add the runtime package only.",
                        },
                        {
                          optionId: "Scope B: app-only",
                          label: "Scope B: app-only",
                          description: "Move desktop app source only.",
                        },
                      ],
                    },
                    {
                      question: "Should I run validation after each phase?",
                      header: "Validation cadence",
                      options: [
                        {
                          optionId: "After each phase",
                          label: "After each phase",
                          description: "Land in incremental chunks.",
                        },
                      ],
                    },
                  ],
                },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    expect(screen.getByText("Scope A: minimal")).toBeInTheDocument();
    expect(screen.queryByText("After each phase")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Scope A: minimal"));
    expect(screen.getByText("After each phase")).toBeInTheDocument();
    fireEvent.click(screen.getByText("After each phase"));
    fireEvent.click(screen.getByRole("tab", { name: /Scope/ }));
    fireEvent.click(screen.getByText("Scope B: app-only"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(guiThread.id, {
        requestId: "claude-question-1",
        method: "requestPermission",
        response: {
          answers: {
            "Which split scope should I execute?": "Scope B: app-only",
            "Should I run validation after each phase?": "After each phase",
          },
        },
        analytics: {
          outcome: "answered",
          requestType: "tool_user_input",
        },
      });
    });
  });

  it("keeps long permission details in a scrollable region so actions remain available", () => {
    const longCommand = Array.from({ length: 60 }, (_, index) => `patch line ${index + 1}`).join(
      "\n",
    );
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "approval-long",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: {
              summary: "Permission required",
              details: {
                toolName: "Edit",
                input: { command: longCommand },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    const details = screen.getByRole("region", { name: "Request details" });
    expect(details).toHaveClass("overflow-y-auto");
    expect(details).toHaveClass("max-h-[min(12rem,35vh)]");
    expect(screen.getByRole("button", { name: "Allow" })).toHaveClass("button--tertiary");
    expect(screen.getByRole("button", { name: "Deny" })).toHaveClass("button--ghost");
  });

  it("submits Codex multi-question user input in Codex-native response shape", async () => {
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "codex-question-1",
            threadId: guiThread.id,
            requestType: "tool_user_input",
            payload: {
              summary: "Input requested",
              details: {
                codexUserInput: {
                  questions: [
                    {
                      id: "scope",
                      header: "Scope",
                      question: "Which scope?",
                      options: [{ label: "Scope A", description: "Minimal" }],
                    },
                    {
                      id: "validation",
                      header: "Validation",
                      question: "Which validation?",
                      options: [{ label: "After each phase", description: "Incremental" }],
                    },
                  ],
                },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText("Scope A"));
    fireEvent.click(screen.getByText("After each phase"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(guiThread.id, {
        requestId: "codex-question-1",
        method: "requestPermission",
        response: {
          answers: {
            scope: { answers: ["Scope A"] },
            validation: { answers: ["After each phase"] },
          },
        },
        analytics: {
          outcome: "answered",
          requestType: "tool_user_input",
        },
      });
    });
  });

  it("submits ACP elicitation forms in ACP response shape", async () => {
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "acp-elicit-1",
            threadId: guiThread.id,
            requestType: "tool_user_input",
            payload: {
              summary: "Choose deployment scope",
              details: {
                acpElicitation: {
                  mode: "form",
                  message: "Choose deployment scope",
                  requestedSchema: {
                    type: "object",
                    required: ["scope"],
                    properties: {
                      scope: {
                        type: "string",
                        title: "Scope",
                        enum: ["Scope A", "Scope B"],
                      },
                      confirm: {
                        type: "boolean",
                        title: "Confirm",
                      },
                    },
                  },
                },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        docksPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
      />,
    );

    expect(screen.getByText("ACP agent needs input.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Scope$/u }));
    fireEvent.click(await screen.findByRole("option", { name: "Scope B" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(guiThread.id, {
        requestId: "acp-elicit-1",
        method: "requestPermission",
        response: {
          action: "accept",
          content: {
            scope: "Scope B",
            confirm: true,
          },
        },
        analytics: {
          outcome: "answered",
          requestType: "tool_user_input",
        },
      });
    });
  });
});
