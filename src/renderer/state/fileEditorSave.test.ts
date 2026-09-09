import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FILE_SAVE_CONFLICT_MESSAGE } from "@/shared/fileSaveErrors";
import type { ReadProjectFileResult } from "@/shared/contracts";
import { useFileEditorStore } from "./fileEditorStore";

const { writeProjectFile, readProjectFile } = vi.hoisted(() => ({
  writeProjectFile: vi.fn<(payload: unknown) => Promise<{ modifiedAtMs: number }>>(),
  readProjectFile: vi.fn<(payload: unknown) => Promise<ReadProjectFileResult>>(),
}));
vi.mock("../bridge", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readBridge: () => ({ writeProjectFile, readProjectFile }),
}));

beforeEach(() => {
  writeProjectFile.mockReset();
  readProjectFile.mockReset();
  useFileEditorStore.setState({
    rootContext: {
      projectId: "save-race-project",
      projectName: "Save race",
      projectLocation: { kind: "posix", path: "/remote/project" },
      rootLabel: "Save race",
      remoteServerId: "save-race-host",
    },
    buffers: {
      "README.md": {
        path: "README.md",
        status: "ready",
        content: "submitted text",
        savedContent: "original text",
        modifiedAtMs: 1,
        lineEnding: "lf",
        hasBom: false,
        isDirty: true,
        isLoading: false,
      },
    },
  });
});
afterEach(() => useFileEditorStore.getState().clearSession());

function ready(content: string, modifiedAtMs = 10): ReadProjectFileResult {
  return { path: "README.md", status: "ready", content, modifiedAtMs };
}

it("does not replace a newer reopened baseline with an older save acknowledgment", async () => {
  const pending = Promise.withResolvers<{ modifiedAtMs: number }>();
  writeProjectFile.mockReturnValueOnce(pending.promise);
  const save = useFileEditorStore.getState().saveFile("README.md");
  useFileEditorStore.setState({ tabs: ["README.md"] });
  useFileEditorStore.getState().closeTab("README.md");
  readProjectFile.mockResolvedValueOnce(ready("newer disk content"));
  await useFileEditorStore.getState().openFile("README.md");
  useFileEditorStore.getState().updateBuffer("README.md", "newer local edit");
  pending.resolve({ modifiedAtMs: 2 });
  await save;
  expect(useFileEditorStore.getState().buffers["README.md"]).toMatchObject({
    content: "newer local edit",
    savedContent: "newer disk content",
    modifiedAtMs: 10,
    isDirty: true,
  });
});

it.each(["success", "failure"] as const)(
  "does not let an older read's %s replace or remove a newer open",
  async (outcome) => {
    useFileEditorStore.setState({ buffers: {}, tabs: [] });
    const pending = Promise.withResolvers<ReadProjectFileResult>();
    readProjectFile.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ready("new read"));
    const oldOpen = useFileEditorStore.getState().openFile("README.md");
    await useFileEditorStore.getState().openFile("README.md");
    if (outcome === "success") {
      pending.resolve(ready("old read", 1));
    } else {
      pending.reject(new Error("old read failed"));
    }
    const settled = await oldOpen.then(
      () => "success",
      () => "failure",
    );
    expect(settled).toBe(outcome);
    expect(useFileEditorStore.getState().buffers["README.md"]?.content).toBe("new read");
    expect(useFileEditorStore.getState().tabs).toContain("README.md");
  },
);

it("does not resurrect a buffer closed before its read finishes", async () => {
  useFileEditorStore.setState({ buffers: {}, tabs: [] });
  const pending = Promise.withResolvers<ReadProjectFileResult>();
  readProjectFile.mockReturnValueOnce(pending.promise);
  const opening = useFileEditorStore.getState().openFile("README.md");
  useFileEditorStore.getState().closeTab("README.md");
  pending.resolve(ready("closed file"));
  await opening;
  expect(useFileEditorStore.getState().buffers).not.toHaveProperty("README.md");
  expect(useFileEditorStore.getState().tabs).not.toContain("README.md");
});

