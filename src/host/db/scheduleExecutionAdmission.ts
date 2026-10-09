import type { ScheduledTask } from "@/shared/contracts";
import { areSelectionBindingsEqual, scheduledTaskConfigSchema } from "@/shared/contracts";
import type { SelectionBinding } from "@/shared/selectionBinding.schemas";
import { msg } from "@/shared/messages";
import { hasUnsupportedSelectionBinding } from "@/shared/persistedSelectionBinding";
import { SELECTION_AXES } from "@/shared/selectionBinding";
import { getSqlite } from "./connection";

/**
 * Fresh, synchronous execution admission for scheduled launches.
 *
 * A captured {@link ScheduledTask} can be seconds old by the time its GUI
 * thread actually launches. This reads the authoritative `scheduled_tasks`
 * row by ID and refuses the launch when the row is gone, when its raw config
 * carries unsupported selection data, or when any execution-defining field
 * changed since capture: `agent_kind`, `project_id`, `prompt`, `model`, and
 * the own-presence-sensitive `effort`/`fast`/`thinking`/`contextSize`/
 * `selectionBinding` carriers. Presence is exact — `""`/`false` values are
 * real values, and a carrier or a recognized binding present on only one side
 * is a change.
 *
 * The binding's owner never substitutes for the row's actual route identity:
 * the full opaque `agent_kind` (including a profile kind) is compared as
 * stored, and no instance ID is inferred from a binding record.
 *
 * The coordinator calls this before Home-project creation and again after the
 * awaited permission lookup, immediately before thread/run persistence and
 * launch. It is one gate in addition to — never a substitute for — the
 * guarded full-save and final thread upsert checks.
 */

export type ScheduleExecutionRefusalReason = "missing" | "stale" | "unsupported";

export class ScheduleExecutionAdmissionError extends Error {
  readonly reason: ScheduleExecutionRefusalReason;

  constructor(reason: ScheduleExecutionRefusalReason, message: string) {
    super(message);
    this.name = "ScheduleExecutionAdmissionError";
    this.reason = reason;
  }
}

/** The only columns admission compares; the row is read fresh and read-only. */
interface AuthoritativeExecutionRow {
  agent_kind: string;
  config: string;
  project_id: string | null;
  prompt: string;
}

/**
 * Admit one captured task for launch against the authoritative row, or throw
 * {@link ScheduleExecutionAdmissionError}. Synchronous by contract — the
 * coordinator must be able to gate its launch path with no interleaving.
 */
export function dbAdmitScheduleExecution(captured: ScheduledTask): void {
  if (hasUnsupportedSelectionBinding(captured.config)) {
    throw new ScheduleExecutionAdmissionError(
      "unsupported",
      msg("modelSelection.unsupportedStoredData"),
    );
  }
  // Validate the incoming complete selection as well as the stored one;
  // callers must not introduce invalid metadata before Home creation.
  scheduledTaskConfigSchema.parse(captured.config);
  const row = getSqlite()
    .prepare("SELECT agent_kind, config, project_id, prompt FROM scheduled_tasks WHERE id = ?")
    .get(captured.id) as AuthoritativeExecutionRow | undefined;
  if (!row) {
    throw new ScheduleExecutionAdmissionError("missing", msg("schedule.executionStale"));
  }
  const rawConfig: unknown = JSON.parse(row.config);
  if (hasUnsupportedSelectionBinding(rawConfig)) {
    throw new ScheduleExecutionAdmissionError(
      "unsupported",
      msg("modelSelection.unsupportedStoredData"),
    );
  }
  if (executionFieldsChanged(captured, row, rawConfig)) {
    throw new ScheduleExecutionAdmissionError("stale", msg("schedule.executionStale"));
  }
}

function executionFieldsChanged(
  captured: ScheduledTask,
  row: AuthoritativeExecutionRow,
  rawConfig: unknown,
): boolean {
  if (row.agent_kind !== captured.agentKind) return true;
  if ((row.project_id ?? null) !== (captured.projectId ?? null)) return true;
  if (row.prompt !== captured.prompt) return true;

  const raw = isJsonObject(rawConfig) ? rawConfig : undefined;
  const actual: Record<string, unknown> | undefined = isJsonObject(captured.config)
    ? captured.config
    : undefined;
  if (!raw || !actual) return true;

  for (const key of ["model", ...SELECTION_AXES]) {
    if (ownDefined(raw, key) !== ownDefined(actual, key)) return true;
    if (ownDefined(raw, key) && raw[key] !== actual[key]) return true;
  }
  // Both sides are JSON-shaped here: the raw config was parsed from its
  // stored bytes, and an unsupported binding was already refused above, so a
  // present binding is a recognized record on both sides.
  return !areSelectionBindingsEqual(bindingOf(raw), bindingOf(actual));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Own, enumerable, defined — the only presence serialized JSON can carry. */
function ownDefined(record: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(record, key) && record[key] !== undefined;
}

function bindingOf(record: Record<string, unknown>): SelectionBinding | undefined {
  return ownDefined(record, "selectionBinding")
    ? (record.selectionBinding as SelectionBinding)
    : undefined;
}
