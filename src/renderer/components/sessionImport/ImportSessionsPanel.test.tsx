import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportableSession, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => ({
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
  toast: toastMock,
}));

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span data-testid="pixel-loader" />,
  Input: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
}));

// The panel's tests cover filter logic, not the popover; a native select keeps
// `fireEvent.change` meaningful and the SearchableSelect has its own test.
vi.mock("./SearchableSelect", () => ({
  SearchableSelect: (props: {
    label: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const listImportableSessionsMock = vi.hoisted(() =>
  vi.fn<(payload: unknown) => Promise<unknown>>(),
);
const importSessionTranscriptMock = vi.hoisted(() =>
  vi.fn<
    (payload: unknown) => Promise<{ messageCount: number; path: string; existingThreadId?: string }>
  >(),
);

/**
 * The scan reports the facets it saw alongside the page of sessions. Tests
 * that only care about the page keep returning a plain array; this derives the
 * facets those sessions imply, so only a test about facets has to spell them out.
 */
function found(sessions: ImportableSession[]) {
  return {
    sessions,
    facets: {
      providers: [...new Set(sessions.map((s) => s.provider))],
      accounts: [...new Set(sessions.map((s) => s.agentKind))],
      folders: [...new Set(sessions.flatMap((s) => (s.cwd ? [s.cwd] : [])))],
    },
    // Every case that doesn't care about truncation should still resolve a
    // real boolean here, not `undefined` fed into a `useState(false)`.
    truncated: false,
  };
}

vi.mock("@/renderer/bridge", () => ({
  isWindows: () => true,
  readBridge: () => ({
    listImportableSessions: async (payload: unknown) => {
      const value = await listImportableSessionsMock(payload);
      return Array.isArray(value) ? found(value) : value;
    },
    importSessionTranscript: importSessionTranscriptMock,
  }),
}));

const createThreadMock = vi.hoisted(() => vi.fn<(input: unknown) => Thread>());
const updateThreadRuntimeMock = vi.hoisted(() => vi.fn<(id: string, input: unknown) => void>());
const updateThreadConfigMock = vi.hoisted(() => vi.fn<(id: string, config: unknown) => void>());
const deleteThreadMock = vi.hoisted(() => vi.fn<(id: string) => void>());
const deleteProjectMock = vi.hoisted(() => vi.fn<(id: string) => void>());
const addProjectWithResultMock = vi.hoisted(() =>
  vi.fn<
    (
      location: unknown,
      name?: string,
      workspaceId?: string,
    ) => { project: { id: string }; created: boolean }
  >(),
);
const storeState = {
  projects: [{ id: "p1", name: "repo", location: { kind: "windows", path: "F:\\repo" } }],
  // Read directly by the write-back path to merge onto the *live* config
  // rather than a pre-await snapshot; tests that care about it populate this.
  threads: [] as Thread[],
  createThread: createThreadMock,
  updateThreadRuntime: updateThreadRuntimeMock,
  updateThreadConfig: updateThreadConfigMock,
  addProjectWithResult: addProjectWithResultMock,
  deleteThread: deleteThreadMock,
  deleteProject: deleteProjectMock,
};
const statusState = {
  agentStatuses: [
    {
      kind: "codex",
      label: "Codex",
      installed: true,
      capabilities: { models: [{ id: "gpt-5.6-luna", label: "GPT" }] },
    },
    {
      kind: "codex:work",
      label: "Work account",
      installed: true,
      capabilities: { models: [{ id: "gpt-5.5", label: "GPT 5.5" }] },
    },
    { kind: "claude", label: "Claude Code", installed: true, capabilities: { models: [] } },
    { kind: "cursor", label: "Cursor", installed: true, capabilities: { models: [] } },
  ],
};

vi.mock("@/renderer/state/agentStatusesStore", () => {
  const useAgentStatusesStore = ((selector: (state: typeof statusState) => unknown) =>
    selector(statusState)) as unknown as {
    (selector: (state: typeof statusState) => unknown): unknown;
    getState: () => typeof statusState;
  };
  useAgentStatusesStore.getState = () => statusState;
  return { useAgentStatusesStore };
});

const rehydrateThreadRuntimeItemsMock = vi.hoisted(() =>
  vi.fn<(threadId: string) => Promise<void>>().mockResolvedValue(undefined),
);
vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  rehydrateThreadRuntimeItems: rehydrateThreadRuntimeItemsMock,
}));

vi.mock("@/renderer/state/workspaceStore", () => ({
  getActiveWorkspaceId: () => "ws-active",
}));

vi.mock("@/renderer/state/appStore", () => {
  const useAppStore = ((selector: (state: typeof storeState) => unknown) =>
    selector(storeState)) as unknown as {
    (selector: (state: typeof storeState) => unknown): unknown;
    getState: () => typeof storeState;
  };
  useAppStore.getState = () => storeState;
  return { useAppStore };
});

import { ImportSessionsPanel } from "./ImportSessionsPanel";

function session(overrides: Partial<ImportableSession> = {}): ImportableSession {
  return {
    id: "codex:cx-1",
    provider: "codex",
    agentKind: "codex",
    providerSessionId: "cx-1",
    path: "F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl",
    cwd: "F:\\repo",
    startedAt: "2026-09-20T04:43:18.000Z",
    updatedAt: "2026-09-20T05:00:00.000Z",
    preview: "fix the race condition",
    cwdExists: true,
    ...overrides,
  };
}

beforeEach(() => {
  listImportableSessionsMock.mockReset().mockResolvedValue([session()]);
  importSessionTranscriptMock.mockReset().mockResolvedValue({
    messageCount: 4,
    // Matches the default session()'s own path: the write-back only fires on
    // a mismatch, so tests that don't mean to exercise it shouldn't trip it.
    path: "F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl",
  });
  createThreadMock.mockReset().mockReturnValue({ id: "new-thread" } as Thread);
  updateThreadRuntimeMock.mockReset();
  updateThreadConfigMock.mockReset();
  deleteThreadMock.mockReset();
  deleteProjectMock.mockReset();
  storeState.threads = [];
  addProjectWithResultMock
    .mockReset()
    .mockImplementation(() => ({ project: { id: "p-new" }, created: true }));
  toastMock.success.mockReset();
  toastMock.danger.mockReset();
});

describe("ImportSessionsPanel", () => {
  it("lists every session and preselects the given folder in the filter", async () => {
    listImportableSessionsMock.mockResolvedValue([
      session(),
      session({ id: "codex:cx-2", providerSessionId: "cx-2", preview: "elsewhere", cwd: "F:\\x" }),
    ]);
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);

    expect(await screen.findByText("fix the race condition")).toBeInTheDocument();
    expect(screen.getByLabelText("Project")).toHaveValue("F:\\repo");
    expect(screen.queryByText("elsewhere")).not.toBeInTheDocument();
    // The project picker is always offered, seeded with the given project.
    expect(screen.getByLabelText("Target project")).toHaveValue("p1");
  });

  it("lists the project's sessions when the seeded folder is spelled differently", async () => {
    // The dialog seeds `initialFolder` from a *project* path; the transcript
    // records its own `cwd`. The two routinely differ by drive-letter case or
    // a trailing separator, and the scan already treats them as one folder.
    render(<ImportSessionsPanel initialFolder={"f:\\repo\\"} initialProjectId="p1" />);

    expect(await screen.findByText("fix the race condition")).toBeInTheDocument();
    // …and the selection survives as the folder the scan reported it as,
    // instead of falling back to "All projects".
    expect(screen.getByLabelText("Project")).toHaveValue("F:\\repo");
  });

  it("scans for the folder it is filtered to, not for everything", async () => {
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);

    await screen.findByText("fix the race condition");
    await vi.waitFor(() =>
      expect(listImportableSessionsMock).toHaveBeenCalledWith({ cwd: "F:\\repo" }),
    );
  });

  it("offers a folder the scan saw even when no session on this page is in it", async () => {
    listImportableSessionsMock.mockResolvedValue({
      sessions: [session()],
      facets: {
        providers: ["codex"],
        accounts: ["codex"],
        folders: ["F:\\repo", "F:\\quiet"],
      },
    });
    render(<ImportSessionsPanel initialProjectId="p1" />);

    await screen.findByText("fix the race condition");
    expect(
      within(screen.getByLabelText("Project")).getByRole("option", { name: "quiet" }),
    ).toBeInTheDocument();
  });

  it("shows the provider's title over the first prompt and names the thread after it", async () => {
    listImportableSessionsMock.mockResolvedValue([session({ title: "Race fix" })]);
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);

    const checkbox = await screen.findByRole("checkbox", { name: "Race fix" });
    expect(screen.getByText("fix the race condition")).toBeInTheDocument();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    await vi.waitFor(() =>
      expect(createThreadMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Race fix" })),
    );
  });

  it("disables a session that was already imported", async () => {
    listImportableSessionsMock.mockResolvedValue([session({ importedThreadId: "old" })]);
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);

    const checkbox = await screen.findByRole("checkbox", { name: /fix the race condition/iu });
    expect(checkbox).toBeDisabled();
  });

  it("creates a thread with the session ref and replays the transcript", async () => {
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    await vi.waitFor(() =>
      expect(createThreadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentKind: "codex",
          title: "fix the race condition",
          // Runtime items render only in the chat pane.
          presentationMode: "gui",
          config: expect.objectContaining({
            // Detected from the agent's capabilities; an empty model would
            // fail persistence for the whole store.
            model: "gpt-5.6-luna",
            importedFrom: expect.objectContaining({
              provider: "codex",
              path: "F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl",
            }),
          }),
        }),
      ),
    );
    expect(updateThreadRuntimeMock).toHaveBeenCalledWith(
      "new-thread",
      expect.objectContaining({
        sessionRef: expect.objectContaining({ providerSessionId: "cx-1" }),
      }),
    );
    expect(importSessionTranscriptMock).toHaveBeenCalledWith({
      threadId: "new-thread",
      provider: "codex",
      path: "F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl",
      targetAgentKind: "codex",
    });
    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    // A pane opened mid-import must re-read the replayed transcript.
    expect(rehydrateThreadRuntimeItemsMock).toHaveBeenCalledWith("new-thread");
  });

  it("opens the imported thread on the model the session recorded", async () => {
    // The account's mocked capabilities only advertise "gpt-5.6-luna" — extend
    // them with the model the transcript recorded so this genuinely proves the
    // recorded model is read, not just that it happens to match whatever the
    // fallback chain would have picked (the first advertised model).
    const codexStatus = statusState.agentStatuses.find((entry) => entry.kind === "codex");
    const originalModels = codexStatus?.capabilities.models ?? [];
    if (codexStatus) {
      codexStatus.capabilities = {
        models: [...originalModels, { id: "gpt-6-astra", label: "Astra 6" }],
      };
    }
    try {
      listImportableSessionsMock.mockResolvedValue([session({ model: "gpt-6-astra" })]);
      render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
      fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
      fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

      await vi.waitFor(() =>
        expect(createThreadMock).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({ model: "gpt-6-astra" }),
          }),
        ),
      );
    } finally {
      if (codexStatus) codexStatus.capabilities = { models: originalModels };
    }
  });

  it("falls back to the existing chain when the account does not advertise the recorded model", async () => {
    // The mocked "codex" account only advertises "gpt-5.6-luna"; a recorded
    // model of anything else is one the account doesn't offer, so the import
    // must fall back rather than open the thread on a model that isn't there.
    listImportableSessionsMock.mockResolvedValue([session({ model: "gpt-9-nonexistent" })]);
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    await vi.waitFor(() =>
      expect(createThreadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ model: "gpt-5.6-luna" }),
        }),
      ),
    );
  });

  it("keeps a config change made while the transcript replay was in flight", async () => {
    // Replaying a large transcript takes time; the user can open the new
    // thread and change its config (e.g. the model) before the write-back of
    // the resumed path lands. `updateThreadConfig` replaces the whole config,
    // so the write-back must merge onto the *live* config, not a snapshot
    // taken before the await — or the concurrent edit is silently discarded.
    importSessionTranscriptMock.mockImplementation(async () => {
      // Simulate the user editing the thread's config mid-replay.
      storeState.threads = [
        {
          id: "new-thread",
          config: { model: "user-picked-model", mode: "plan" },
        } as unknown as Thread,
      ];
      return { messageCount: 4, path: "F:\\home\\.codex\\work\\sessions\\rollout-cx-1.jsonl" };
    });
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    await vi.waitFor(() => expect(updateThreadConfigMock).toHaveBeenCalled());
    expect(updateThreadConfigMock).toHaveBeenCalledExactlyOnceWith(
      "new-thread",
      expect.objectContaining({
        // The concurrent edit survives the write-back.
        model: "user-picked-model",
        mode: "plan",
        importedFrom: expect.objectContaining({
          path: "F:\\home\\.codex\\work\\sessions\\rollout-cx-1.jsonl",
        }),
      }),
    );
  });

  it("imports under another account of the same provider and copies the transcript", async () => {
    listImportableSessionsMock.mockResolvedValue([
      session(),
      session({
        id: "claude:cl-1",
        provider: "claude",
        agentKind: "claude",
        providerSessionId: "cl-1",
        path: "F:\\home\\.claude\\projects\\F--repo\\cl-1.jsonl",
        preview: "claude work",
      }),
    ]);
    createThreadMock
      .mockReturnValueOnce({ id: "codex-thread" } as Thread)
      .mockReturnValueOnce({ id: "claude-thread" } as Thread);
    // The copy into the work account's home lands at a different path than
    // the one sent; the claude session isn't copied, so its path is unchanged.
    importSessionTranscriptMock.mockImplementation(async (payload) => {
      const { path, targetAgentKind } = payload as { path: string; targetAgentKind: string };
      return targetAgentKind === "codex:work"
        ? { messageCount: 4, path: "F:\\home\\.codex\\work\\sessions\\rollout-cx-1.jsonl" }
        : { messageCount: 4, path };
    });
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);

    const target = await screen.findByLabelText("Target account");
    // Only accounts that can own a Codex or Claude session are offered.
    expect(Array.from((target as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      "",
      "codex",
      "codex:work",
      "claude",
    ]);
    fireEvent.change(target, { target: { value: "codex:work" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: /import 2 session/iu }));

    await vi.waitFor(() => expect(importSessionTranscriptMock).toHaveBeenCalledTimes(2));
    expect(createThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentKind: "codex:work",
        config: expect.objectContaining({ model: "gpt-5.5" }),
      }),
    );
    expect(importSessionTranscriptMock).toHaveBeenCalledWith({
      threadId: "codex-thread",
      provider: "codex",
      path: "F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl",
      targetAgentKind: "codex:work",
    });
    // A Claude log cannot move to a Codex profile: it keeps its own account.
    expect(createThreadMock).toHaveBeenCalledWith(expect.objectContaining({ agentKind: "claude" }));
    expect(importSessionTranscriptMock).toHaveBeenCalledWith({
      threadId: "claude-thread",
      provider: "claude",
      path: "F:\\home\\.claude\\projects\\F--repo\\cl-1.jsonl",
      targetAgentKind: "claude",
    });
    // The thread must resume the copy it actually holds, not the original
    // it was imported from. The claude session wasn't copied, so its config
    // is left untouched.
    expect(updateThreadConfigMock).toHaveBeenCalledExactlyOnceWith(
      "codex-thread",
      expect.objectContaining({
        importedFrom: expect.objectContaining({
          provider: "codex",
          path: "F:\\home\\.codex\\work\\sessions\\rollout-cx-1.jsonl",
        }),
      }),
    );
  });

  it("creates a project for an unknown folder and files it into the active workspace", async () => {
    listImportableSessionsMock.mockResolvedValue([
      session({ cwd: "F:\\brand-new", cwdExists: true }),
    ]);
    render(<ImportSessionsPanel />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    await vi.waitFor(() =>
      expect(addProjectWithResultMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: "F:\\brand-new" }),
        undefined,
        "ws-active",
      ),
    );
    expect(createThreadMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p-new" }));
  });

  it("reuses the existing project when the folder is already one", async () => {
    addProjectWithResultMock.mockReturnValue({ project: { id: "p1" }, created: false });
    listImportableSessionsMock.mockResolvedValue([session({ cwdExists: true })]);
    render(<ImportSessionsPanel />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    await vi.waitFor(() =>
      expect(createThreadMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1" })),
    );
  });

  it("falls back to the chosen project when the folder is gone", async () => {
    listImportableSessionsMock.mockResolvedValue([
      session({ cwd: "F:\\deleted", cwdExists: false }),
    ]);
    render(<ImportSessionsPanel initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    await vi.waitFor(() =>
      expect(createThreadMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1" })),
    );
    expect(addProjectWithResultMock).not.toHaveBeenCalled();
  });

  it("filters by provider, account, folder, and search text", async () => {
    listImportableSessionsMock.mockResolvedValue([
      session(),
      session({
        id: "codex:cx-work",
        providerSessionId: "cx-work",
        agentKind: "codex:work",
        preview: "work account task",
      }),
      session({
        id: "claude:cl-1",
        provider: "claude",
        agentKind: "claude",
        providerSessionId: "cl-1",
        preview: "write a test",
        cwd: "F:\\other",
      }),
    ]);
    render(<ImportSessionsPanel />);
    await screen.findByText("fix the race condition");

    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "F:\\other" } });
    expect(screen.getByText("write a test")).toBeInTheDocument();
    expect(screen.queryByText("fix the race condition")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "all" } });

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "claude" } });
    expect(screen.queryByText("fix the race condition")).not.toBeInTheDocument();
    expect(screen.getByText("write a test")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "codex:work" } });
    expect(screen.getByText("work account task")).toBeInTheDocument();
    expect(screen.queryByText("write a test")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "other" } });
    expect(screen.getByText("write a test")).toBeInTheDocument();
    expect(screen.queryByText("fix the race condition")).not.toBeInTheDocument();
  });

  it("shows a notice when the scan was cut at the page limit", async () => {
    listImportableSessionsMock.mockResolvedValue({
      ...found([session()]),
      truncated: true,
    });
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);

    expect(await screen.findByText(/Showing the 200 most recent/iu)).toBeInTheDocument();
  });

  it("hides the truncation notice when every session fit", async () => {
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);

    await screen.findByText("fix the race condition");
    expect(screen.queryByText(/Showing the 200 most recent/iu)).not.toBeInTheDocument();
  });

  it("debounces the query 400ms before rescanning, and sends it only once settled", async () => {
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    await screen.findByText("fix the race condition");
    // The mount scan carries no query: `filters.query` starts empty.
    expect(listImportableSessionsMock).toHaveBeenCalledExactlyOnceWith({ cwd: "F:\\repo" });

    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "deploy" } });

      act(() => {
        vi.advanceTimersByTime(399);
      });
      // Still just the one call from mount — the debounce hasn't elapsed.
      expect(listImportableSessionsMock).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(listImportableSessionsMock).toHaveBeenCalledTimes(2);
      expect(listImportableSessionsMock).toHaveBeenLastCalledWith({
        cwd: "F:\\repo",
        query: "deploy",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the filter bar and the search box when a query scans to nothing", async () => {
    // Task 8 moved the query into the scan, so one keystroke can empty
    // `sessions`. If that unmounts the panel, the input still holding the
    // typed text goes with it and the only way back is to close the dialog.
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    await screen.findByText("fix the race condition");

    listImportableSessionsMock.mockResolvedValue([]);
    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "zzz" } });
    // Real timers: wait out the 400ms debounce and let the empty result land.
    // Until it does, `sessions` still holds the mount's page and only the
    // client-side filter has emptied the list body.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(listImportableSessionsMock).toHaveBeenCalledWith({ cwd: "F:\\repo", query: "zzz" });

    expect(
      screen.queryByText("No Codex or Claude Code sessions found on this computer."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No sessions match the current filters.")).toBeInTheDocument();
    // The text is still there to clear, in the input that still holds it.
    expect(screen.getByLabelText("Search sessions")).toHaveValue("zzz");
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
  });

  it("keeps the search box mounted while a cleared query is still debouncing", async () => {
    render(<ImportSessionsPanel initialProjectId="p1" />);
    await screen.findByText("fix the race condition");

    listImportableSessionsMock.mockResolvedValue([]);
    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "zzz" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(screen.getByLabelText("Search sessions")).toHaveValue("zzz");

    // Clearing the box must not take the box away. `sessions` is still the
    // empty result of the query for the 400ms the next scan is debounced, so
    // a panel that decides it is un-narrowed the moment the text goes
    // disappears out from under the user mid-keystroke.
    listImportableSessionsMock.mockResolvedValue([session()]);
    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "" } });

    expect(
      screen.queryByText("No Codex or Claude Code sessions found on this computer."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search sessions")).toHaveValue("");
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
  });

  it("says a rescan is in flight instead of leaving a stale list live", async () => {
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    expect(screen.getByRole("button", { name: /import 1 session/iu })).toBeEnabled();

    // A scan that never lands. For its whole duration the list on screen is
    // the previous one; importing from it is importing from a list the panel
    // already knows is out of date.
    listImportableSessionsMock.mockImplementation(() => new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "codex" } });

    await vi.waitFor(() => expect(listImportableSessionsMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: /import 1 session/iu })).toBeDisabled(),
    );
    expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "true");
  });

  it("drops a selected session the rescan no longer returns", async () => {
    const second = session({ id: "codex:cx-2", providerSessionId: "cx-2", preview: "second" });
    listImportableSessionsMock.mockResolvedValue([session(), second]);
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    expect(screen.getByRole("button", { name: /import 1 session/iu })).toBeInTheDocument();

    // The rescan no longer carries the ticked session. `runImport` resolves
    // ids against the *new* list, so leaving it selected promises an import
    // the panel cannot perform.
    listImportableSessionsMock.mockResolvedValue([second]);
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "codex" } });

    await vi.waitFor(() =>
      expect(screen.queryByText("fix the race condition")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /import 0 sessions/iu })).toBeInTheDocument();
  });

  it("rolls its own thread back when main names the thread already holding the session", async () => {
    importSessionTranscriptMock.mockResolvedValue({
      messageCount: 0,
      path: "F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl",
      existingThreadId: "held-by",
    });
    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /fix the race condition/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 1 session/iu }));

    // Nothing was replayed into the thread the panel just created, so it must
    // not be left behind as an empty duplicate.
    await vi.waitFor(() => expect(deleteThreadMock).toHaveBeenCalledExactlyOnceWith("new-thread"));
    // The row is marked against the thread that does hold the session, so the
    // user can find it instead of trying the import again.
    await vi.waitFor(() => expect(screen.getByText("Imported")).toBeInTheDocument());
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it("reports a failed import without blocking the rest", async () => {
    listImportableSessionsMock.mockResolvedValue([
      session(),
      session({
        id: "codex:cx-2",
        providerSessionId: "cx-2",
        preview: "second",
        path: "F:\\b.jsonl",
      }),
    ]);
    importSessionTranscriptMock
      .mockRejectedValueOnce(new Error("unreadable"))
      .mockResolvedValueOnce({ messageCount: 2, path: "F:/other.jsonl" });
    // Both sessions share a folder: the real store dedupes the second lookup
    // (`created: false`), so only the first import creates a fresh project.
    addProjectWithResultMock
      .mockReset()
      .mockReturnValueOnce({ project: { id: "p-new" }, created: true })
      .mockReturnValue({ project: { id: "p-new" }, created: false });

    render(<ImportSessionsPanel initialFolder={"F:\\repo"} initialProjectId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: /select all/iu }));
    fireEvent.click(screen.getByRole("button", { name: /import 2 sessions/iu }));

    await vi.waitFor(() => expect(toastMock.danger).toHaveBeenCalled());
    expect(importSessionTranscriptMock).toHaveBeenCalledTimes(2);
    // The failed session's half-built thread is rolled back; the other stays.
    await vi.waitFor(() => expect(deleteThreadMock).toHaveBeenCalledTimes(1));
    // The project created for the failed import is rolled back with it.
    expect(deleteProjectMock).toHaveBeenCalledExactlyOnceWith("p-new");
  });
});
