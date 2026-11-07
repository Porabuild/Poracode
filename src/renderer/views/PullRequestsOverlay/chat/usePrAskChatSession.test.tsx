// @vitest-environment jsdom
import type { ReactNode } from "react";
import { I18nProvider } from "@lingui/react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import {
  setAuxiliaryThreadIds,
  useAuxiliaryThreadWindows,
} from "@/renderer/state/auxiliaryThreadWindows";
import { useGitStore } from "@/renderer/state/gitStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  makeTestDetails,
  makeTestScopedSource,
  makeTestPrData,
  makeTestScope,
  TEST_PR_KEY,
} from "../testing/prDetailTestScope";
import { RemoteClientError } from "@/shared/remote/client";
import type { PrAskLaunchInput } from "./launchPrAskThread";
import { PrAskLaunchError } from "./prAskLaunchError";
import type { PrAskAgentSelection } from "./resolvePrAskAgent";

const mocks = vi.hoisted(() => ({
  launch: vi.fn<(input: PrAskLaunchInput) => Promise<string>>(),
  submit: vi.fn<(threadId: string, prompt: string) => Promise<void>>(),
  openThread: vi.fn<(threadId: string) => void>(),
  selection: undefined as PrAskAgentSelection | undefined,
  toastWarning: vi.fn<(message: string) => void>(),
  toastDanger: vi.fn<(message: string) => void>(),
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { warning: mocks.toastWarning, danger: mocks.toastDanger },
}));
vi.mock("./launchPrAskThread", () => ({ launchPrAskThread: mocks.launch }));
vi.mock("@/renderer/actions/threadRuntimeActions", () => ({ submitThreadInput: mocks.submit }));
vi.mock("@/renderer/actions/threadActions", () => ({ openThread: mocks.openThread }));
vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useDraftEnvironment: () => ({ agentStatuses: [], isDetectingAgents: false }),
}));
vi.mock("./resolvePrAskAgent", () => ({ resolvePrAskAgent: () => mocks.selection }));
import { usePrAskChatSession } from "./usePrAskChatSession";

const project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
} as Project;
const SELECTION: PrAskAgentSelection = { agentKind: "agent-one", config: { model: "m" } };

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

/** Creates the row a real launch publishes, so the hook can observe it. */
function launchCreatingRow(input: PrAskLaunchInput): string {
  const id = input.existingThreadId ?? `thread-${mocks.launch.mock.calls.length - 1}`;
  input.reserve(id);
  if (!input.existingThreadId)
    useAppStore.getState().createThread({
      threadId: id,
      projectId: input.project.id,
      agentKind: input.selection.agentKind,
      config: input.selection.config,
      prompt: input.prompt,
      title: input.title,
      presentationMode: "gui",
      focus: false,
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
    });
  return id;
}

function markIdle(threadId: string) {
  useAppStore.getState().updateThreadRuntime(threadId, {
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
  });
}

function hidden(): ReadonlySet<string> {
  return useAuxiliaryThreadWindows.getState().hiddenThreadIds;
}

const scope42 = makeTestScope();
const scope43 = makeTestScope({
  prNumber: 43,
  cacheKey: "project-1#43",
  prKey: `${TEST_PR_KEY}-43`,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selection = SELECTION;
  setAuxiliaryThreadIds([]);
  useAppStore.setState({ projects: [project], threads: [] });
  useGitStore.setState({
    prDetails: {
      [scope42.cacheKey]: makeTestDetails({ body: "Faster overlay.", baseBranch: "main" }),
    },
    prData: { [scope42.prKey]: makeTestPrData() },
    prFiles: { [scope42.cacheKey]: [{ path: "src/a.ts", additions: 2, deletions: 1 }] },
  });
  mocks.launch.mockImplementation((input) => {
    const id = launchCreatingRow(input);
    markIdle(id);
    return Promise.resolve(id);
  });
  mocks.submit.mockResolvedValue(undefined);
});

