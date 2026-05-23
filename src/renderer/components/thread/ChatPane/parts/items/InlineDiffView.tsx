import { Component, useEffect, useState, type ReactNode } from "react";
import { DiffView, highlighter } from "@git-diff-view/react";
import type { DiffFile } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { normalizeDiffFilePath } from "@/shared/lineUnifiedDiff";
import {
  buildInWorker,
  diffFileFromBundle,
  extractDiffNames,
  getLang,
  useDiffTheme,
} from "@/renderer/views/GitReviewOverlay/parts/diffBuildClient";
import { CommandOutputViewport } from "./CommandOutputViewport";

const UNIFIED_MODE = 4;
/** Fall back to raw text for patches larger than ~100 KB. */
const MAX_DIFF_LENGTH = 100_000;

interface InlineDiffViewProps {
  diffText: string;
  filePath: string;
  /** When set (Cursor ACP content diffs), passed to git-diff-view for reliable rich rendering. */
  oldText?: string;
  newText?: string;
}

/**
 * Renders a unified diff string as a rich, syntax-highlighted diff view using
 * `@git-diff-view/react`. The heavy DiffFile parsing runs in a web worker to
 * keep the UI thread responsive. Falls back to Shiki-highlighted raw diff text
 * when the patch is too large or the worker build fails.
 */
export function InlineDiffView({ diffText, filePath, oldText, newText }: InlineDiffViewProps) {
  const theme = useDiffTheme();
  const [diffFiles, setDiffFiles] = useState<InlineDiffFile[]>([]);
  const [state, setState] = useState<"building" | "ready" | "fallback">(
    diffText.length > MAX_DIFF_LENGTH ? "fallback" : "building",
  );

  useEffect(() => {
    if (diffText.length > MAX_DIFF_LENGTH) {
      setState("fallback");
      return;
    }
    let cancelled = false;
    setState("building");
    setDiffFiles([]);

    const parts = prepareInlineDiffParts(diffText, filePath);
    const includeContent = parts.length === 1 && oldText !== undefined && newText !== undefined;
    const items = parts.map((part, index) => {
      const oldName = part.oldName || (oldText === "" ? "/dev/null" : `a/${part.displayPath}`);
      const newName = part.newName || `b/${part.displayPath}`;
      return {
        key: `${index}:${part.displayPath}`,
        diff: part.diff,
        oldName,
        newName,
        fileLang: getLang(part.displayPath),
        ...(includeContent ? { oldContent: oldText, newContent: newText } : {}),
      };
    });

    void buildInWorker(items, theme)
      .then((results) => {
        if (cancelled) return;
        const built = results.flatMap((r) =>
          r.bundle ? [{ key: r.key, diffFile: diffFileFromBundle(r.data, r.bundle) }] : [],
        );
        if (built.length === results.length && built.length > 0) {
          setDiffFiles(built);
          setState("ready");
        } else {
          setState("fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setState("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, [diffText, filePath, oldText, newText, theme]);

  if (state === "fallback") {
    return <CommandOutputViewport text={diffText} language="diff" />;
  }

  if (state === "building" || diffFiles.length === 0) {
    return <div className="py-2 text-xs text-[color:var(--muted)]">Building diff…</div>;
  }

  return (
    <DiffViewErrorBoundary fallback={<CommandOutputViewport text={diffText} language="diff" />}>
      <div className="flex max-h-[min(24rem,50vh)] flex-col gap-2 overflow-auto [scrollbar-gutter:stable]">
        {diffFiles.map(({ key, diffFile }) => (
          <DiffView
            key={key}
            diffFile={diffFile}
            diffViewMode={UNIFIED_MODE}
            diffViewTheme={theme}
            diffViewFontSize={12}
            registerHighlighter={highlighter}
            diffViewHighlight={true}
            diffViewWrap={false}
          />
        ))}
      </div>
    </DiffViewErrorBoundary>
  );
}

interface InlineDiffFile {
  key: string;
  diffFile: DiffFile;
}

interface DiffNames {
  oldName: string;
  newName: string;
}

interface InlineDiffPart {
  diff: string;
  displayPath: string;
  oldName: string;
  newName: string;
}

export function prepareInlineDiffParts(diffText: string, fallbackPath: string): InlineDiffPart[] {
  const parts = splitUnifiedDiffFiles(diffText).map((part) =>
    normalizeInlineDiffPart(part, fallbackPath),
  );
  const merged: InlineDiffPart[] = [];
  const byNames = new Map<string, InlineDiffPart>();

  for (const part of parts) {
    const body = extractDiffBody(part.diff);
    if (!body) {
      merged.push(part);
      continue;
    }
    const key = `${part.oldName}\0${part.newName}`;
    const existing = byNames.get(key);
    if (!existing) {
      byNames.set(key, part);
      merged.push(part);
      continue;
    }
    existing.diff = buildUnifiedDiffText(existing.displayPath, existing.oldName, existing.newName, [
      extractDiffBody(existing.diff) ?? "",
      body,
    ]);
  }

  return merged;
}

export function splitUnifiedDiffFiles(diffText: string): string[] {
  const lines = diffText.split(/\r?\n/);
  const chunks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current && current.length > 0) chunks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }

  if (current && current.length > 0) chunks.push(current);
  if (chunks.length === 0) return [diffText];
  return chunks.map((chunk) => chunk.join("\n"));
}

function resolveDisplayPath(filePath: string, names: DiffNames): string {
  const candidate = names.newName && names.newName !== "/dev/null" ? names.newName : names.oldName;
  return normalizeDiffFilePath(candidate && candidate !== "/dev/null" ? candidate : filePath);
}

function normalizeInlineDiffPart(diff: string, fallbackPath: string): InlineDiffPart {
  const names = extractDiffNames(diff);
  const displayPath = resolveDisplayPath(fallbackPath, names);
  const oldName = names.oldName === "/dev/null" ? "/dev/null" : `a/${displayPath}`;
  const newName = names.newName === "/dev/null" ? "/dev/null" : `b/${displayPath}`;
  const body = extractDiffBody(diff);
  if (!body) {
    return {
      diff,
      displayPath,
      oldName: names.oldName || oldName,
      newName: names.newName || newName,
    };
  }
  return {
    diff: buildUnifiedDiffText(displayPath, oldName, newName, [body]),
    displayPath,
    oldName,
    newName,
  };
}

function extractDiffBody(diff: string): string | undefined {
  const lines = diff.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("@@"));
  if (start < 0) return undefined;
  return lines.slice(start).join("\n").trimEnd();
}

function buildUnifiedDiffText(
  displayPath: string,
  oldName: string,
  newName: string,
  bodies: readonly string[],
): string {
  return [
    `diff --git a/${displayPath} b/${displayPath}`,
    `--- ${oldName}`,
    `+++ ${newName}`,
    ...bodies.map((body) => body.trimEnd()).filter((body) => body.length > 0),
    "",
  ].join("\n");
}

/** Catches render errors from DiffView (e.g. missing canvas in test envs). */
class DiffViewErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
