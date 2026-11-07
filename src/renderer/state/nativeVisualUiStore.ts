import { create } from "zustand";
import { sha256Hex } from "@/shared/remote/contract/sha256";
import { MAX_NATIVE_VISUALS_PER_MESSAGE } from "@/shared/nativeVisuals";

/** Device-local interactions, separate from canonical conversation source. */
export const NATIVE_VISUAL_UI_VERSION = 2 as const;
export const NATIVE_VISUAL_UI_KEY = "poracode-native-visual-ui-v2";
export const LEGACY_NATIVE_VISUAL_UI_KEY = "poracode-native-visual-ui-v1";
const MAX_ENTRIES = 128;
const MAX_STORAGE_BYTES = 256 * 1024;

export interface NativeVisualTableView {
  query: string;
  sort?: { column: number; direction: "ascending" | "descending" };
}

export interface NativeVisualChartView {
  hiddenSeries: number[];
  point: number;
  showTable: boolean;
}

export interface NativeVisualUiEntry {
  hostId?: string;
  threadId: string;
  inputs: [string, number][];
  zoom: number;
  checked?: [string, boolean][];
  tabs?: [string, string][];
  charts?: [string, NativeVisualChartView][];
  tables?: [string, NativeVisualTableView][];
}

const BLOCK_PATH = /^\d{1,2}(?:\/[A-Za-z][A-Za-z0-9_-]{0,39}\/\d{1,2})?$/;
const CHECK_PATH =
  /^\d{1,2}(?:\/[A-Za-z][A-Za-z0-9_-]{0,39}\/\d{1,2})?\/[A-Za-z][A-Za-z0-9_-]{0,39}$/;

function pairs(
  value: unknown,
  limit: number,
  valid: (key: string, value: unknown) => boolean,
): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= limit &&
      value.every(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          typeof pair[0] === "string" &&
          valid(pair[0], pair[1]),
      ))
  );
}

function validTableView(value: unknown): value is NativeVisualTableView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as Partial<NativeVisualTableView>;
  return (
    Object.keys(view).every((key) => key === "query" || key === "sort") &&
    typeof view.query === "string" &&
    view.query.length <= 200 &&
    (view.sort === undefined ||
      (view.sort !== null &&
        typeof view.sort === "object" &&
        Object.keys(view.sort).every((key) => key === "column" || key === "direction") &&
        Number.isSafeInteger(view.sort.column) &&
        view.sort.column >= 0 &&
        view.sort.column < 8 &&
        (view.sort.direction === "ascending" || view.sort.direction === "descending")))
  );
}

function validChartView(value: unknown): value is NativeVisualChartView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as Partial<NativeVisualChartView>;
  return (
    Object.keys(view).every((key) => ["hiddenSeries", "point", "showTable"].includes(key)) &&
    typeof view.point === "number" &&
    Number.isSafeInteger(view.point) &&
    view.point >= 0 &&
    view.point < 100 &&
    typeof view.showTable === "boolean" &&
    Array.isArray(view.hiddenSeries) &&
    view.hiddenSeries.length <= 4 &&
    view.hiddenSeries.every((index) => Number.isSafeInteger(index) && index >= 0 && index < 4)
  );
}

function validEntry(candidate: unknown, version: 1 | 2): candidate is NativeVisualUiEntry {
  if (!candidate || typeof candidate !== "object") return false;
  const entry = candidate as Partial<NativeVisualUiEntry>;
  return (
    !Array.isArray(candidate) &&
    Object.keys(entry).every((key) =>
      (version === 1
        ? ["hostId", "threadId", "inputs", "zoom"]
        : ["hostId", "threadId", "inputs", "zoom", "checked", "tabs", "charts", "tables"]
      ).includes(key),
    ) &&
    typeof entry.hostId === "string" &&
    entry.hostId.length > 0 &&
    entry.hostId.length <= 256 &&
    typeof entry.threadId === "string" &&
    entry.threadId.length > 0 &&
    entry.threadId.length <= 256 &&
    typeof entry.zoom === "number" &&
    entry.zoom >= 75 &&
    entry.zoom <= 200 &&
    entry.zoom % 25 === 0 &&
    Array.isArray(entry.inputs) &&
    entry.inputs.length <= 8 &&
    entry.inputs.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === "string" &&
        pair[0].length <= 40 &&
        typeof pair[1] === "number" &&
        Number.isFinite(pair[1]) &&
        Math.abs(pair[1]) <= 1e12,
    ) &&
    (version === 1 ||
      (pairs(
        entry.checked,
        64,
        (key, value) => CHECK_PATH.test(key) && typeof value === "boolean",
      ) &&
        pairs(
          entry.tabs,
          6,
          (key, value) =>
            BLOCK_PATH.test(key) &&
            typeof value === "string" &&
            /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value),
        ) &&
        pairs(entry.charts, 12, (key, value) => BLOCK_PATH.test(key) && validChartView(value)) &&
        pairs(entry.tables, 12, (key, value) => BLOCK_PATH.test(key) && validTableView(value))))
  );
}

