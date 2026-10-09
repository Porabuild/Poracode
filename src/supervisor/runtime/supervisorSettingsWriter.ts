import { isDeepStrictEqual } from "node:util";
import type { SupervisorEvent } from "@/shared/ipc";
import type { ConfirmSupervisorSettingsEditsPayload } from "@/shared/ipc/procedures/settings";
import {
  SETTINGS_ENTRY_FIELDS,
  type SettingsOwnerEdit,
  type SettingsSubject,
} from "@/shared/settingsTransactions";
import { OwnerConfirmations } from "./ownerConfirmations";

/**
 * Commits supervisor-owned settings records through the canonical settings
 * owner. settings.json belongs to the backend's settings authority; a direct
 * file write here would tear its committed document (version marker, unknown
 * fields) and make the owner refuse every later write.
 */
export interface SupervisorSettingsWriter {
  /** Resolves once the owner admits writes. Call before side effects
   * (downloads, extraction) that a refused commit would strand. */
  admit(): Promise<void>;
  /** Resolves after the owner durably committed every edit. */
  commit(edits: readonly SettingsOwnerEdit[]): Promise<void>;
}

/** Event/confirm channel to the backend settings owner. */
export class SupervisorSettingsEditsChannel implements SupervisorSettingsWriter {
  private readonly confirmations: OwnerConfirmations;

  constructor(
    private readonly deps: {
      emit: (event: SupervisorEvent) => void;
      invalidateSettings: () => void;
      timeoutMs?: number;
    },
  ) {
    this.confirmations = new OwnerConfirmations(
      {
        timeout: "Timed out while saving settings",
        refused: "The settings owner refused the change",
        disposed: "Supervisor exited before saving settings",
      },
      deps.timeoutMs,
    );
  }

  admit(): Promise<void> {
    return this.request([]);
  }

  commit(edits: readonly SettingsOwnerEdit[]): Promise<void> {
    return edits.length === 0 ? Promise.resolve() : this.request(edits);
  }

  confirm(payload: ConfirmSupervisorSettingsEditsPayload): void {
    // A late confirmation may still have committed; refresh cached reads.
    this.deps.invalidateSettings();
    this.confirmations.confirm(payload);
  }

  dispose(): void {
    this.confirmations.dispose();
  }

  private request(edits: readonly SettingsOwnerEdit[]): Promise<void> {
    return this.confirmations.request((requestId) =>
      this.deps.emit({ type: "settings-edits-requested", requestId, edits: [...edits] }),
    );
  }
}

const ENTRY_FIELDS: ReadonlySet<string> = new Set(SETTINGS_ENTRY_FIELDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unionKeys(...records: Record<string, unknown>[]): Set<string> {
  return new Set(records.flatMap((record) => Object.keys(record)));
}

function ownerEdit(subject: SettingsSubject, value: unknown): SettingsOwnerEdit {
  return value === undefined
    ? { subject }
    : { subject, value: value as SettingsOwnerEdit["value"] };
}

/**
 * The narrowest subject edits that turn `previous` into `next`: per-entry for
 * keyed record fields and per-key for agent settings, so the owner keeps
 * concurrent edits to sibling entries. Both sides must hold values as stored
 * (secrets sealed): an edit ships its `next` value verbatim. `fields` limits
 * the diff to the named top-level keys.
 */
export function settingsOwnerEdits(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
  options: { fields?: readonly string[] } = {},
): SettingsOwnerEdit[] {
  const edits: SettingsOwnerEdit[] = [];
  for (const field of options.fields ?? unionKeys(previous, next)) {
    const before = previous[field];
    const after = next[field];
    if (isDeepStrictEqual(before, after)) continue;
    if (field === "agentSettings" && isRecord(before) && isRecord(after)) {
      for (const agentKind of unionKeys(before, after)) {
        const beforeAgent = isRecord(before[agentKind]) ? before[agentKind] : {};
        const afterAgent = isRecord(after[agentKind]) ? after[agentKind] : {};
        for (const key of unionKeys(beforeAgent, afterAgent)) {
          if (isDeepStrictEqual(beforeAgent[key], afterAgent[key])) continue;
          edits.push(ownerEdit({ kind: "agent-setting", agentKind, key }, afterAgent[key]));
        }
      }
      continue;
    }
    if (ENTRY_FIELDS.has(field) && isRecord(before) && isRecord(after)) {
      for (const key of unionKeys(before, after)) {
        if (isDeepStrictEqual(before[key], after[key])) continue;
        edits.push(
          ownerEdit(
            { kind: "entry", field: field as (typeof SETTINGS_ENTRY_FIELDS)[number], key },
            after[key],
          ),
        );
      }
      continue;
    }
    edits.push(ownerEdit({ kind: "field", field } as SettingsSubject, after));
  }
  return edits;
}
