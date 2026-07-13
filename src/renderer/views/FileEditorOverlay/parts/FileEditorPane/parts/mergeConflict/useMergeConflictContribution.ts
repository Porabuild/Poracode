import { useEffect } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { parseMergeConflicts, type ConflictBlock } from "@/renderer/utils/mergeConflicts";
import { buildConflictDecorations } from "./decorations";
import { applyConflictAction, type ConflictAction } from "./actions";
import { registerMergeConflictCodeLens } from "./codeLensProvider";

const COMMAND_IDS = {
  acceptCurrent: "poracode.mergeConflict.acceptCurrent",
  acceptIncoming: "poracode.mergeConflict.acceptIncoming",
  acceptBoth: "poracode.mergeConflict.acceptBoth",
} as const;

// Module-level registries: Monaco's code-lens provider and registerCommand are global, so the
// dispatch path needs to look up state by model URI. Multiple editors may share a single model
// (split panes, fullscreen + modal), so editors are tracked as a Set per URI; blocks are
// model-scoped and shared. State for a URI is reclaimed only when the last editor unmounts.
let commandsRegistered = false;
const blocksByModelUri = new Map<string, ConflictBlock[]>();
const editorsByModelUri = new Map<string, Set<MonacoEditor.IStandaloneCodeEditor>>();
const providerListeners = new Set<() => void>();
let providerDisposable: { dispose: () => void } | null = null;

function ensureCommands(monaco: Monaco) {
  if (commandsRegistered) return;
  commandsRegistered = true;
  const dispatch =
    (action: ConflictAction) =>
    (_accessor: unknown, ...args: unknown[]) => {
      const [uri, index] = args as [string, number];
      const blocks = blocksByModelUri.get(uri);
      const editor = editorsByModelUri.get(uri)?.values().next().value;
      const block = blocks?.[index];
      if (!editor || !block) return;
      applyConflictAction(editor, block, action);
    };
  monaco.editor.registerCommand(COMMAND_IDS.acceptCurrent, dispatch("current"));
  monaco.editor.registerCommand(COMMAND_IDS.acceptIncoming, dispatch("incoming"));
  monaco.editor.registerCommand(COMMAND_IDS.acceptBoth, dispatch("both"));
}

function notifyProviders() {
  for (const listener of providerListeners) listener();
}

function ensureProvider(monaco: Monaco) {
  if (providerDisposable) return;
  providerDisposable = registerMergeConflictCodeLens(
    monaco,
    {
      getBlocks: (model) => blocksByModelUri.get(model.uri.toString()) ?? null,
      onDidChange: (listener) => {
        providerListeners.add(listener);
        return () => {
          providerListeners.delete(listener);
        };
      },
    },
    COMMAND_IDS,
  );
}

export function useMergeConflictContribution(args: {
  editor: MonacoEditor.IStandaloneCodeEditor | null;
  monaco: Monaco | null;
}) {
  const { editor, monaco } = args;

  useEffect(() => {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const uriKey = model.uri.toString();

    ensureCommands(monaco);
    ensureProvider(monaco);
    let editorsForUri = editorsByModelUri.get(uriKey);
    if (!editorsForUri) {
      editorsForUri = new Set();
      editorsByModelUri.set(uriKey, editorsForUri);
    }
    editorsForUri.add(editor);

    const collection = editor.createDecorationsCollection([]);

    let frame: number | null = null;
    const recompute = () => {
      const text = model.getValue();
      const blocks = parseMergeConflicts(text);
      blocksByModelUri.set(uriKey, blocks);
      collection.set(buildConflictDecorations(blocks));
      notifyProviders();
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        recompute();
      });
    };

    recompute();
    const changeSub = model.onDidChangeContent(schedule);

    return () => {
      changeSub.dispose();
      if (frame !== null) window.cancelAnimationFrame(frame);
      collection.clear();
      const remaining = editorsByModelUri.get(uriKey);
      if (remaining) {
        remaining.delete(editor);
        if (remaining.size === 0) {
          editorsByModelUri.delete(uriKey);
          blocksByModelUri.delete(uriKey);
        }
      }
      notifyProviders();
    };
  }, [editor, monaco]);
}
