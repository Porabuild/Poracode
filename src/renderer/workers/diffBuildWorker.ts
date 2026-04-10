import { DiffFile, highlighter, setEnableFastDiffTemplate } from "@git-diff-view/core";

// Pre-render HTML templates for fast rendering via dangerouslySetInnerHTML
setEnableFastDiffTemplate(true);

export interface DiffBuildItem {
  key: string;
  diff: string;
  oldName: string;
  newName: string;
  fileLang: string;
  oldContent?: string;
  newContent?: string;
}

export type DiffBuildRequest = { id: number; items: DiffBuildItem[]; theme?: "light" | "dark" };
export type DiffBuildResponse = {
  id: number;
  results: Array<{
    key: string;
    data: { newFile: { fileName: string; fileLang: string; content: string | null }; hunks: string[] };
    bundle: ReturnType<DiffFile["_getFullBundle"]> | null;
  }>;
};

self.onmessage = (e: MessageEvent<DiffBuildRequest>) => {
  const { id, items, theme = "dark" } = e.data;
  const results = items.map((item) => {
    const data = {
      newFile: { fileName: item.newName, fileLang: item.fileLang, content: item.newContent ?? null },
      hunks: [item.diff],
    };
    if (!item.diff.trim()) return { key: item.key, data, bundle: null };
    try {
      const instance = DiffFile.createInstance({
        oldFile: { fileName: item.oldName, fileLang: item.fileLang, content: item.oldContent ?? null },
        ...data,
      });
      instance.initTheme(theme);
      instance.initRaw();
      instance.initSyntax({ registerHighlighter: highlighter });
      instance.buildSplitDiffLines();
      instance.buildUnifiedDiffLines();
      const bundle = instance._getFullBundle();
      instance.clear();
      return { key: item.key, data, bundle };
    } catch {
      return { key: item.key, data, bundle: null };
    }
  });
  self.postMessage({ id, results } satisfies DiffBuildResponse);
};
