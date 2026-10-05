// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { expect, it, vi } from "vitest";
import { useGitDiffContribution } from "./useGitDiffContribution";

it("rebuilds unchanged git diff context when the live model identity changes", () => {
  const makeModel = () => ({ isDisposed: () => false }) as unknown as MonacoEditor.ITextModel;
  const a = makeModel(),
    b = makeModel();
  let current = a;
  const subscriptions = new Set<() => void>();
  const collections: Array<{ set: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> }> = [];
  const editor = {
    getModel: () => current,
    getValue: () => "new\n",
    createDecorationsCollection: () => {
      const value = { set: vi.fn<() => void>(), clear: vi.fn<() => void>() };
      collections.push(value);
      return value;
    },
    onDidChangeModelContent: (listener: () => void) => {
      subscriptions.add(listener);
      return { dispose: () => subscriptions.delete(listener) };
    },
    changeViewZones: (
      callback: (accessor: { removeZone: () => void; addZone: () => string }) => void,
    ) => callback({ removeZone() {}, addZone: () => "zone" }),
  } as unknown as MonacoEditor.IStandaloneCodeEditor;
  const gitDiff = { diff: "@@ -1 +1 @@\n-old\n+new\n" };
  const hook = renderHook(
    ({ model }) => useGitDiffContribution({ editor, model, gitDiff, bufferStatus: "ready" }),
    { initialProps: { model: a } },
  );
  try {
    expect(collections).toHaveLength(1);
    expect(subscriptions.size).toBe(1);
    current = b;
    hook.rerender({ model: b });
    expect(collections).toHaveLength(2);
    expect(collections[0]?.clear).toHaveBeenCalledOnce();
    expect(collections[1]?.set).toHaveBeenCalledOnce();
    expect(subscriptions.size).toBe(1);
  } finally {
    hook.unmount();
  }
  expect(subscriptions.size).toBe(0);
});
