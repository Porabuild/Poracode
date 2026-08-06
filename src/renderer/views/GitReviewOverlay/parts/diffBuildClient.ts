import { DiffFile, highlighter, getLang } from "@git-diff-view/react";
import type {
  DiffBuildItem,
  DiffBuildRequest,
  DiffBuildResponse,
} from "@/renderer/workers/diffBuildWorker";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export type { DiffBuildItem };
export type DiffBuildResult = DiffBuildResponse["results"][number];

// ── Worker singleton ─────────────────────────────────────────

let worker: Worker | null = null;
let nextId = 0;
const WORKER_RESPONSE_TIMEOUT_MS = 1_500;
const pending = new Map<
  number,
  {
    resolve: (results: DiffBuildResponse["results"]) => void;
    fallback: () => DiffBuildResponse["results"];
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

export function buildInWorker(
  items: DiffBuildItem[],
  theme?: "light" | "dark",
): Promise<DiffBuildResponse["results"]> {
  const resolvedTheme = theme ?? "dark";
  // The remote PWA serves source through a mobile-specific Vite entry. Its
  // module worker can fail before posting a response, which leaves every
  // expanded Git card loading forever. Diffs are opened one at a time in this
  // surface (and oversized diffs are already gated), so use the same tested
  // synchronous builder there. Electron retains the worker path.
  if (
    typeof Worker === "undefined" ||
    import.meta.env.VITE_PORACODE_BUILD_TARGET === "mobile" ||
    window.poracode?.appVersion === "remote"
  ) {
    return Promise.resolve(buildOnMainThread(items, resolvedTheme));
  }
  return new Promise((resolve) => {
    const id = nextId++;
    const fallback = () => buildOnMainThread(items, resolvedTheme);
    const timeout = setTimeout(() => {
      const build = pending.get(id);
      if (!build) return;
      pending.delete(id);
      build.resolve(build.fallback());
    }, WORKER_RESPONSE_TIMEOUT_MS);
    pending.set(id, { resolve, fallback, timeout });
    getWorker().postMessage({ id, items, theme: resolvedTheme } satisfies DiffBuildRequest);
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
