import "@/renderer/testUtils/clientDraftDatabase";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useThread } from "@/renderer/state/useThread";
import { ThreadComposerSection } from "@/renderer/components/thread/ThreadComposerSection";
import { setOwnWindowThreadIds } from "@/renderer/state/auxiliaryThreadWindows";
import { createSupervisorEventReducer } from "@/renderer/state/remote/reducers/supervisorEventReducer";
import { ThreadWindowApp } from "./ThreadWindowApp";
import { trackThreadAttachmentImport } from "@/renderer/actions/threadWindowActions";

const mocks = vi.hoisted(() => ({
  initialLoading: false,
  submit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  hydrate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  reopen: vi.fn<() => void>(),
  refreshGit: vi.fn<(ready: boolean, projectId?: string) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
  isCompactClientSurface: () => false,
  isConversationWindow: () => true,
  isQuickComposerWindow: () => false,
  readBridge: () => ({
    windowKind: "thread",
    getThreadWindowInfo: async () => ({ threadId: "detached", title: "Detached thread" }),
    getThreadFollowUpQueue: async () => null,
    getProviderUsage: async () => undefined,
  }),
}));
vi.mock("@/renderer/hooks/useAppHydration", () => ({
  useAppHydration: () => ({ initialLoading: mocks.initialLoading }),
}));
vi.mock("@/renderer/hooks/useRemoteServerConnection", () => ({
  useRemoteServerConnection: () => ({ initialConnectSettled: true }),
}));
vi.mock("@/renderer/hooks/useGitRefresh", () => ({ useGitRefresh: mocks.refreshGit }));
vi.mock("@/renderer/actions/threadActions", () => ({ reopenStoredThread: mocks.reopen }));
vi.mock("@/renderer/actions/threadRuntimeActions", () => ({
  changeThreadConfig: vi.fn<() => void>(),
  clearThreadPendingSteer: vi.fn<() => void>(),
  resolveThreadServerRequest: vi.fn<() => void>(),
  setThreadPendingSteer: vi.fn<() => void>(),
  submitThreadInput: mocks.submit,
}));
vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  boundVisibleThreadRuntimeWindows: vi.fn<() => void>(),
  evictOversizedInactiveThreadRuntimeItems: vi.fn<() => void>(),
  forgetThreadRuntimeWindow: vi.fn<() => void>(),
  hydrateThreadRuntimeItems: mocks.hydrate,
  setHostThreadHistoryReader: vi.fn<() => void>(),
  setHostOlderRuntimePageReader: vi.fn<() => void>(),
  setOlderThreadHistoryContinuation: vi.fn<() => void>(),
  setOlderThreadHistoryInvalidation: vi.fn<() => void>(),
}));
vi.mock("@/renderer/state/dbStorage", () => ({
  createDbStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("@/renderer/components/ui/provider", () => ({
  AppProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/renderer/dnd", () => ({
  CompactDndProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/renderer/components/composer/ImageLightbox", () => ({
  ImageLightboxHost: () => null,
  updateImageLightboxFromThread: vi.fn<() => void>(),
}));
vi.mock("@/renderer/components/composer/ComposerAddMenu", () => ({ ComposerAddMenu: () => null }));
vi.mock("@/renderer/components/thread/ThreadComposer", () => ({
  resolveComposerControlIcon: () => null,
  ThreadComposer: (props: {
    inputContent: ReactNode;
    onSubmit: () => void;
    submitDisabled: boolean;
  }) => (
    <div>
      {props.inputContent}
      <button type="button" disabled={props.submitDisabled} onClick={props.onSubmit}>
        Send
      </button>
    </div>
  ),
}));
vi.mock("@/renderer/views/MainView/parts/AppContent/parts/ThreadPane", () => {
  const agentStatus: AgentStatus = {
    kind: "test-provider",
    label: "Test provider",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      settingDefs: [],
    },
  };
  return {
    ThreadPane: ({ threadId }: { threadId: string }) => {
      const thread = useThread(threadId)!;
      return (
        <ThreadComposerSection
          threadId={threadId}
          fallbackThread={thread}
          agentStatus={agentStatus}
          projectLocation={{ kind: "windows", path: "C:\\fixture" }}
          paneCount={1}
          terminalPaneRef={{ current: null }}
          todoDockCollapsed={false}
          docksPlacement="composer"
          todoDockState={null}
          goalDockState={null}
          errorDockStates={[]}
          onGoalDockDismiss={() => {}}
          onDismissError={() => {}}
          onTodoDockCollapsedChange={() => {}}
        />
      );
    },
  };
});

const thread: Thread = {
  id: "detached",
  projectId: "project-1",
  title: "Detached thread",
  agentKind: "test-provider",
  config: { model: "test-model" },
  presentationMode: "gui",
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-10-27T00:00:00Z" },
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-10-27T00:00:00Z",
  updatedAt: "2026-10-27T00:00:00Z",
};

function typePrompt(text: string) {
  const editor = screen.getByRole("textbox");
  editor.textContent = text;
  fireEvent.input(editor);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initialLoading = false;
  localStorage.clear();
  useAppStore.setState({
    threads: [thread],
    view: { kind: "home" },
    connectingThreadIds: {},
    threadDraftContents: {},
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeCompletedTurnsByThread: {},
    runtimeRequestsByThread: {},
  });
});
afterEach(() => setOwnWindowThreadIds([]));

describe("ThreadWindowApp", () => {
  it("keeps the displayed thread's Git state refreshed", async () => {
    render(<ThreadWindowApp />);
    await waitFor(() => expect(mocks.refreshGit).toHaveBeenLastCalledWith(true, thread.projectId));
  });

  it("waits for an attachment before a native close hands its draft back", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    render(<ThreadWindowApp />);
    await screen.findByRole("button", { name: "Send" });
    let finishImport!: () => void;
    const imported = trackThreadAttachmentImport(
      thread.id,
      new Promise<void>((resolve) => {
        finishImport = resolve;
      }),
    );
    const closing = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    expect(close).not.toHaveBeenCalled();
    finishImport();
    await imported;
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    close.mockRestore();
  });

  it("keeps Send usable through consecutive replies when the main window was on Home", async () => {
    const reducer = createSupervisorEventReducer({
      recovery: { recoverFromQueueOverflow: () => {}, recoverFromThreadReset: () => {} },
    });
    render(<ThreadWindowApp />);
    await screen.findByRole("textbox");

    for (const prompt of ["First prompt", "Second prompt"]) {
      typePrompt(prompt);
      const send = screen.getByRole("button", { name: "Send" });
      expect(send).toBeEnabled();
      fireEvent.click(send);
      await waitFor(() =>
        expect(mocks.submit).toHaveBeenLastCalledWith(
          thread.id,
          prompt,
          expect.any(Array),
          expect.any(Object),
        ),
      );
      await act(async () => {
        reducer.dispatch({
          type: "thread-state",
          threadId: thread.id,
          status: "working",
          attention: "working",
          canResumeWithConfig: true,
        });
        reducer.dispatch({
          type: "thread-state",
          threadId: thread.id,
          status: "idle",
          attention: "none",
          canResumeWithConfig: true,
        });
      });
      expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    }
    typePrompt("Third prompt");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    reducer.clear();
  });

  it("keeps Send usable after a link moves this window's view to another thread", async () => {
    const reducer = createSupervisorEventReducer({
      recovery: { recoverFromQueueOverflow: () => {}, recoverFromThreadReset: () => {} },
    });
    render(<ThreadWindowApp />);
    await screen.findByRole("textbox");
    act(() => {
      useAppStore.setState((state) => ({
        threads: [...state.threads, { ...thread, id: "linked-thread", title: "Linked thread" }],
      }));
      useAppStore.getState().openThreadStandalone("linked-thread");
    });
    await act(async () => {
      reducer.dispatch({
        type: "thread-state",
        threadId: thread.id,
        status: "working",
        attention: "working",
        canResumeWithConfig: true,
      });
      reducer.dispatch({
        type: "thread-state",
        threadId: thread.id,
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
      });
    });
    expect(useAppStore.getState().threads.find((row) => row.id === thread.id)?.status).toBe("idle");
    typePrompt("Still sendable");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    reducer.clear();
  });

  it("does not restart a thread that was archived or marked done", async () => {
    useAppStore.setState({ threads: [{ ...thread, status: "inactive", done: true }] });
    render(<ThreadWindowApp />);
    await screen.findByRole("textbox");
    expect(mocks.reopen).not.toHaveBeenCalled();
  });

  it("clears an unseen completion when the thread row arrives after hydration", async () => {
    mocks.initialLoading = true;
    useAppStore.setState({ threads: [] });
    const { rerender } = render(<ThreadWindowApp />);
    await act(async () => {});
    expect(screen.queryByRole("textbox")).toBeNull();
    mocks.initialLoading = false;
    rerender(<ThreadWindowApp />);
    act(() => {
      useAppStore.setState({ threads: [{ ...thread, status: "finished" }] });
    });
    await screen.findByRole("textbox");
    typePrompt("Continue after opening");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(mocks.reopen).not.toHaveBeenCalled();
  });
});
