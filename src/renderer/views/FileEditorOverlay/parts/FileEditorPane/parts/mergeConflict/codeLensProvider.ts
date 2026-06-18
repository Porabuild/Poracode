import { msg } from "@lingui/core/macro";
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor, languages, IRange, IDisposable } from "monaco-editor";
import { i18n } from "@/renderer/i18n/i18n";
import type { ConflictBlock } from "@/renderer/utils/mergeConflicts";

export interface CodeLensCommandIds {
  acceptCurrent: string;
  acceptIncoming: string;
  acceptBoth: string;
}

export interface MergeConflictCodeLensSource {
  getBlocks: (model: MonacoEditor.ITextModel) => ConflictBlock[] | null;
  onDidChange: (listener: () => void) => () => void;
}

function lineRange(line: number): IRange {
  return { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 };
}

export function createMergeConflictCodeLensProvider(
  monaco: Monaco,
  source: MergeConflictCodeLensSource,
  commandIds: CodeLensCommandIds,
): languages.CodeLensProvider {
  const listeners = new Set<(e: languages.CodeLensProvider) => void>();
  const provider: languages.CodeLensProvider = {
    onDidChange: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    provideCodeLenses(model) {
      const blocks = source.getBlocks(model);
      if (!blocks || blocks.length === 0) return { lenses: [], dispose: () => {} };
      const lenses: languages.CodeLens[] = [];
      for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index]!;
        const range = lineRange(block.currentHeaderLine);
        lenses.push({
          range,
          id: `lc-merge-${index}-current`,
          command: {
            id: commandIds.acceptCurrent,
            title: i18n._(msg`Accept Current Change`),
            arguments: [model.uri.toString(), index],
          },
        });
        lenses.push({
          range,
          id: `lc-merge-${index}-incoming`,
          command: {
            id: commandIds.acceptIncoming,
            title: i18n._(msg`Accept Incoming Change`),
            arguments: [model.uri.toString(), index],
          },
        });
        lenses.push({
          range,
          id: `lc-merge-${index}-both`,
          command: {
            id: commandIds.acceptBoth,
            title: i18n._(msg`Accept Both Changes`),
            arguments: [model.uri.toString(), index],
          },
        });
      }
      return { lenses, dispose: () => {} };
    },
  };

  source.onDidChange(() => {
    for (const listener of listeners) listener(provider);
  });

  return provider;
}

export function registerMergeConflictCodeLens(
  monaco: Monaco,
  source: MergeConflictCodeLensSource,
  commandIds: CodeLensCommandIds,
): IDisposable {
  const provider = createMergeConflictCodeLensProvider(monaco, source, commandIds);
  return monaco.languages.registerCodeLensProvider({ scheme: "*" }, provider);
}