function decodeEntries(raw: string, version: 1 | 2): Map<string, NativeVisualUiEntry> | undefined {
  try {
    if (raw.length > MAX_STORAGE_BYTES || new TextEncoder().encode(raw).length > MAX_STORAGE_BYTES)
      return undefined;
    const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown } | null;
    if (
      parsed?.version !== version ||
      Object.keys(parsed).some((key) => key !== "version" && key !== "entries") ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length > MAX_ENTRIES
    )
      return undefined;
    const entries = new Map<string, NativeVisualUiEntry>();
    for (const pair of parsed.entries) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== "string" ||
        pair[0].length > 1_024 ||
        !validEntry(pair[1], version)
      )
        return undefined;
      let identity: unknown;
      try {
        identity = JSON.parse(pair[0]) as unknown;
      } catch {
        return undefined;
      }
      if (
        !Array.isArray(identity) ||
        identity.length !== 6 ||
        identity[0] !== version ||
        identity[1] !== pair[1].hostId ||
        identity[2] !== pair[1].threadId ||
        typeof identity[3] !== "string" ||
        !Number.isSafeInteger(identity[4]) ||
        identity[4] < 0 ||
        identity[4] >= MAX_NATIVE_VISUALS_PER_MESSAGE ||
        typeof identity[5] !== "string" ||
        !/^[a-f0-9]{64}$/.test(identity[5])
      )
        return undefined;
      const key =
        version === 1 ? JSON.stringify([NATIVE_VISUAL_UI_VERSION, ...identity.slice(1)]) : pair[0];
      entries.set(key, pair[1]);
    }
    return entries;
  } catch {
    return undefined;
  }
}

function readEntries(): Map<string, NativeVisualUiEntry> {
  try {
    const current = localStorage.getItem(NATIVE_VISUAL_UI_KEY);
    if (current !== null) return decodeEntries(current, 2) ?? new Map();
    const legacy = localStorage.getItem(LEGACY_NATIVE_VISUAL_UI_KEY);
    return legacy === null ? new Map() : (decodeEntries(legacy, 1) ?? new Map());
  } catch {
    return new Map();
  }
}

function serializedEntries(entries: ReadonlyMap<string, NativeVisualUiEntry>): string {
  return JSON.stringify({
    version: NATIVE_VISUAL_UI_VERSION,
    entries: [...entries].filter(([, entry]) => entry.hostId !== undefined),
  });
}

function persistEntries(entries: ReadonlyMap<string, NativeVisualUiEntry>): void {
  try {
    for (const [key, version] of [
      [LEGACY_NATIVE_VISUAL_UI_KEY, 1],
      [NATIVE_VISUAL_UI_KEY, 2],
    ] as const) {
      const raw = localStorage.getItem(key);
      // Retain legacy bytes; any unknown document also fences another tab's writes.
      if (raw !== null && !decodeEntries(raw, version)) return;
    }
    const serialized = serializedEntries(entries);
    if (new TextEncoder().encode(serialized).length <= MAX_STORAGE_BYTES)
      localStorage.setItem(NATIVE_VISUAL_UI_KEY, serialized);
  } catch {
    // Storage can be unavailable; the current interaction remains memory-only.
  }
}

export function nativeVisualUiKey(
  hostId: string | undefined,
  threadId: string,
  itemId: string,
  ordinal: number,
  source: string,
): string {
  return JSON.stringify([
    NATIVE_VISUAL_UI_VERSION,
    hostId ?? null,
    threadId,
    itemId,
    ordinal,
    sha256Hex(source),
  ]);
}

export const useNativeVisualUiStore = create<{
  entries: ReadonlyMap<string, NativeVisualUiEntry>;
  put: (key: string, entry: NativeVisualUiEntry) => void;
  touch: (key: string) => void;
  forgetThread: (hostId: string | undefined, threadId: string) => void;
}>((set) => ({
  entries: readEntries(),
  put: (key, entry) =>
    set((state) => {
      if (JSON.stringify(state.entries.get(key)) === JSON.stringify(entry)) return {};
      const entries = new Map(state.entries);
      entries.delete(key);
      entries.set(key, entry);
      while (
        entries.size > MAX_ENTRIES ||
        new TextEncoder().encode(serializedEntries(entries)).length > MAX_STORAGE_BYTES
      )
        entries.delete(entries.keys().next().value!);
      persistEntries(entries);
      return { entries };
    }),
  touch: (key) =>
    set((state) => {
      const entry = state.entries.get(key);
      if (!entry || [...state.entries.keys()].at(-1) === key) return {};
      const entries = new Map(state.entries);
      entries.delete(key);
      entries.set(key, entry);
      persistEntries(entries);
      return { entries };
    }),
  // Call only on confirmed deletion, never on a resident catalog/page eviction.
  forgetThread: (hostId, threadId) =>
    set((state) => {
      const entries = new Map(
        [...state.entries].filter(
          ([, entry]) => entry.hostId !== hostId || entry.threadId !== threadId,
        ),
      );
      if (entries.size === state.entries.size) return {};
      persistEntries(entries);
      return { entries };
    }),
}));
