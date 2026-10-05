// @vitest-environment jsdom
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { createLspFileUri } from "@/shared/lsp";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useLspLifecycle, useLspSync } from "./useLspSync";

const lsp = vi.hoisted(() => ({
  retainProject: vi.fn<(projectId: string) => { dispose(): void }>(),
  ensureServer: vi.fn<() => Promise<unknown>>(),
  stopProject: vi.fn<(projectId: string) => Promise<void>>().mockResolvedValue(undefined),
  getSession: vi.fn<(projectId: string, path: string) => unknown>(),
}));
vi.mock("@/renderer/lsp", () => ({ lspOrchestrator: lsp }));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (select: (state: { editorLspEnabled: boolean }) => boolean) =>
    select({ editorLspEnabled: true }),
}));
const path = "C:/Users/example/source.ts";
const location = { kind: "windows" as const, path: "C:\\Users\\example" };
const monaco = {
  Uri: { parse: (uri: string) => ({ toString: () => uri }) },
} as unknown as Monaco;
function textModel(uri = createLspFileUri(location, path)) {
  let disposed = false;
  return {
    api: {
      uri: { toString: () => uri },
      isDisposed: () => disposed,
    } as unknown as MonacoEditor.ITextModel,
    dispose: () => {
      disposed = true;
    },
  };
}
function setup(projectId = "local-project") {
  useFileEditorStore.getState().setRootContext({
    projectId,
    projectName: "Workspace",
    rootLabel: "Workspace",
    projectLocation: location,
  });
  useFileEditorStore.setState({
    buffers: {
      [path]: {
        path,
        status: "ready",
        modifiedAtMs: 1,
        content: "buffer snapshot",
        savedContent: "buffer snapshot",
        lineEnding: "lf",
        hasBom: false,
        isDirty: false,
        isLoading: false,
      },
    },
  });
}
function mount(model: MonacoEditor.ITextModel | null) {
  return renderHook(
    ({ current }) => {
      useLspSync({ monaco, model: current, activePath: path, bufferStatus: "ready" });
      return useLspLifecycle(monaco);
    },
    { initialProps: { current: model } },
  );
}
describe("LSP actual model ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lsp.retainProject.mockImplementation((projectId) => ({
      dispose: () => {
        void lsp.stopProject(projectId);
      },
    }));
    lsp.ensureServer.mockReset().mockResolvedValue(null);
    lsp.getSession.mockReset();
    useFileEditorStore.getState().clearSession();
    setup();
  });
  afterEach(cleanup);
  it("excludes Home opens, saves and shutdown", () => {
    setup(HOME_PROJECT_ID);
    const h = mount(textModel().api);
    h.result.current.notifyDidSave(path);
    h.unmount();
    expect(lsp.ensureServer).not.toHaveBeenCalled();
    expect(lsp.getSession).not.toHaveBeenCalled();
    expect(lsp.stopProject).not.toHaveBeenCalled();
  });
  it("binds the actual replacement at the same URI without restarting project ownership", async () => {
    const docSync = {
      bindModel: vi.fn<(model: MonacoEditor.ITextModel, path: string) => void>(),
      didSave: vi.fn<(uri: string, text: string) => void>(),
      didClose: vi.fn<(uri: string) => void>(),
    };
    const session = { docSync };
    lsp.ensureServer.mockResolvedValue(session);
    lsp.getSession.mockReturnValue(session);
    const a = textModel(),
      b = textModel();
    const h = mount(a.api);
    await waitFor(() => expect(docSync.bindModel).toHaveBeenCalledWith(a.api, path));
    h.rerender({ current: b.api });
    await waitFor(() => expect(docSync.bindModel).toHaveBeenCalledWith(b.api, path));
    h.rerender({ current: null });
    expect(docSync.didClose).not.toHaveBeenCalled();
    expect(lsp.stopProject).not.toHaveBeenCalled();
    h.result.current.notifyDidSave(path);
    expect(docSync.didSave).toHaveBeenCalledWith(
      createLspFileUri(location, path),
      "buffer snapshot",
    );
    h.unmount();
    expect(lsp.stopProject).toHaveBeenCalledExactlyOnceWith("local-project");
  });
  it("reacquires the current session when a fulfilled readiness callback belongs to a retired owner", async () => {
    const retired = {
      docSync: { bindModel: vi.fn<(model: MonacoEditor.ITextModel, path: string) => void>() },
    };
    const current = {
      docSync: { bindModel: vi.fn<(model: MonacoEditor.ITextModel, path: string) => void>() },
    };
    lsp.ensureServer.mockResolvedValueOnce(retired).mockResolvedValueOnce(current);
    lsp.getSession.mockReturnValue(current);
    const model = textModel();
    const h = mount(model.api);
    await waitFor(() =>
      expect(current.docSync.bindModel).toHaveBeenCalledExactlyOnceWith(model.api, path),
    );
    expect(retired.docSync.bindModel).not.toHaveBeenCalled();
    expect(lsp.ensureServer).toHaveBeenCalledTimes(2);
    h.unmount();
  });
  it("does not bind the replacement session after the reacquiring editor unmounts", async () => {
    const retired = {
      docSync: { bindModel: vi.fn<(model: MonacoEditor.ITextModel, path: string) => void>() },
    };
    const current = {
      docSync: { bindModel: vi.fn<(model: MonacoEditor.ITextModel, path: string) => void>() },
    };
    let resolve!: (value: unknown) => void;
    lsp.ensureServer.mockResolvedValueOnce(retired).mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    lsp.getSession.mockReturnValue(current);
    const h = mount(textModel().api);
    await waitFor(() => expect(lsp.ensureServer).toHaveBeenCalledTimes(2));
    h.unmount();
    await act(async () => resolve(current));
    expect(retired.docSync.bindModel).not.toHaveBeenCalled();
    expect(current.docSync.bindModel).not.toHaveBeenCalled();
  });
  it("rejects missing, disposed and mismatched models before server startup", () => {
    const a = textModel();
    a.dispose();
    const h = mount(null);
    h.rerender({ current: a.api });
    h.rerender({ current: textModel("file:///different.ts").api });
    expect(lsp.ensureServer).not.toHaveBeenCalled();
  });
  it("rejects stale asynchronous startup after replacement, disposal or unmount", async () => {
    const resolutions: Array<(value: unknown) => void> = [];
    lsp.ensureServer.mockImplementation(() => new Promise((resolve) => resolutions.push(resolve)));
    const docSync = { bindModel: vi.fn<(model: MonacoEditor.ITextModel, path: string) => void>() };
    const a = textModel(),
      b = textModel();
    const h = mount(a.api);
    h.rerender({ current: b.api });
    await act(async () => resolutions[0]?.({ docSync }));
    expect(docSync.bindModel).not.toHaveBeenCalled();
    b.dispose();
    await act(async () => resolutions[1]?.({ docSync }));
    expect(docSync.bindModel).not.toHaveBeenCalled();
    h.rerender({ current: textModel().api });
    h.unmount();
    await act(async () => resolutions[2]?.({ docSync }));
    expect(docSync.bindModel).not.toHaveBeenCalled();
  });
});

it("uses the same Monaco-normalized URI for saves as for model binding", () => {
  setup();
  const rawUri = createLspFileUri(location, path);
  const canonicalUri = rawUri.replace("/C:", "/c%3A");
  const normalizedMonaco = {
    Uri: { parse: () => ({ toString: () => canonicalUri }) },
  } as unknown as Monaco;
  const docSync = { didSave: vi.fn<(uri: string, content: string) => void>() };
  lsp.getSession.mockReturnValue({ docSync });
  lsp.retainProject.mockReturnValue({ dispose: () => {} });
  const h = renderHook(() => useLspLifecycle(normalizedMonaco));
  h.result.current.notifyDidSave(path);
  expect(canonicalUri).not.toBe(rawUri);
  expect(docSync.didSave).toHaveBeenCalledExactlyOnceWith(canonicalUri, "buffer snapshot");
  h.unmount();
});
