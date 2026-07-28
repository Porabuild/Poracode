import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrWatch, PrWatchInput, PrWatchKey, ProjectNotes } from "@/shared/contracts";
import type { RemoteDesktopClient } from "./remoteClient";
import { installRemoteBridge, setRemoteBridgeClient } from "./bridge";

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
    const upsertPrWatch = vi.fn<(input: PrWatchInput) => Promise<PrWatch>>(async () => watch);
    const deletePrWatch = vi.fn<(input: PrWatchKey) => Promise<void>>(async () => undefined);
    setRemoteBridgeClient(
      { getPrWatch, upsertPrWatch, deletePrWatch } as unknown as RemoteDesktopClient,
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
    await expect(window.poracode.upsertPrWatch(input)).resolves.toEqual(watch);
    await expect(window.poracode.deletePrWatch(key)).resolves.toBeUndefined();
    expect(getPrWatch).toHaveBeenCalledWith(key);
    expect(upsertPrWatch).toHaveBeenCalledWith(input);
    expect(deletePrWatch).toHaveBeenCalledWith(key);
  });
});
