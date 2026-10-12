import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { ProjectLocation, RemoteThreadCommand, Thread } from "@/shared/contracts";
import { makeThreadTitle, useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { generateTitleAsync, requestGeneratedTitle } from "./titleGen";

const GENERATED_TITLE = "Cloud Z first";

const { generateTitleWithFallback } = vi.hoisted(() => ({
  generateTitleWithFallback: vi.fn<(input: unknown) => Promise<string>>(),
}));
vi.mock("@/renderer/components/providers/titleGen", () => ({ generateTitleWithFallback }));

const { sendManagedRootThreadCommand, sendThreadCommand, toast } = vi.hoisted(() => ({
  sendManagedRootThreadCommand: vi.fn<(command: RemoteThreadCommand) => Promise<void>>(),
  sendThreadCommand: vi.fn<(desktopId: string, command: RemoteThreadCommand) => Promise<void>>(),
  toast: { danger: vi.fn<(message: string) => void>() },
}));
vi.mock("@heroui/react", () => ({ toast }));

// Root-row ownership mirrors the real predicate (unprojected id on the managed
// desktop) with the runtime check faked; the command send is the seam under test.
vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/renderer/state/managedRootCatalog/rootCatalogCommands")
    >();
  return {
    ...actual,
    managedRootOwner: (entity: { readonly id: string; readonly remoteServerId?: string }) =>
      entity.remoteServerId === undefined
        ? ({ kind: "managed-root", threadId: entity.id } as const)
        : undefined,
    sendManagedRootThreadCommand,
  };
});

describe("generateTitleAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    generateTitleWithFallback.mockResolvedValue(GENERATED_TITLE);
    sendManagedRootThreadCommand.mockResolvedValue(undefined);
    sendThreadCommand.mockResolvedValue(undefined);
    useSharedSettings.setState({ titleGenProvider: "auto" });
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
    }));
    useRemoteServersStore.setState({ sendThreadCommand });
  });

  it("sends the durable rename command for a managed-root row and applies after the host accepts", async () => {
    const thread = makeThread();
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));
    let acceptRename: (() => void) | undefined;
    sendManagedRootThreadCommand.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          acceptRename = resolve;
        }),
    );

    generateTitleAsync(thread.id, POSIX, [], PROMPT);

    await waitFor(() =>
      expect(sendManagedRootThreadCommand).toHaveBeenCalledWith({
        kind: "rename",
        threadId: thread.id,
        title: GENERATED_TITLE,
      }),
    );
    // The local mirror waits for host acceptance: a local-only apply would be
    // display-only and revert on restart.
    expect(useAppStore.getState().threads[0]?.title).toBe(makeThreadTitle(PROMPT));

    acceptRename?.();
    await waitFor(() => expect(useAppStore.getState().threads[0]?.title).toBe(GENERATED_TITLE));
  });

  it("routes the generated rename through the remote owner for a projected row", async () => {
    const thread = makeThread({
      remoteServerId: "desktop-1",
      remoteId: "remote-thread",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    generateTitleAsync(thread.id, POSIX, [], PROMPT);

    await waitFor(() =>
      expect(sendThreadCommand).toHaveBeenCalledWith("desktop-1", {
        kind: "rename",
        threadId: "remote-thread",
        title: GENERATED_TITLE,
      }),
    );
    await waitFor(() => expect(useAppStore.getState().threads[0]?.title).toBe(GENERATED_TITLE));
  });

  it("drops the generated title when the user renames while generation is in flight", async () => {
    const thread = makeThread({ title: "User renamed" });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    generateTitleAsync(thread.id, POSIX, [], PROMPT);
    await settlePromises();

    expect(sendManagedRootThreadCommand).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads[0]?.title).toBe("User renamed");
  });

  it("drops the generated title when the thread was deleted before generation lands", async () => {
    const thread = makeThread();
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));
    let resolveGeneration: ((title: string) => void) | undefined;
    generateTitleWithFallback.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveGeneration = resolve;
        }),
    );

    generateTitleAsync(thread.id, POSIX, [], PROMPT);
    useAppStore.setState((state) => ({ ...state, threads: [] }));
    resolveGeneration?.(GENERATED_TITLE);
    await settlePromises();

    expect(sendManagedRootThreadCommand).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toEqual([]);
  });

  it("keeps the fallback title when generation rejects", async () => {
    const thread = makeThread();
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));
    generateTitleWithFallback.mockRejectedValue(new Error("title model unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      generateTitleAsync(thread.id, POSIX, [], PROMPT);
      await settlePromises();

      expect(sendManagedRootThreadCommand).not.toHaveBeenCalled();
      expect(useAppStore.getState().threads[0]?.title).toBe(makeThreadTitle(PROMPT));
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps the fallback title when the durable rename command rejects", async () => {
    const thread = makeThread();
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));
    sendManagedRootThreadCommand.mockRejectedValue(new Error("host unreachable"));

    generateTitleAsync(thread.id, POSIX, [], PROMPT);

    await waitFor(() => expect(toast.danger).toHaveBeenCalledWith("host unreachable"));
    expect(useAppStore.getState().threads[0]?.title).toBe(makeThreadTitle(PROMPT));
  });
});