describe("usePrAskChatSession", () => {
  it("creates nothing until the first question", () => {
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    expect(result.current.available).toBe(true);
    expect(result.current.open).toBe(false);
    expect(result.current.threadId).toBeUndefined();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toHaveLength(0);
  });

  it("opens the panel, launches one GUI thread with the first prompt and hides it", async () => {
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("Why was the cache removed?");
    });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    const input = mocks.launch.mock.calls[0]![0];
    expect(input.project.id).toBe("project-1");
    expect(input.selection).toBe(SELECTION);
    expect(input.title).toBe("PR #42: Improve the overlay");
    expect(input.worktreePath).toBeUndefined();
    expect(input.existingThreadId).toBeUndefined();
    expect(input.prompt).toContain("pull request #42");
    expect(input.prompt).toContain("Faster overlay.");
    expect(input.prompt).toContain("src/a.ts (+2 -1)");
    expect(input.prompt).toContain("Why was the cache removed?");
    expect(input.prompt).toContain("no local checkout");
    expect(result.current.open).toBe(true);
    expect(result.current.threadId).toBe("thread-0");
    expect(result.current.starting).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(hidden().has("thread-0")).toBe(true);
  });

  it("runs in the review's worktree and claims the head only when its tip is the head", async () => {
    const path = "/repo/.worktrees/pr-42";
    const scope = makeTestScope({ worktreePath: path });
    useGitStore.setState({
      worktrees: {
        "project-1": [{ path, branch: "feature/test", commit: "abcdef1", isMain: false }],
      },
    });
    const { result } = renderHook(() => usePrAskChatSession(scope), { wrapper });
    await act(async () => {
      result.current.ask("Walk me through it");
    });
    const input = mocks.launch.mock.calls[0]![0];
    expect(input.worktreePath).toBe(path);
    expect(input.prompt).toContain("checkout of this pull request's head commit");
    expect(input.prompt).not.toContain("may differ");
  });

  it.each([
    ["the worktree tip is another commit", { commit: "9999999", crossRepository: false }],
    ["the review comes from a fork", { commit: "abcdef1", crossRepository: true }],
    ["the worktree is unknown to the git store", undefined],
  ])("does not claim the head when %s", async (_name, setup) => {
    const path = "/repo/.worktrees/pr-42";
    const scope = makeTestScope({ worktreePath: path });
    useGitStore.setState({
      worktrees: {
        "project-1": setup
          ? [{ path, branch: "feature/test", commit: setup.commit, isMain: false }]
          : [],
      },
      prData: {
        [scope42.prKey]: makeTestPrData(setup ? { isCrossRepository: setup.crossRepository } : {}),
      },
    });
    const { result } = renderHook(() => usePrAskChatSession(scope), { wrapper });
    await act(async () => {
      result.current.ask("Walk me through it");
    });
    const prompt = mocks.launch.mock.calls[0]![0].prompt;
    expect(prompt).toContain("may differ from this pull request's head");
    expect(prompt).not.toContain("checkout of this pull request's head commit");
  });

  it("matches worktree paths across separators and Windows drive-letter case", async () => {
    useAppStore.setState({
      projects: [{ ...project, location: { kind: "windows", path: "C:\\repo" } } as Project],
    });
    const scope = makeTestScope({ worktreePath: "C:\\wt\\pr-42" });
    useGitStore.setState({
      worktrees: {
        "project-1": [
          { path: "c:/wt/pr-42/", branch: "b", commit: "abcdef1234567", isMain: false },
        ],
      },
    });
    const { result } = renderHook(() => usePrAskChatSession(scope), { wrapper });
    await act(async () => {
      result.current.ask("Hi");
    });
    expect(mocks.launch.mock.calls[0]![0].prompt).toContain("head commit");
  });

  it("sends later questions to the same thread without launching another", async () => {
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("First");
    });
    await act(async () => {
      result.current.ask("Second", "const x = 1;");
    });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    const [threadId, prompt] = mocks.submit.mock.calls[0]!;
    expect(threadId).toBe("thread-0");
    expect(prompt).toContain("Second");
    expect(prompt).toContain("const x = 1;");
    expect(useAppStore.getState().threads).toHaveLength(1);
  });

  it("waits for the agent instead of sending while it is answering", async () => {
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("First");
    });
    act(() => {
      useAppStore.getState().updateThreadRuntime("thread-0", {
        status: "working",
        attention: "working",
        canResumeWithConfig: true,
      });
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      result.current.ask("Too soon");
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("ignores a second ask while the first is still launching", async () => {
    let finish: (id: string) => void = () => {};
    mocks.launch.mockImplementation((input) => {
      const id = launchCreatingRow(input);
      return new Promise<string>((resolve) => {
        finish = () => {
          markIdle(id);
          resolve(id);
        };
      });
    });
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("First");
    });
    expect(result.current.starting).toBe(true);
    await act(async () => {
      result.current.ask("Second");
    });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
    await act(async () => {
      finish("thread-0");
    });
    expect(result.current.starting).toBe(false);
  });

  it("keeps one thread per review, releasing it when the selection moves and reusing it on return", async () => {
    const { result, rerender } = renderHook(({ scope }) => usePrAskChatSession(scope), {
      wrapper,
      initialProps: { scope: scope42 },
    });
    await act(async () => {
      result.current.ask("About 42");
    });
    expect(hidden().has("thread-0")).toBe(true);

    rerender({ scope: scope43 });
    expect(result.current.threadId).toBeUndefined();
    expect(result.current.open).toBe(false);
    expect(hidden().has("thread-0")).toBe(false);
    // The conversation stays a normal thread.
    expect(useAppStore.getState().threads.map((row) => row.id)).toEqual(["thread-0"]);

    rerender({ scope: scope42 });
    expect(result.current.threadId).toBe("thread-0");
    expect(hidden().has("thread-0")).toBe(true);
    await act(async () => {
      result.current.ask("Back again");
    });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.submit.mock.calls[0]![0]).toBe("thread-0");

    rerender({ scope: scope43 });
    await act(async () => {
      result.current.ask("About 43");
    });
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(mocks.launch.mock.calls[1]![0].title).toBe("PR #43");
    expect(mocks.launch.mock.calls[1]![0].existingThreadId).toBeUndefined();
  });

  it("releases the thread when the overlay closes", async () => {
    const { result, unmount } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("Hello");
    });
    expect(hidden().has("thread-0")).toBe(true);
    unmount();
    expect(hidden().has("thread-0")).toBe(false);
  });

  it("starts a fresh thread when the user deleted the chat thread", async () => {
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("First");
    });
    act(() => {
      useAppStore.getState().deleteThread("thread-0");
    });
    expect(result.current.threadId).toBeUndefined();
    mocks.launch.mockImplementation((input) => {
      const id = launchCreatingRow(input);
      markIdle(id);
      return Promise.resolve(id);
    });
    await act(async () => {
      result.current.ask("Again");
    });
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(mocks.launch.mock.calls[1]![0].existingThreadId).toBeUndefined();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does nothing when no agent can start a chat", async () => {
    mocks.selection = undefined;
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    expect(result.current.available).toBe(false);
    await act(async () => {
      result.current.ask("Anyone there?");
    });
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it("is unavailable for a mirrored project whose server is unreachable, and returns with it", async () => {
    useAppStore.setState({ projects: [{ ...project, remoteServerId: "mac" } as Project] });
    useRemoteServersStore.setState({
      runtime: { mac: { status: "offline", projects: [], threads: [] } },
    });
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    expect(result.current.available).toBe(false);
    await act(async () => {
      result.current.ask("Anyone there?");
    });
    expect(mocks.launch).not.toHaveBeenCalled();

    act(() => {
      useRemoteServersStore.setState({
        runtime: { mac: { status: "online", projects: [], threads: [] } },
      });
    });
    expect(result.current.available).toBe(true);
  });

  it("keeps the unsent question per review while the chat is closed or another review is shown", () => {
    const { result, rerender } = renderHook(({ scope }) => usePrAskChatSession(scope), {
      wrapper,
      initialProps: { scope: scope42 },
    });
    act(() => result.current.setDraft("Why this change?"));
    act(() => result.current.setOpen(true));
    act(() => result.current.setOpen(false));
    expect(result.current.draft).toBe("Why this change?");

    rerender({ scope: scope43 });
    expect(result.current.draft).toBe("");
    act(() => result.current.setDraft("About 43"));
    rerender({ scope: scope42 });
    expect(result.current.draft).toBe("Why this change?");

    act(() => result.current.setDraft(""));
    expect(result.current.draft).toBe("");
    rerender({ scope: scope43 });
    expect(result.current.draft).toBe("About 43");
  });

  it("does nothing without a review", async () => {
    const { result } = renderHook(() => usePrAskChatSession(null), { wrapper });
    expect(result.current.available).toBe(false);
    await act(async () => {
      result.current.ask("Hi");
    });
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it("ignores an empty question", async () => {
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("   ");
    });
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it("reports a failed launch and retries the same row with the same prompt", async () => {
    mocks.launch.mockImplementationOnce((input) => {
      const id = launchCreatingRow(input);
      return Promise.reject(new PrAskLaunchError("Agent failed to start.", id, false));
    });
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("Please explain");
    });
    expect(result.current.error).toEqual({ message: "Agent failed to start.", uncertain: false });
    expect(result.current.starting).toBe(false);
    const firstPrompt = mocks.launch.mock.calls[0]![0].prompt;

    await act(async () => {
      result.current.retry();
    });
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    const retried = mocks.launch.mock.calls[1]![0];
    expect(retried.existingThreadId).toBe("thread-0");
    expect(retried.prompt).toBe(firstPrompt);
    expect(result.current.error).toBeUndefined();
    expect(result.current.threadId).toBe("thread-0");
    expect(useAppStore.getState().threads).toHaveLength(1);
    // The thread was launched now, so the next question is a follow-up.
    await act(async () => {
      result.current.ask("Next");
    });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("marks an uncertain failure so the retry stays explicit", async () => {
    mocks.launch.mockImplementationOnce((input) => {
      const id = launchCreatingRow(input);
      return Promise.reject(new PrAskLaunchError("Could not confirm.", id, true));
    });
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("Hello");
    });
    expect(result.current.error?.uncertain).toBe(true);
  });

  it("opens the chat thread in the main app and leaves the overlay", async () => {
    const scope = makeTestScope();
    const { result } = renderHook(() => usePrAskChatSession(scope), { wrapper });
    act(() => {
      result.current.openAsThread();
    });
    expect(mocks.openThread).not.toHaveBeenCalled();
    await act(async () => {
      result.current.ask("Hello");
    });
    act(() => {
      result.current.openAsThread();
    });
    expect(mocks.openThread).toHaveBeenCalledWith("thread-0", { focusComposer: true });
    expect(scope.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes and reopens the panel without touching the thread", async () => {
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("Hello");
    });
    act(() => {
      result.current.setOpen(false);
    });
    expect(result.current.open).toBe(false);
    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);
    expect(result.current.threadId).toBe("thread-0");
    expect(mocks.launch).toHaveBeenCalledTimes(1);
  });

  it("keeps the chats of different source hosts apart for the same project and number", async () => {
    const gitlab = {
      ...makeTestScopedSource(),
      forge: "gitlab" as const,
      host: "https://gitlab.example",
    };
    const github = makeTestScope();
    const other = makeTestScope({ source: gitlab, scoped: gitlab });
    const { result, rerender } = renderHook(({ scope }) => usePrAskChatSession(scope), {
      wrapper,
      initialProps: { scope: github },
    });
    await act(async () => {
      result.current.ask("On the first host");
    });
    expect(result.current.threadId).toBe("thread-0");

    rerender({ scope: other });
    expect(result.current.threadId).toBeUndefined();
    await act(async () => {
      result.current.ask("On the second host");
    });
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(mocks.launch.mock.calls[1]![0].existingThreadId).toBeUndefined();
    expect(result.current.threadId).toBe("thread-1");

    rerender({ scope: github });
    expect(result.current.threadId).toBe("thread-0");
  });

  it("never splits a surrogate pair in the thread title", async () => {
    useGitStore.setState({
      prDetails: { [scope42.cacheKey]: makeTestDetails({ title: `${"x".repeat(88)}😀 tail` }) },
    });
    const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
    await act(async () => {
      result.current.ask("Hi");
    });
    const title = mocks.launch.mock.calls[0]![0].title;
    expect(title).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(title.length).toBeLessThanOrEqual(100);
    expect(title.startsWith("PR #42: xxx")).toBe(true);
  });

  describe("send", () => {
    async function launched() {
      const view = renderHook(() => usePrAskChatSession(scope42), { wrapper });
      await act(async () => {
        await view.result.current.send("First");
      });
      return view;
    }

    it("resolves true for the first message and for a follow-up that was submitted", async () => {
      const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
      let first = false;
      await act(async () => {
        first = await result.current.send("First");
      });
      expect(first).toBe(true);
      let second = false;
      await act(async () => {
        second = await result.current.send("Second");
      });
      expect(second).toBe(true);
      expect(mocks.submit).toHaveBeenCalledTimes(1);
      expect(result.current.starting).toBe(false);
    });

    it("keeps a failed first question in the composer for an explicit retry", async () => {
      mocks.launch.mockImplementationOnce((input) => {
        const id = launchCreatingRow(input);
        return Promise.reject(new PrAskLaunchError("Could not confirm.", id, true));
      });
      const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
      let accepted = true;
      await act(async () => {
        accepted = await result.current.send("Please explain this review");
      });

      expect(accepted).toBe(false);
      expect(result.current.error).toEqual({ message: "Could not confirm.", uncertain: true });
    });

    it("resolves false and says so when the chat thread or its project is gone", async () => {
      const { result } = await launched();
      // `submitThreadInput` resolves the row's own project; with it gone it returns quietly.
      act(() => {
        useAppStore.setState((state) => ({
          threads: state.threads.map((row) => ({ ...row, projectId: "removed-project" })),
        }));
      });
      let accepted = true;
      await act(async () => {
        accepted = await result.current.send("Is anyone there?");
      });
      expect(accepted).toBe(false);
      expect(mocks.submit).not.toHaveBeenCalled();
      expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
      expect(result.current.starting).toBe(false);
    });

    it("resolves false and surfaces the error when the submit fails", async () => {
      const { result } = await launched();
      mocks.submit.mockRejectedValueOnce(new Error("host refused"));
      let accepted = true;
      await act(async () => {
        accepted = await result.current.send("Second");
      });
      expect(accepted).toBe(false);
      expect(mocks.toastDanger).toHaveBeenCalledWith("host refused");
      expect(result.current.starting).toBe(false);
    });

    it("resolves true without a second error for an uncertain outcome", async () => {
      const { result } = await launched();
      mocks.submit.mockRejectedValueOnce(
        new RemoteClientError(
          "Remote command outcome is uncertain and was not repeated.",
          409,
          "command_outcome_uncertain",
        ),
      );
      let accepted = false;
      await act(async () => {
        accepted = await result.current.send("Second");
      });
      expect(accepted).toBe(true);
      expect(mocks.toastDanger).not.toHaveBeenCalled();
    });

    it("resolves false while the agent is answering and for blank text", async () => {
      const { result } = await launched();
      act(() => {
        useAppStore.getState().updateThreadRuntime("thread-0", {
          status: "working",
          attention: "working",
          canResumeWithConfig: true,
        });
      });
      let busy = true;
      await act(async () => {
        busy = await result.current.send("Too soon");
      });
      expect(busy).toBe(false);
      expect(mocks.toastWarning).toHaveBeenCalledTimes(1);
      let blank = true;
      await act(async () => {
        blank = await result.current.send("  ");
      });
      expect(blank).toBe(false);
    });

    it("resolves false when no agent can start the chat", async () => {
      mocks.selection = undefined;
      const { result } = renderHook(() => usePrAskChatSession(scope42), { wrapper });
      let accepted = true;
      await act(async () => {
        accepted = await result.current.send("Anyone?");
      });
      expect(accepted).toBe(false);
      expect(mocks.launch).not.toHaveBeenCalled();
    });
  });
});
