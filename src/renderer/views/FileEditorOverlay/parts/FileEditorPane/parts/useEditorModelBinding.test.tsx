// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { afterEach, describe, expect, it } from "vitest";
import { useEditorModelBinding } from "./useEditorModelBinding";

function event() {
  const listeners = new Set<() => void>();
  return {
    listeners,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    fire() {
      for (const listener of [...listeners]) listener();
    },
  };
}
function model(path: string) {
  const disposal = event();
  let disposed = false;
  const value = {
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
    value,
    disposal,
    dispose() {
      disposal.fire();
      disposed = true;
    },
  };
}
function editor(initial: MonacoEditor.ITextModel) {
  const changes = event(),
    disposal = event();
  let current: MonacoEditor.ITextModel | null = initial;
  const value = {
    getModel: () => current,
    onDidChangeModel: changes.subscribe,
    onDidDispose: disposal.subscribe,
  } as unknown as MonacoEditor.IStandaloneCodeEditor;
  return {
    value,
    changes,
    disposal,
    setModel(next: MonacoEditor.ITextModel | null) {
      current = next;
      changes.fire();
    },
  };
}
const monaco = {
  Uri: { parse: (path: string) => ({ toString: () => path }) },
} as unknown as Monaco;
afterEach(cleanup);

describe("live editor model binding", () => {
  it("follows cached model switches without another onMount or model disposal", () => {
    const a = model("file:///one/a.ts"),
      b = model("file:///one/b.ts"),
      e = editor(a.value);
    const hook = renderHook(({ path }) => useEditorModelBinding(path), {
      initialProps: { path: "file:///one/a.ts" },
    });
    act(() => hook.result.current.bindEditor(e.value, monaco));
    expect(hook.result.current.binding?.model).toBe(a.value);
    hook.rerender({ path: "file:///one/b.ts" });
    expect(hook.result.current.binding).toBeNull();
    act(() => e.setModel(b.value));
    expect(hook.result.current.binding?.model).toBe(b.value);
    hook.rerender({ path: "file:///one/a.ts" });
    expect(hook.result.current.binding).toBeNull();
    act(() => e.setModel(a.value));
    expect(hook.result.current.binding?.editor).toBe(e.value);
    expect(hook.result.current.binding?.model).toBe(a.value);
    expect(a.value.isDisposed()).toBe(false);
    expect(b.value.isDisposed()).toBe(false);
  });

  it("rebinds same-URI replacement and ignores the retired model's disposal callback", () => {
    const old = model("file:///one/a.ts"),
      next = model("file:///one/a.ts"),
      e = editor(old.value);
    const hook = renderHook(() => useEditorModelBinding("file:///one/a.ts"));
    act(() => hook.result.current.bindEditor(e.value, monaco));
    const stale = [...old.disposal.listeners][0]!;
    act(() => e.setModel(next.value));
    expect(old.disposal.listeners.size).toBe(0);
    act(() => stale());
    expect(hook.result.current.binding?.model).toBe(next.value);
    act(() => next.dispose());
    expect(hook.result.current.binding).toBeNull();
    expect(e.changes.listeners.size).toBe(1);
  });

  it("retiring an old editor cannot clear a replacement and unmount releases only subscriptions", () => {
    const a = model("file:///one/a.ts"),
      old = editor(a.value),
      next = editor(a.value);
    const hook = renderHook(() => useEditorModelBinding("file:///one/a.ts"));
    act(() => hook.result.current.bindEditor(old.value, monaco));
    const stale = [...old.disposal.listeners][0]!;
    act(() => hook.result.current.bindEditor(next.value, monaco));
    act(() => stale());
    expect(hook.result.current.binding?.editor).toBe(next.value);
    expect(old.changes.listeners.size).toBe(0);
    expect(old.disposal.listeners.size).toBe(0);
    hook.unmount();
    expect(next.changes.listeners.size).toBe(0);
    expect(next.disposal.listeners.size).toBe(0);
    expect(a.disposal.listeners.size).toBe(0);
    expect(a.value.isDisposed()).toBe(false);
  });

  it("withholds loading/preview, changed-root and disposed editors until an actual matching model mounts", () => {
    const a = model("file:///one/a.ts"),
      b = model("file:///two/a.ts"),
      e = editor(a.value);
    const hook = renderHook(({ path }: { path: string | null }) => useEditorModelBinding(path), {
      initialProps: { path: "file:///one/a.ts" as string | null },
    });
    act(() => hook.result.current.bindEditor(e.value, monaco));
    hook.rerender({ path: null });
    expect(hook.result.current.binding).toBeNull();
    hook.rerender({ path: "file:///two/a.ts" });
    expect(hook.result.current.binding).toBeNull();
    act(() => e.setModel(b.value));
    expect(hook.result.current.binding?.model).toBe(b.value);
    act(() => e.disposal.fire());
    expect(hook.result.current.binding).toBeNull();
    expect(e.changes.listeners.size).toBe(0);
    expect(b.value.isDisposed()).toBe(false);
  });
});

it("preserves a shared model until its last editor binding releases", () => {
  const shared = model("file:///one/shared.ts"),
    first = editor(shared.value),
    second = editor(shared.value);
  const m = {
    ...monaco,
    editor: { getEditors: () => [first.value, second.value] },
  } as unknown as Monaco;
  const a = renderHook(() =>
    useEditorModelBinding("file:///one/shared.ts", { disposeModelOnRelease: true }),
  );
  const b = renderHook(() =>
    useEditorModelBinding("file:///one/shared.ts", { disposeModelOnRelease: true }),
  );
  act(() => {
    a.result.current.bindEditor(first.value, m);
    b.result.current.bindEditor(second.value, m);
  });
  a.unmount();
  expect(shared.value.isDisposed()).toBe(false);
  act(() => first.setModel(null));
  b.unmount();
  expect(shared.value.isDisposed()).toBe(true);
});
