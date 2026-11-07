import { useEffect, useState, type RefObject } from "react";
import type { DiffFile } from "@git-diff-view/react";
import {
  buildInWorker,
  diffFileFromBundle,
  extractDiffNames,
  getLang,
} from "../../GitReviewOverlay/parts/diffBuildClient";

/**
 * Builds the diff view model for one file patch once `enabled`, off the main
 * thread where the build client allows it. A new patch or theme rebuilds.
 * `settled` is true once the current input has an answer (`diffFile` is null
 * when the patch could not be built).
 */
export function useBuiltDiff(
  input: { path: string; patch: string; theme: "light" | "dark" },
  enabled: boolean,
): { diffFile: DiffFile | null; settled: boolean } {
  const { path, patch, theme } = input;
  const key = `${theme}\u0000${patch}`;
  const [built, setBuilt] = useState<{ key: string; diffFile: DiffFile | null } | null>(null);

  useEffect(() => {
    if (!enabled || built?.key === key) return;
    let cancelled = false;
    const { oldName, newName } = extractDiffNames(patch);
    void buildInWorker(
      [{ key: path, diff: patch, oldName, newName, fileLang: getLang(newName || path) }],
      theme,
    ).then((results) => {
      if (cancelled) return;
      const result = results[0];
      setBuilt({
        key,
        diffFile: result?.bundle ? diffFileFromBundle(result.data, result.bundle) : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, built, path, patch, theme]);

  const current = built?.key === key ? built : null;
  return { diffFile: current?.diffFile ?? null, settled: current !== null };
}

/**
 * True once the element has come within a screenful of `root`'s viewport, and
 * stays true. Without IntersectionObserver (tests, old shells) it is always true.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  root: RefObject<Element | null>,
): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { root: root.current, rootMargin: "1200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, ref, root]);
  return near;
}
