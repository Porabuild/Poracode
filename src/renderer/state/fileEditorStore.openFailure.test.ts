import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { useFileEditorStore, type FileEditorRootContext } from "./fileEditorStore";

const context: FileEditorRootContext = {
  projectId: "project",
  projectName: "Project",
  projectLocation: { kind: "windows", path: "D:/project" },
  rootLabel: "Project",
};
const invalidPath = "/D:/project/missing.md";
const readExternalFile = vi.fn<PoracodeBridge["readExternalFile"]>();
const readProjectFile = vi.fn<PoracodeBridge["readProjectFile"]>();
const originalBridge = window.poracode;

beforeEach(() => {
  readExternalFile.mockReset();
  readProjectFile.mockReset();
  Object.defineProperty(window, "poracode", {
    configurable: true,
    value: { readExternalFile, readProjectFile },
  });
  useFileEditorStore.getState().clearSession();
  useFileEditorStore.getState().setRootContext(context);
});

afterEach(() => {
  useFileEditorStore.getState().clearSession();
  Object.defineProperty(window, "poracode", { configurable: true, value: originalBridge });
});

describe("failed file opens", () => {
  it.each(["missing", "rejected", "project-relative"])(
    "dismisses the empty panel after a %s read so it cannot cover conversations",
    async (failure) => {
      if (failure === "missing") {
        readExternalFile.mockResolvedValue({
          path: invalidPath,
          status: "missing",
          modifiedAtMs: 0,
        });
      } else if (failure === "project-relative") {
        readProjectFile.mockRejectedValue(new Error("Cannot open this path"));
      } else {
        readExternalFile.mockRejectedValue(new Error("Cannot open this path"));
      }

      await expect(
        useFileEditorStore
          .getState()
          .openFile(failure === "project-relative" ? "missing.md" : invalidPath, "modal", true, {
            lineNumber: 12,
            markdownPreview: true,
          }),
      ).rejects.toThrow(failure === "missing" ? "File not found" : "Cannot open this path");

      expect(useFileEditorStore.getState()).toMatchObject({
        rootContext: context,
        overlayMode: null,
        tabs: [],
        activePath: null,
        buffers: {},
        previewTab: null,
        markdownPreviewPath: null,
        pendingReveal: null,
      });
    },
  );

  it("keeps another file and its unsaved edits open when a later read fails", async () => {
    const validPath = "D:/project/draft.md";
    readExternalFile.mockResolvedValue({
      path: validPath,
      status: "ready",
      content: "original",
      modifiedAtMs: 1,
    });
    await useFileEditorStore.getState().openFile(validPath);
    useFileEditorStore.getState().updateBuffer(validPath, "unsaved changes");
    const buffer = useFileEditorStore.getState().buffers[validPath];
    readExternalFile.mockRejectedValue(new Error("Cannot open this path"));

    await expect(useFileEditorStore.getState().openFile(invalidPath)).rejects.toThrow(
      "Cannot open this path",
    );

    expect(useFileEditorStore.getState()).toMatchObject({
      overlayMode: "modal",
      tabs: [validPath],
      activePath: validPath,
    });
    expect(useFileEditorStore.getState().buffers[validPath]).toBe(buffer);
    expect(buffer?.isDirty).toBe(true);
  });

  it("preserves the fullscreen file browser when its only read fails", async () => {
    readExternalFile.mockRejectedValue(new Error("Cannot open this path"));
    await expect(useFileEditorStore.getState().openFile(invalidPath, "fullscreen")).rejects.toThrow(
      "Cannot open this path",
    );
    expect(useFileEditorStore.getState()).toMatchObject({
      overlayMode: "fullscreen",
      tabs: [],
      activePath: null,
    });
  });

  it("does not close a file opened in a new context when an old read fails", async () => {
    const pending =
      Promise.withResolvers<Awaited<ReturnType<PoracodeBridge["readExternalFile"]>>>();
    readExternalFile.mockReturnValueOnce(pending.promise);
    const failedOpen = useFileEditorStore
      .getState()
      .openFile(invalidPath)
      .catch((error: unknown) => error);
    useFileEditorStore.getState().setRootContext({ ...context, projectId: "other-project" });
    readExternalFile.mockResolvedValue({
      path: invalidPath,
      status: "ready",
      content: "other context",
      modifiedAtMs: 1,
    });
    await useFileEditorStore.getState().openFile(invalidPath, "modal", false, { lineNumber: 4 });
    const before = useFileEditorStore.getState();
    pending.reject(new Error("Cannot open this path"));
    expect(await failedOpen).toEqual(new Error("Cannot open this path"));
    expect(useFileEditorStore.getState()).toBe(before);
  });

  it.each([
    { closeFirst: false, finishNewRead: false },
    { closeFirst: false, finishNewRead: true },
    { closeFirst: true, finishNewRead: false },
    { closeFirst: true, finishNewRead: true },
  ])(
    "preserves a newer open of the same file ($closeFirst, $finishNewRead)",
    async ({ closeFirst, finishNewRead }) => {
      type ReadResult = Awaited<ReturnType<PoracodeBridge["readExternalFile"]>>;
      const oldRead = Promise.withResolvers<ReadResult>();
      const newRead = Promise.withResolvers<ReadResult>();
      readExternalFile.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
      const oldOpen = useFileEditorStore
        .getState()
        .openFile(invalidPath)
        .catch((error: unknown) => error);
      if (closeFirst) useFileEditorStore.getState().closeTab(invalidPath);
      const newOpen = useFileEditorStore
        .getState()
        .openFile(invalidPath, "modal", false, { lineNumber: 8 });
      const result: ReadResult = {
        path: invalidPath,
        status: "ready",
        content: "new read",
        modifiedAtMs: 2,
      };
      if (finishNewRead) {
        newRead.resolve(result);
        await newOpen;
      }
      const before = useFileEditorStore.getState();

      oldRead.reject(new Error("Old read failed"));
      expect(await oldOpen).toEqual(new Error("Old read failed"));
      expect(useFileEditorStore.getState()).toBe(before);

      if (!finishNewRead) {
        newRead.resolve(result);
        await newOpen;
      }
      expect(useFileEditorStore.getState().buffers[invalidPath]?.content).toBe("new read");
    },
  );

  it("preserves the current file and its reveal when a different file fails later", async () => {
    const pending =
      Promise.withResolvers<Awaited<ReturnType<PoracodeBridge["readExternalFile"]>>>();
    readExternalFile.mockReturnValueOnce(pending.promise);
    const failedOpen = useFileEditorStore
      .getState()
      .openFile(invalidPath)
      .catch((error: unknown) => error);
    const validPath = "D:/project/draft.md";
    readExternalFile.mockResolvedValue({
      path: validPath,
      status: "ready",
      content: "original",
      modifiedAtMs: 1,
    });
    await useFileEditorStore.getState().openFile(validPath, "modal", false, { lineNumber: 4 });
    useFileEditorStore.getState().updateBuffer(validPath, "unsaved changes");
    const before = useFileEditorStore.getState();

    pending.reject(new Error("Cannot open this path"));
    expect(await failedOpen).toEqual(new Error("Cannot open this path"));
    const after = useFileEditorStore.getState();
    expect(after.tabs).toEqual([validPath]);
    expect(after.activePath).toBe(validPath);
    expect(after.overlayMode).toBe("modal");
    expect(after.buffers[validPath]).toBe(before.buffers[validPath]);
    expect(after.pendingReveal).toBe(before.pendingReveal);
  });
});
