import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrWatch, PrWatchInput, PrWatchKey, ProjectNotes } from "@/shared/contracts";
import { REMOTE_PROCEDURE_SPECS } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { installRemoteBridge, setRemoteBridgeClient } from "./remoteBridge";

describe("remote bridge", () => {
  afterEach(() => {
    setRemoteBridgeClient(null);
    vi.restoreAllMocks();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it("uploads browser-selected files and returns paired-desktop paths", async () => {
    const uploadAttachment = vi.fn<() => Promise<string>>(async () => "C:\\attachments\\notes.md");
    setRemoteBridgeClient({ uploadAttachment } as unknown as RemoteDesktopClient, "win32");
    Object.defineProperty(window, "poracode", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    installRemoteBridge();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      function (this: HTMLInputElement) {
        const file = new File(["hello"], "notes.md", { type: "text/markdown" });
        Object.defineProperty(this, "files", { configurable: true, value: [file] });
        this.dispatchEvent(new Event("change"));
      },
    );

    await expect(window.poracode.pickFiles({ attachmentThreadId: "thread-1" })).resolves.toEqual([
      "C:\\attachments\\notes.md",
    ]);
    expect(uploadAttachment).toHaveBeenCalledWith({
      threadId: "thread-1",
      fileName: "notes.md",
      data: new Uint8Array([104, 101, 108, 108, 111]),
    });
  });

  it("leaves unavailable optional bridge metadata undefined", () => {
    Object.defineProperty(window, "poracode", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    installRemoteBridge();

    expect(window.poracode.homeDir).toBeUndefined();
    expect(window.poracode.windowKind).toBe("main");
    expect(window.poracode.onProjectStateChanged(() => undefined)).toBeTypeOf("function");
    expect(window.poracode.onRemoteAccessPairingChanged(() => undefined)).toBeTypeOf("function");
    expect(window.poracode.onQuickComposerSubmit(() => undefined)).toBeTypeOf("function");
    expect(window.poracode.onQuickComposerDismissRequested(() => undefined)).toBeTypeOf("function");
  });

  it("tracks the paired desktop platform after bridge installation", () => {
    setRemoteBridgeClient({} as RemoteDesktopClient, "darwin");
    installRemoteBridge();
    expect(window.poracode.platform).toBe("darwin");

    setRemoteBridgeClient({} as RemoteDesktopClient, "win32");
    expect(window.poracode.platform).toBe("win32");
  });

  it("persists browser-local keybindings without a desktop RPC", async () => {
    installRemoteBridge();

    await expect(window.poracode.getKeybindings()).resolves.toEqual({
      path: "browser-storage://keybindings.json",
      file: DEFAULT_KEYBINDINGS,
    });
    const file = {
      version: 1 as const,
      keybindings: [{ command: "settings.open", key: "Ctrl+Alt+," }],
    };
    await expect(window.poracode.setKeybindings(file)).resolves.toEqual({
      path: "browser-storage://keybindings.json",
      file,
    });
    await expect(window.poracode.getKeybindings()).resolves.toEqual({
      path: "browser-storage://keybindings.json",
      file,
    });
  });

  it("defers startup schedule reads until the paired client is ready", async () => {
    const schedules = vi.fn<RemoteDesktopClient["schedules"]>(async () => []);
    installRemoteBridge();

    const request = window.poracode.getSchedules();
    const settled = vi.fn<() => void>();
    void request.then(settled);
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();

    setRemoteBridgeClient({ schedules } as unknown as RemoteDesktopClient, "win32");

    await expect(request).resolves.toEqual([]);
    expect(schedules).toHaveBeenCalledOnce();
  });

  it("forwards project notes to the paired desktop", async () => {
    const notes: ProjectNotes = {
      projectId: "project-1",
      doc: null,
      todos: [],
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const projectNotes = vi.fn<(projectId: string) => Promise<ProjectNotes | null>>(
      async () => notes,
    );
    const setProjectNotes = vi.fn<(next: ProjectNotes) => Promise<void>>(async () => undefined);
    setRemoteBridgeClient(
      { projectNotes, setProjectNotes } as unknown as RemoteDesktopClient,
      "darwin",
    );
    installRemoteBridge();

    await expect(window.poracode.dbGetProjectNotes("project-1")).resolves.toEqual(notes);
    await expect(window.poracode.dbSetProjectNotes(notes)).resolves.toBeUndefined();
    expect(projectNotes).toHaveBeenCalledWith("project-1");
    expect(setProjectNotes).toHaveBeenCalledWith(notes);
  });

  it("forwards every shared remote procedure through the generic client route", async () => {
    const callRemoteProcedure = vi.fn<(procedure: string, payload: unknown) => Promise<string>>(
      async (procedure) => procedure,
    );
    setRemoteBridgeClient({ callRemoteProcedure } as unknown as RemoteDesktopClient, "linux");
    installRemoteBridge();
    const bridge = window.poracode as unknown as Record<
      string,
      (payload: unknown) => Promise<unknown>
    >;

    for (const procedure of Object.keys(REMOTE_PROCEDURE_SPECS)) {
      await expect(bridge[procedure]?.({ procedure })).resolves.toBe(procedure);
    }
    expect(callRemoteProcedure.mock.calls).toEqual(
      Object.keys(REMOTE_PROCEDURE_SPECS).map((procedure) => [procedure, { procedure }]),
    );
  });

  it("forwards PR automation to the paired desktop", async () => {
    const watch: PrWatch = {
      projectId: "project-1",
      prNumber: 42,
      headBranch: "feature/mobile",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.6-sol" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
    };
    const getPrWatch = vi.fn<(input: PrWatchKey) => Promise<PrWatch | null>>(async () => watch);
    const checkPrWatch = vi.fn<(input: PrWatchKey) => Promise<void>>(async () => undefined);
    const upsertPrWatch = vi.fn<(input: PrWatchInput) => Promise<PrWatch>>(async () => watch);
    const deletePrWatch = vi.fn<(input: PrWatchKey) => Promise<void>>(async () => undefined);
    setRemoteBridgeClient(
      { getPrWatch, checkPrWatch, upsertPrWatch, deletePrWatch } as unknown as RemoteDesktopClient,
      "darwin",
    );
    installRemoteBridge();

    const key = { projectId: "project-1", prNumber: 42 };
    const input: PrWatchInput = {
      ...key,
      headBranch: "feature/mobile",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.6-sol" },
    };
    await expect(window.poracode.getPrWatch(key)).resolves.toEqual(watch);
    await expect(window.poracode.checkPrWatch(key)).resolves.toBeUndefined();
    await expect(window.poracode.upsertPrWatch(input)).resolves.toEqual(watch);
    await expect(window.poracode.deletePrWatch(key)).resolves.toBeUndefined();
    expect(getPrWatch).toHaveBeenCalledWith(key);
    expect(checkPrWatch).toHaveBeenCalledWith(key);
    expect(upsertPrWatch).toHaveBeenCalledWith(input);
    expect(deletePrWatch).toHaveBeenCalledWith(key);
  });

  it("closes bridge-started shells through the shell endpoint", async () => {
    const startShell = vi.fn<RemoteDesktopClient["startShell"]>(async () => undefined);
    const closeShell = vi.fn<RemoteDesktopClient["closeShell"]>(async () => undefined);
    const closeThread = vi.fn<RemoteDesktopClient["closeThread"]>(async () => undefined);
    setRemoteBridgeClient(
      { startShell, closeShell, closeThread } as unknown as RemoteDesktopClient,
      "linux",
    );
    installRemoteBridge();

    await window.poracode.startShell({
      shellId: "shell-1",
      projectLocation: { kind: "posix", path: "/repo" },
    });
    await window.poracode.closeThread({ threadId: "shell-1" });
    await window.poracode.closeThread({ threadId: "thread-1" });

    expect(closeShell).toHaveBeenCalledWith({ threadId: "shell-1" });
    expect(closeThread).toHaveBeenCalledWith("thread-1");
  });

  it("keeps shell ownership when a close fails so retry uses the shell endpoint", async () => {
    const startShell = vi.fn<RemoteDesktopClient["startShell"]>(async () => undefined);
    const closeShell = vi
      .fn<RemoteDesktopClient["closeShell"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const closeThread = vi.fn<RemoteDesktopClient["closeThread"]>(async () => undefined);
    setRemoteBridgeClient(
      { startShell, closeShell, closeThread } as unknown as RemoteDesktopClient,
      "linux",
    );
    installRemoteBridge();

    await window.poracode.startShell({
      shellId: "shell-1",
      projectLocation: { kind: "posix", path: "/repo" },
    });
    await expect(window.poracode.closeThread({ threadId: "shell-1" })).rejects.toThrow("offline");
    await expect(window.poracode.closeThread({ threadId: "shell-1" })).resolves.toBeUndefined();

    expect(closeShell).toHaveBeenCalledTimes(2);
    expect(closeThread).not.toHaveBeenCalled();
  });
});
