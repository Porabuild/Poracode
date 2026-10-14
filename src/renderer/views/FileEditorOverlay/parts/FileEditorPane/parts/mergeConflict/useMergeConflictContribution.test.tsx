// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor, languages } from "monaco-editor";
import { expect, it, vi } from "vitest";
import { useMergeConflictContribution } from "./useMergeConflictContribution";

it("rebinds model-scoped conflicts on the same editor and rejects a retired frame", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  const makeModel = (path: string) => {
    const listeners = new Set<() => void>();
    const read = vi
      .fn<() => string>()
      .mockReturnValue("<<<<<<< current\ncurrent\n=======\nincoming\n>>>>>>> incoming\n");
    const model = {
      uri: { toString: () => path },
      isDisposed: () => false,
      getValue: read,
      onDidChangeContent: (fn: () => void) => {
        listeners.add(fn);
        return { dispose: () => listeners.delete(fn) };
      },
    } as unknown as MonacoEditor.ITextModel;
    return { model, read, listeners };
  };
  const a = makeModel("file:///owned/a.ts"),
    b = makeModel("file:///owned/b.ts");
  let current = a.model;
  let provider: languages.CodeLensProvider | null = null;
  const collections: Array<{ set: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> }> = [];
  const editor = {
    getModel: () => current,
    createDecorationsCollection: () => {
      const value = { set: vi.fn<() => void>(), clear: vi.fn<() => void>() };
      collections.push(value);
      return value;
    },
  } as unknown as MonacoEditor.IStandaloneCodeEditor;
  const monaco = {
    editor: { registerCommand: () => {} },
    languages: {
      registerCodeLensProvider: (_selector: unknown, value: languages.CodeLensProvider) => {
        provider = value;
        return { dispose() {} };
      },
    },
  } as unknown as Monaco;
  const hook = renderHook(({ model }) => useMergeConflictContribution({ editor, monaco, model }), {
    initialProps: { model: a.model },
  });
  try {
    expect(provider).not.toBeNull();
    const lenses = (model: MonacoEditor.ITextModel) =>
      (provider!.provideCodeLenses(model, {} as never) as languages.CodeLensList).lenses;
    expect(lenses(a.model)).toHaveLength(3);
    act(() => {
      for (const fn of a.listeners) fn();
    });
    const retired = [...frames.values()][0]!;
    current = b.model;
    hook.rerender({ model: b.model });
    expect(a.listeners.size).toBe(0);
    expect(b.listeners.size).toBe(1);
    expect(lenses(a.model)).toHaveLength(0);
    expect(lenses(b.model)).toHaveLength(3);
    const reads = a.read.mock.calls.length;
    act(() => retired(0));
    expect(a.read).toHaveBeenCalledTimes(reads);
    expect(collections[0]?.clear).toHaveBeenCalledOnce();
    current = a.model;
    hook.rerender({ model: a.model });
    expect(lenses(a.model)).toHaveLength(3);
    expect(lenses(b.model)).toHaveLength(0);
  } finally {
    hook.unmount();
    vi.unstubAllGlobals();
  }
});
