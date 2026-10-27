import { useState } from "react";

/**
 * Device-local ticks for files already read in a review. This is disposable UI
 * state, not the host's viewed API: an unknown or older key is ignored, and
 * losing a tick only asks the reader to open the file again. Bump the key when
 * the stored shape changes.
 */
export const PR_VIEWED_FILES_STORAGE_KEY = "poracode.pr-viewed-files.v2";

const MAX_SCOPES = 200;

export type PrViewedState = "viewed" | "changed" | "unread";

type Marks = Record<string, Record<string, string>>;

function changeStats(fingerprint: string): string | undefined {
  const body = fingerprint.startsWith("pending:")
    ? fingerprint.slice("pending:".length)
    : fingerprint.startsWith("ready:")
      ? fingerprint.slice("ready:".length)
      : undefined;
  if (body === undefined) return undefined;
  const [additions, deletions] = body.split(":");
  return additions !== undefined && deletions !== undefined
    ? `${additions}:${deletions}`
    : undefined;
}

export function fileViewState(
  marks: Marks,
  scope: string,
  path: string,
  fingerprint: string,
): PrViewedState {
  const saved = marks[scope]?.[path];
  if (!saved) return "unread";
  if (saved === fingerprint) return "viewed";
  if (fingerprint.startsWith("pending:")) {
    return changeStats(saved) === changeStats(fingerprint) ? "viewed" : "changed";
  }
  if (saved.startsWith("pending:") && fingerprint.startsWith("ready:")) {
    return changeStats(saved) === changeStats(fingerprint) ? "viewed" : "changed";
  }
  return "changed";
}

/** Replace a pre-diff tick with the loaded patch so a later push can show Changed. */
export function absorbReadyFingerprints(
  marks: Marks,
  scope: string,
  entries: ReadonlyArray<{ path: string; fingerprint: string }>,
): Marks {
  let next = marks;
  for (const entry of entries) {
    const saved = next[scope]?.[entry.path];
    if (!saved?.startsWith("pending:") || !entry.fingerprint.startsWith("ready:")) continue;
    if (fileViewState(next, scope, entry.path, entry.fingerprint) !== "viewed") continue;
    next = withFileMark(next, scope, entry.path, entry.fingerprint);
  }
  return next;
}

export function withFileMark(
  marks: Marks,
  scope: string,
  path: string,
  fingerprint: string | null,
): Marks {
  const scopeMarks = { ...(marks[scope] ?? {}) };
  if (fingerprint === null) delete scopeMarks[path];
  else scopeMarks[path] = fingerprint;
  const rest = { ...marks };
  delete rest[scope];
  const next = Object.keys(scopeMarks).length === 0 ? rest : { ...rest, [scope]: scopeMarks };
  const keys = Object.keys(next);
  if (keys.length <= MAX_SCOPES) return next;
  const trimmed = { ...next };
  for (const key of keys.slice(0, keys.length - MAX_SCOPES)) delete trimmed[key];
  return trimmed;
}

export function readViewedMarks(storage: Storage | undefined): Marks {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(PR_VIEWED_FILES_STORAGE_KEY) ?? "") as unknown;
    if (!isMarks(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function writeViewedMarks(storage: Storage | undefined, marks: Marks): void {
  if (!storage) return;
  try {
    storage.setItem(PR_VIEWED_FILES_STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // A full or blocked store only forgets the tick. The review itself is unchanged.
  }
}

function isMarks(value: unknown): value is Marks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (scope) =>
      !!scope &&
      typeof scope === "object" &&
      !Array.isArray(scope) &&
      Object.values(scope).every((mark) => typeof mark === "string"),
  );
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function usePrViewedFiles(scope: string) {
  const storage = browserStorage();
  const [marks, setMarks] = useState<Marks>(() => readViewedMarks(storage));
  const update = (path: string, fingerprint: string | null) => {
    setMarks((current) => {
      const next = withFileMark(current, scope, path, fingerprint);
      writeViewedMarks(storage, next);
      return next;
    });
  };
  return {
    state: (path: string, fingerprint: string) => fileViewState(marks, scope, path, fingerprint),
    mark: (path: string, fingerprint: string) => update(path, fingerprint),
    clear: (path: string) => update(path, null),
    absorb: (entries: ReadonlyArray<{ path: string; fingerprint: string }>) => {
      setMarks((current) => {
        const next = absorbReadyFingerprints(current, scope, entries);
        if (next === current) return current;
        writeViewedMarks(storage, next);
        return next;
      });
    },
  };
}
