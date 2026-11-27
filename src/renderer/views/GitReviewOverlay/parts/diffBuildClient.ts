import { DiffFile, highlighter, getLang } from "@git-diff-view/react";
import type {
  DiffBuildItem,
  DiffBuildRequest,
  DiffBuildResponse,
} from "@/renderer/workers/diffBuildWorker";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { hasAnyClientBridge, readClientRuntime } from "@/renderer/clientRuntime";

export type { DiffBuildItem };
export type DiffBuildResult = DiffBuildResponse["results"][number];

// ── Worker singleton ─────────────────────────────────────────

let worker: Worker | null = null;
let nextId = 0;
const WORKER_RESPONSE_TIMEOUT_MS = 1_500;
const SMALL_BROWSER_DIFF_TEXT_LIMIT = 96 * 1024;
const pending = new Map<
  number,
  {
    resolve: (
      results: DiffBuildResponse["results"] | PromiseLike<DiffBuildResponse["results"]>,
    ) => void;
    fallback: () => Promise<DiffBuildResponse["results"]>;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

function failPendingWorkerBuilds(): void {
  const builds = [...pending.values()];
  pending.clear();
  worker?.terminate();
  worker = null;
  for (const build of builds) {
    clearTimeout(build.timeout);
    build.resolve(build.fallback());
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../../workers/diffBuildWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<DiffBuildResponse>) => {
      const build = pending.get(e.data.id);
      if (build) {
        pending.delete(e.data.id);
        clearTimeout(build.timeout);
        build.resolve(e.data.results);
      }
    };
    worker.onerror = failPendingWorkerBuilds;
    worker.onmessageerror = failPendingWorkerBuilds;
  }
  return worker;
}

function buildOnMainThread(
  items: DiffBuildItem[],
  theme: "light" | "dark",
): DiffBuildResponse["results"] {
  return items.map((item) => {
    const data = {
      newFile: {
        fileName: item.newName,
        fileLang: item.fileLang,
        content: item.newContent ?? null,
      },
      hunks: [item.diff],
    };
    if (!item.diff.trim()) return { key: item.key, data, bundle: null };
    try {
      const instance = DiffFile.createInstance({
        oldFile: {
          fileName: item.oldName,
          fileLang: item.fileLang,
          content: item.oldContent ?? null,
        },
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
}

async function buildFallback(
  items: DiffBuildItem[],
  theme: "light" | "dark",
): Promise<DiffBuildResponse["results"]> {
  const results: DiffBuildResponse["results"] = [];
  for (const item of items) {
    // Give the selected diff's loading state and other input time to paint.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    results.push(...buildOnMainThread([item], theme));
  }
  return results;
}

export function buildInWorker(
  items: DiffBuildItem[],
  theme?: "light" | "dark",
): Promise<DiffBuildResponse["results"]> {
  const resolvedTheme = theme ?? "dark";
  const only = items.length === 1 ? items[0] : undefined;
  const browser = hasAnyClientBridge() && readClientRuntime().host === "browser";
  if (browser && only) {
    const textLength =
      only.diff.length + (only.oldContent?.length ?? 0) + (only.newContent?.length ?? 0);
    // A single render model is cheaper to build locally than to transfer
    // back from the worker. For a large selection, yield before building so
    // the first hunk and pending input can be handled in the meantime.
    return textLength <= SMALL_BROWSER_DIFF_TEXT_LIMIT
      ? Promise.resolve(buildOnMainThread(items, resolvedTheme))
      : buildFallback(items, resolvedTheme);
  }
  if (typeof Worker === "undefined") return buildFallback(items, resolvedTheme);
  return new Promise((resolve) => {
    const id = nextId++;
    const fallback = () => buildFallback(items, resolvedTheme);
    const timeout = setTimeout(() => {
      const build = pending.get(id);
      if (!build) return;
      pending.delete(id);
      build.resolve(build.fallback());
    }, WORKER_RESPONSE_TIMEOUT_MS);
    pending.set(id, { resolve, fallback, timeout });
    try {
      getWorker().postMessage({
        id,
        items,
        theme: resolvedTheme,
        // Browser batches transfer text models without eagerly generated HTML.
        ...(browser ? { fastTemplates: false } : {}),
      } satisfies DiffBuildRequest);
    } catch {
      // Some paired sites or browsers refuse module workers at construction.
      failPendingWorkerBuilds();
    }
  });
}

/** Reconstruct a DiffFile on the main thread from a worker-built full bundle. No parsing. */
export function diffFileFromBundle(
  data: DiffBuildResult["data"],
  bundle: ReturnType<DiffFile["_getFullBundle"]>,
): DiffFile {
  return DiffFile.createInstance(data, bundle);
}

// ── Helpers ──────────────────────────────────────────────────

export function useDiffTheme(): "light" | "dark" {
  const themeMode = useSharedSettings((s) => s.themeMode);
  if (themeMode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return themeMode;
}

export function extractDiffNames(raw: string): { oldName: string; newName: string } {
  let oldName = "";
  let newName = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("--- ")) {
      oldName = line.slice(4).replace(/^a\//, "");
    } else if (line.startsWith("+++ ")) {
      newName = line.slice(4).replace(/^b\//, "");
      break;
    }
  }
  return { oldName, newName };
}

export { getLang };