describe("requestGeneratedTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    generateTitleWithFallback.mockResolvedValue(GENERATED_TITLE);
    useSharedSettings.setState({
      titleGenProvider: "claude",
      titleGenSelection: undefined,
      wslTitleGenSelection: undefined,
    });
  });

  it("passes the present canonical tuple as the sole selection", () => {
    const tuple = {
      model: "haiku",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
      selectionBinding: {
        version: 1 as const,
        kind: "family-member" as const,
        owner: { agentKind: "claude", presentationMode: "terminal" as const },
        model: "haiku",
        inertValues: { effort: "", fast: false },
      },
    };
    useSharedSettings.setState({ titleGenProvider: "claude", titleGenSelection: tuple });

    void requestGeneratedTitle(POSIX, [], PROMPT);

    expect(generateTitleWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "claude", selection: tuple }),
    );
  });

  it("uses the WSL canonical tuple for WSL projects", () => {
    const wslTuple = { model: "haiku", effort: "low", fast: false };
    useSharedSettings.setState({
      titleGenProvider: "claude",
      titleGenSelection: { model: "native", effort: "", fast: false },
      wslTitleGenProvider: "claude",
      wslTitleGenSelection: wslTuple,
    });

    void requestGeneratedTitle(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl$\\Ubuntu\\repo",
      },
      [],
      PROMPT,
    );

    expect(generateTitleWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "claude", selection: wslTuple }),
    );
  });

  it("keeps absent canonical objects on the generator legacy normalization path", () => {
    useSharedSettings.setState({
      titleGenProvider: "claude",
      titleGenModel: "haiku",
      titleGenEffort: "",
      titleGenFast: false,
    });

    void requestGeneratedTitle(POSIX, [], PROMPT);

    expect(generateTitleWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude",
        model: "haiku",
        effort: "",
        fast: false,
      }),
    );
  });

  it("preserves modern omitted controls despite stale scalar siblings", () => {
    useSharedSettings.setState({
      titleGenSelection: { model: "" },
      titleGenEffort: "high",
      titleGenFast: true,
    });
    void requestGeneratedTitle(POSIX, [], PROMPT);
    expect(generateTitleWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { model: "" } }),
    );
  });

  it("stays disabled when the provider is disabled", () => {
    useSharedSettings.setState({ titleGenProvider: "disabled" });
    expect(requestGeneratedTitle(POSIX, [], PROMPT)).toBeUndefined();
    expect(generateTitleWithFallback).not.toHaveBeenCalled();
  });
});

const PROMPT =
  "Reply exactly CLOUD_Z_FIRST. Do not use tools, execute commands, read files, change files, or spawn agents.";
const POSIX: ProjectLocation = { kind: "posix", path: "/repo" };

function makeThread(input: Partial<Thread> = {}): Thread {
  const now = "2026-03-22T00:00:00.000Z";
  return {
    id: "thread-1",
    projectId: "project-1",
    title: makeThreadTitle(PROMPT),
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

/** Flush the generation/dispatch promise chain before asserting a drop. */
async function settlePromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
