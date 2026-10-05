import { useEffect, useRef, useState } from "react";
import type { Monaco, OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";

interface EditorModelBinding {
  editor: MonacoEditor.IStandaloneCodeEditor;
  monaco: Monaco;
  model: MonacoEditor.ITextModel | null;
}

/** The wrapper calls onMount once per editor, including across cached model switches. */
export function useEditorModelBinding(
  expectedPath: string | null,
  options: { disposeModelOnRelease?: boolean } = {},
) {
  const [mounted, setMounted] = useState<EditorModelBinding | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => () => releaseRef.current?.(), []);

  const bindEditor: OnMount = (editor, monaco) => {
    releaseRef.current?.();
    let active = true;
    let ownedModel: MonacoEditor.ITextModel | null = null;
    let modelDisposal: IDisposable | null = null;
    const updateModel = () => {
      if (!active) return;
      modelDisposal?.dispose();
      const candidate = editor.getModel();
      const model = candidate && !candidate.isDisposed() ? candidate : null;
      ownedModel = model;
      modelDisposal =
        model?.onWillDispose(() => {
          if (active)
            setMounted((current) =>
              current?.editor === editor && current.model === model
                ? { editor, monaco, model: null }
                : current,
            );
        }) ?? null;
      setMounted({ editor, monaco, model });
    };
    const modelChanges = editor.onDidChangeModel(updateModel);
    const editorDisposal = editor.onDidDispose(() => {
      if (!active) return;
      release();
      setMounted((current) => (current?.editor === editor ? null : current));
    });
    function release() {
      if (!active) return;
      active = false;
      modelDisposal?.dispose();
      modelChanges.dispose();
      editorDisposal.dispose();
      if (releaseRef.current === release) releaseRef.current = null;
      // The wrapper keeps the model so an overlapping editor cannot destroy it.
      // Match the old last-editor disposal behavior without a global cache.
      const model = ownedModel;
      ownedModel = null;
      if (options.disposeModelOnRelease && model && !model.isDisposed()) {
        const shared = monaco.editor
          .getEditors()
          .some(
            (other: MonacoEditor.ICodeEditor) => other !== editor && other.getModel() === model,
          );
        if (!shared) model.dispose();
      }
    }
    releaseRef.current = release;
    updateModel();
  };

  const binding =
    expectedPath !== null &&
    mounted?.model &&
    !mounted.model.isDisposed() &&
    mounted.model.uri.toString() === mounted.monaco.Uri.parse(expectedPath).toString()
      ? mounted
      : null;
  return { binding, bindEditor };
}