it("does not apply a background refresh to a newer reopened buffer", async () => {
  useFileEditorStore.getState().discardFileChanges("README.md");
  useFileEditorStore.setState({ tabs: ["README.md"] });
  const pending = Promise.withResolvers<ReadProjectFileResult>();
  readProjectFile.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ready("new open"));
  const refreshing = useFileEditorStore.getState().refreshOpenBuffers();
  useFileEditorStore.getState().closeTab("README.md");
  await useFileEditorStore.getState().openFile("README.md");
  pending.resolve(ready("old refresh", 1));
  await refreshing;
  expect(useFileEditorStore.getState().buffers["README.md"]).toMatchObject({
    content: "new open",
    savedContent: "new open",
    modifiedAtMs: 10,
  });
});

it.each([
  ["README.md", "README.md", "renamed.md", "renamed.md"],
  ["src/README.md", "src", "lib", "lib/README.md"],
])("finishes a pending read after renaming %s", async (path, from, to, renamedPath) => {
  useFileEditorStore.setState({ buffers: {}, tabs: [] });
  const pending = Promise.withResolvers<ReadProjectFileResult>();
  readProjectFile.mockReturnValueOnce(pending.promise);
  const opening = useFileEditorStore.getState().openFile(path, "modal", false, { lineNumber: 12 });
  useFileEditorStore.getState().renamePath(from, to);
  pending.resolve({ ...ready("loaded before rename"), path });
  await opening;
  expect(useFileEditorStore.getState().buffers[renamedPath]).toMatchObject({
    path: renamedPath,
    content: "loaded before rename",
    isLoading: false,
  });
  expect(useFileEditorStore.getState().buffers).not.toHaveProperty(path);
  expect(useFileEditorStore.getState().activePath).toBe(renamedPath);
  expect(useFileEditorStore.getState().pendingReveal).toMatchObject({
    path: renamedPath,
    lineNumber: 12,
  });
});

it("retries the current path when a pending old-path read fails after rename", async () => {
  useFileEditorStore.setState({ buffers: {}, tabs: [] });
  const pending = Promise.withResolvers<ReadProjectFileResult>();
  readProjectFile.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
    ...ready("loaded after rename"),
    path: "renamed.md",
  });
  const opening = useFileEditorStore.getState().openFile("README.md");
  useFileEditorStore.getState().renamePath("README.md", "renamed.md");
  pending.reject(new Error("old path no longer exists"));
  await opening;
  expect(readProjectFile).toHaveBeenLastCalledWith(expect.objectContaining({ path: "renamed.md" }));
  expect(useFileEditorStore.getState().buffers["renamed.md"]).toMatchObject({
    content: "loaded after rename",
    isLoading: false,
  });
});

it("keeps text typed during a pending save dirty and saves it on the next request", async () => {
  const pending = Promise.withResolvers<{ modifiedAtMs: number }>();
  writeProjectFile.mockReturnValueOnce(pending.promise);
  const save = useFileEditorStore.getState().saveFile("README.md");
  expect(writeProjectFile).toHaveBeenCalledWith(
    expect.objectContaining({ content: "submitted text", baseModifiedAtMs: 1 }),
  );
  useFileEditorStore.getState().updateBuffer("README.md", "typed while saving");
  pending.resolve({ modifiedAtMs: 2 });
  await save;
  expect(useFileEditorStore.getState().buffers["README.md"]).toMatchObject({
    content: "typed while saving",
    savedContent: "submitted text",
    modifiedAtMs: 2,
    isDirty: true,
  });
  writeProjectFile.mockResolvedValueOnce({ modifiedAtMs: 3 });
  await useFileEditorStore.getState().saveFile("README.md");
  expect(writeProjectFile).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: "typed while saving", baseModifiedAtMs: 2 }),
  );
  expect(useFileEditorStore.getState().buffers["README.md"]).toMatchObject({
    savedContent: "typed while saving",
    isDirty: false,
  });
});

it("preserves unsaved content and its baseline when the backend rejects a conflict", async () => {
  const conflict = Object.assign(new Error(FILE_SAVE_CONFLICT_MESSAGE), {
    status: 409,
    code: "file_save_conflict",
  });
  writeProjectFile.mockRejectedValueOnce(conflict);
  await expect(useFileEditorStore.getState().saveFile("README.md")).rejects.toBe(conflict);
  expect(useFileEditorStore.getState().buffers["README.md"]).toMatchObject({
    content: "submitted text",
    savedContent: "original text",
    modifiedAtMs: 1,
    isDirty: true,
  });
});
