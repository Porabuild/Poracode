// @vitest-environment jsdom
import { act, cleanup, waitFor } from "@testing-library/react";
import type { Monaco, OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { openEditorFind, setActiveFindEditor } from "@/renderer/components/find/editorFindBridge";
import { createLspFileUri } from "@/shared/lsp";
import { EditorBody } from "./EditorBody";

const harness = vi.hoisted(() => ({
  mounts: [] as TestEditor[],
  merge: vi.fn<(args: { model: MonacoEditor.ITextModel | null }) => void>(),
  sync: vi.fn<(args: { model: MonacoEditor.ITextModel | null }) => void>(),
  git: vi.fn<(args: { model: MonacoEditor.ITextModel | null }) => void>(),
}));
vi.mock("./useLspSync", () => ({ useLspSync: harness.sync }));
vi.mock("./mergeConflict/useMergeConflictContribution", () => ({
  useMergeConflictContribution: harness.merge,
}));
vi.mock("./gitDiff/useGitDiffContribution", () => ({ useGitDiffContribution: harness.git }));
vi.mock("./localMonacoEditor", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    default: function OnceMountedEditor(props: { path: string; onMount: OnMount }) {
      const initial = useRef({ path: props.path, onMount: props.onMount });
      const editorRef = useRef<TestEditor | null>(null);
      useEffect(() => {
        const e = new TestEditor(initial.current.path);
        editorRef.current = e;
        harness.mounts.push(e);
        initial.current.onMount(e.api, monaco);
        return () => e.dispose();
      }, []);
      useEffect(() => editorRef.current?.setPath(props.path), [props.path]);
      return <div data-testid="once-mounted-model-switching-editor" />;
    },
  };
});

function event() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    fire() {
      for (const fn of [...listeners]) fn();
    },
  };
}
function textModel(path: string) {
  const disposal = event();
  let disposed = false;
  const api = {
    uri: { toString: () => path },
    isDisposed: () => disposed,
    onWillDispose: disposal.subscribe,
    dispose: () => {
      if (disposed) return;
      disposal.fire();
      disposed = true;
    },
  } as unknown as MonacoEditor.ITextModel;
  return {
    api,
    dispose() {
      disposal.fire();
      disposed = true;
    },
  };
}
const monaco = {
  editor: { getEditors: () => harness.mounts.filter((e) => !e.disposed).map((e) => e.api) },
  Uri: { parse: (path: string) => ({ toString: () => path }) },
  KeyMod: { CtrlCmd: 1 },
  KeyCode: { KeyS: 2 },
} as unknown as Monaco;
class TestEditor {
  model;
  changes = event();
  disposal = event();
  focusEvent = event();
  disposed = false;
  find = vi.fn<() => void>();
  reveals: Array<{ path: string; line: number }> = [];
  positions: Array<{ path: string; line: number }> = [];
  constructor(path: string) {
    this.model = textModel(path);
  }
  api = {
    getModel: () => {
      if (this.disposed) throw Error("Disposed editor access");
      return this.model.api;
    },
    onDidChangeModel: (fn: () => void) => this.changes.subscribe(fn),
    onDidDispose: (fn: () => void) => this.disposal.subscribe(fn),
    onDidFocusEditorText: (fn: () => void) => this.focusEvent.subscribe(fn),
    addCommand: () => {},
    focus: () => this.focusEvent.fire(),
    getAction: () => ({ run: this.find }),
    revealLineInCenter: (line: number) =>
      this.reveals.push({ path: this.model.api.uri.toString(), line }),
    setPosition: ({ lineNumber }: { lineNumber: number }) =>
      this.positions.push({ path: this.model.api.uri.toString(), line: lineNumber }),
  } as unknown as MonacoEditor.IStandaloneCodeEditor;
  setPath(path: string) {
    if (path === this.model.api.uri.toString()) return;
    this.model = textModel(path);
    this.changes.fire();
  }
  replaceModel() {
    this.model.dispose();
    this.model = textModel(this.model.api.uri.toString());
    this.changes.fire();
  }
  dispose() {
    this.disposed = true;
    this.disposal.fire();
    this.model.dispose();
  }
}
const location = { kind: "posix" as const, path: "/owned/project" };
const a = "/owned/project/a.ts",
  b = "/owned/project/b.ts";
function body(path: string, status: "loading" | "ready" = "ready") {
  return (
    <EditorBody
      activePath={path}
      projectLocation={location}
      bufferStatus={status}
      monacoTheme="poracode-dark"
      onMonacoReady={() => {}}
      showPreview={false}
      isMarkdown={false}
      onSave={() => {}}
    />
  );
}
beforeEach(() => {
  harness.mounts.length = 0;
  harness.merge.mockClear();
  harness.git.mockClear();
  harness.sync.mockClear();
  useFileEditorStore.getState().clearSession();
  useFileEditorStore.setState({ activePath: a, buffers: {}, pendingReveal: null });
});
afterEach(() => {
  cleanup();
  setActiveFindEditor(null);
});

it("fresh B then cached A retargets Find, reveal and model contributions without remounting", async () => {
  const pane = render(body(a));
  await waitFor(() => expect(harness.mounts).toHaveLength(1));
  act(() => {
    useFileEditorStore.setState({ activePath: b });
    pane.rerender(body(b, "loading"));
  });
  act(() => pane.rerender(body(b)));
  await waitFor(() => expect(harness.mounts).toHaveLength(2));
  const current = harness.mounts[1]!;
  act(() => {
    useFileEditorStore.setState({
      activePath: a,
      pendingReveal: { path: a, lineNumber: 5, token: 11 },
    });
    pane.rerender(body(a));
  });
  const expected = createLspFileUri(location, a);
  await waitFor(() => expect(current.reveals).toEqual([{ path: expected, line: 5 }]));
  expect(current.positions).toEqual([{ path: expected, line: 5 }]);
  expect(useFileEditorStore.getState().pendingReveal).toBeNull();
  expect(harness.mounts).toHaveLength(2);
  expect(harness.merge.mock.lastCall?.[0].model).toBe(current.model.api);
  expect(harness.git.mock.lastCall?.[0].model).toBe(current.model.api);
  expect(openEditorFind()).toBe(true);
  expect(current.find).toHaveBeenCalledOnce();
  pane.rerender(body(a));
  expect(current.reveals).toHaveLength(1);
  pane.unmount();
  expect(openEditorFind()).toBe(false);
});

it("passes same-URI replacement models to LSP without remounting the editor", async () => {
  useFileEditorStore.getState().setRootContext({
    projectId: "owned",
    projectName: "Owned",
    rootLabel: "Owned",
    projectLocation: location,
  });
  render(body(a));
  await waitFor(() => expect(harness.mounts).toHaveLength(1));
  const editor = harness.mounts[0]!;
  await waitFor(() =>
    expect(harness.sync).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: editor.model.api }),
    ),
  );
  const old = editor.model.api;
  act(() => editor.replaceModel());
  expect(editor.model.api).not.toBe(old);
  await waitFor(() =>
    expect(harness.sync).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: editor.model.api }),
    ),
  );
  expect(harness.mounts).toHaveLength(1);
});
