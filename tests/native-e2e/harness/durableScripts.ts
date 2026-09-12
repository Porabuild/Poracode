import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  isCheckpointFixtureId,
  isFaultFixtureId,
  type CheckpointFixtureId,
  type FaultFixtureId,
} from "./controlFixtures.ts";
import { NATIVE_E2E_SCRIPT_JOURNAL_VERSION } from "./versions.ts";

export const SCRIPT_JOURNAL_FILENAME = "scripts.json";

export type DurableScriptDraft =
  | { readonly kind: "checkpoint"; readonly id: CheckpointFixtureId }
  | { readonly kind: "fault"; readonly id: FaultFixtureId }
  | { readonly kind: "clear" };

export type DurableScriptEntry =
  | { readonly kind: "checkpoint"; readonly id: CheckpointFixtureId; readonly at: string }
  | { readonly kind: "fault"; readonly id: FaultFixtureId; readonly at: string }
  | { readonly kind: "clear"; readonly at: string };

export interface DurableScriptJournal {
  readonly schemaVersion: typeof NATIVE_E2E_SCRIPT_JOURNAL_VERSION;
  readonly entries: readonly DurableScriptEntry[];
}

export function scriptJournalPath(runDir: string): string {
  return join(runDir, SCRIPT_JOURNAL_FILENAME);
}

export function emptyScriptJournal(): DurableScriptJournal {
  return { schemaVersion: NATIVE_E2E_SCRIPT_JOURNAL_VERSION, entries: [] };
}

export function loadScriptJournal(path: string): DurableScriptJournal {
  if (!existsSync(path)) return emptyScriptJournal();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<DurableScriptJournal>;
  if (parsed.schemaVersion !== NATIVE_E2E_SCRIPT_JOURNAL_VERSION) {
    throw new Error(
      `Unsupported native-e2e script journal version ${String(parsed.schemaVersion)}; expected ${String(NATIVE_E2E_SCRIPT_JOURNAL_VERSION)}`,
    );
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error("native-e2e script journal is missing entries");
  }
  return {
    schemaVersion: NATIVE_E2E_SCRIPT_JOURNAL_VERSION,
    entries: parsed.entries.map(parseJournalEntry),
  };
}

export function appendScriptEntry(
  path: string,
  entry: DurableScriptDraft & { readonly at?: string },
): DurableScriptJournal {
  const journal = loadScriptJournal(path);
  const recorded = { ...entry, at: entry.at ?? new Date().toISOString() } as DurableScriptEntry;
  const next: DurableScriptJournal = {
    schemaVersion: NATIVE_E2E_SCRIPT_JOURNAL_VERSION,
    entries: [...journal.entries, recorded],
  };
  writeScriptJournal(path, next);
  return next;
}

export function writeScriptJournal(path: string, journal: DurableScriptJournal): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(journal, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

function parseJournalEntry(value: unknown): DurableScriptEntry {
  if (!value || typeof value !== "object") {
    throw new Error("native-e2e script journal entry is not an object");
  }
  const record = value as { kind?: unknown; id?: unknown; at?: unknown };
  const at = typeof record.at === "string" ? record.at : new Date(0).toISOString();
  if (record.kind === "clear") return { kind: "clear", at };
  if (
    record.kind === "checkpoint" &&
    typeof record.id === "string" &&
    isCheckpointFixtureId(record.id)
  ) {
    return { kind: "checkpoint", id: record.id, at };
  }
  if (record.kind === "fault" && typeof record.id === "string" && isFaultFixtureId(record.id)) {
    return { kind: "fault", id: record.id, at };
  }
  throw new Error(`native-e2e script journal has an unknown entry: ${JSON.stringify(value)}`);
}
