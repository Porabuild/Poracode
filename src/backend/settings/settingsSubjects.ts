import { createHash } from "node:crypto";
import { normalizeCrossagentTags } from "@/shared/crossagentRanking";
import { sharedSettingsSchema, type SharedSettings } from "@/shared/settings";
import {
  SETTINGS_ENTRY_FIELDS,
  SETTINGS_LIST_FIELDS,
  SETTINGS_MISSING_REVISION,
  settingsSubjectId,
  settingsSubjectField,
  type SettingsSubject,
  type SettingsSubjectState,
} from "@/shared/settingsTransactions";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** JSON canonicalization for equality; undefined object properties are absent on the wire. */
export function canonicalSettingsJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSettingsJson).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSettingsJson(value[key])}`)
      .join(",")}}`;
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Settings value is not JSON.");
  return result;
}

export function settingsListEntryId(
  field: (typeof SETTINGS_LIST_FIELDS)[number],
  value: unknown,
): string {
  if (!isRecord(value)) throw new Error("Invalid settings list entry.");
  if (field === "crossagentRoutingOverrides")
    return JSON.stringify(normalizeCrossagentTags(value.tags));
  if (field === "crossagentSelectionUsage") {
    const explicit = isRecord(value.explicitFields) ? value.explicitFields : {};
    return JSON.stringify([
      value.agentKind,
      value.modelId,
      value.effort ?? "",
      value.fast,
      normalizeCrossagentTags(value.tags),
      ...["provider", "model", "effort", "fast"].map((key) => explicit[key] ?? true),
    ]);
  }
  if (typeof value.id !== "string") throw new Error("Settings entry has no stable identity.");
  return value.id;
}

export function getSettingsSubjectValue(
  settings: Record<string, unknown> | SharedSettings,
  subject: SettingsSubject,
): unknown {
  if (subject.kind === "field") return settings[subject.field];
  if (subject.kind === "agent-setting") {
    const values = settings.agentSettings;
    const agent = isRecord(values) ? values[subject.agentKind] : undefined;
    return isRecord(agent) && Object.hasOwn(agent, subject.key) ? agent[subject.key] : undefined;
  }
  const values = settings[subject.field];
  if (subject.kind === "entry")
    return isRecord(values) && Object.hasOwn(values, subject.key) ? values[subject.key] : undefined;
  return Array.isArray(values)
    ? values.find((entry) => settingsListEntryId(subject.field, entry) === subject.key)
    : undefined;
}

export function settingsSubjectState(
  settings: SharedSettings,
  subject: SettingsSubject,
): SettingsSubjectState {
  const value = getSettingsSubjectValue(settings, subject);
  return {
    subject,
    revision: settingsSubjectRevision(settings, subject),
    ...(value === undefined
      ? {}
      : { value: JSON.parse(JSON.stringify(value)) as SettingsSubjectState["value"] }),
  } as SettingsSubjectState;
}

export function settingsSubjectRevision(
  settings: SharedSettings,
  subject: SettingsSubject,
): string {
  const value = getSettingsSubjectValue(settings, subject);
  return value === undefined
    ? SETTINGS_MISSING_REVISION
    : `s1:${createHash("sha256")
        .update(canonicalSettingsJson([settingsSubjectId(subject), value]))
        .digest("hex")}`;
}

/** Entry edits include ancestor revisions; field replacements also refresh their descendant revisions. */
export function affectedSettingsRevisions(
  settings: SharedSettings,
  subjects: readonly SettingsSubject[],
  previous = settings,
): Record<string, string> {
  const affected = new Map<string, SettingsSubject>();
  for (const subject of subjects) {
    affected.set(settingsSubjectId(subject), subject);
    const field: SettingsSubject = { kind: "field", field: settingsSubjectField(subject) };
    affected.set(settingsSubjectId(field), field);
  }
  const replacedFields = new Set(
    subjects.filter((subject) => subject.kind === "field").map((subject) => subject.field),
  );
  if (replacedFields.size > 0) {
    for (const subject of [...allSettingsSubjects(previous), ...allSettingsSubjects(settings)])
      if (subject.kind !== "field" && replacedFields.has(settingsSubjectField(subject)))
        affected.set(settingsSubjectId(subject), subject);
  }
  return Object.fromEntries(
    [...affected].map(([id, subject]) => [id, settingsSubjectRevision(settings, subject)]),
  );
}

export function allSettingsSubjects(settings: SharedSettings): SettingsSubject[] {
  const subjects: SettingsSubject[] = Object.keys(sharedSettingsSchema.shape).map((field) => ({
    kind: "field",
    field: field as keyof SharedSettings,
  }));
  for (const field of SETTINGS_ENTRY_FIELDS) {
    const entries = settings[field];
    if (isRecord(entries))
      for (const key of Object.keys(entries)) subjects.push({ kind: "entry", field, key });
  }
  for (const [agentKind, entries] of Object.entries(settings.agentSettings)) {
    for (const key of Object.keys(entries))
      subjects.push({ kind: "agent-setting", agentKind, key });
  }
  for (const field of SETTINGS_LIST_FIELDS) {
    for (const entry of settings[field])
      subjects.push({ kind: "list-entry", field, key: settingsListEntryId(field, entry) });
  }
  return subjects;
}

/** Apply exactly one declared subject; never accepts an arbitrary path. */
export function replaceSettingsSubject(
  raw: Record<string, unknown>,
  subject: SettingsSubject,
  value: unknown,
): void {
  if (subject.kind === "field") {
    if (value === undefined) delete raw[subject.field];
    else raw[subject.field] = value;
    return;
  }
  if (subject.kind === "agent-setting") {
    const agents = isRecord(raw.agentSettings) ? { ...raw.agentSettings } : {};
    const current = agents[subject.agentKind];
    const entries = isRecord(current) ? { ...current } : {};
    if (value === undefined) delete entries[subject.key];
    else entries[subject.key] = value;
    agents[subject.agentKind] = entries;
    raw.agentSettings = agents;
    return;
  }
  if (subject.kind === "entry") {
    const current = raw[subject.field];
    const entries = isRecord(current) ? { ...current } : {};
    if (value === undefined) delete entries[subject.key];
    else entries[subject.key] = value;
    raw[subject.field] = entries;
    return;
  }
  const current = raw[subject.field];
  const entries = Array.isArray(current) ? [...current] : [];
  const index = entries.findIndex(
    (entry) => settingsListEntryId(subject.field, entry) === subject.key,
  );
  if (value === undefined) {
    if (index >= 0) entries.splice(index, 1);
  } else {
    if (settingsListEntryId(subject.field, value) !== subject.key)
      throw new Error("Settings entry identity changed.");
    if (index >= 0) entries[index] = value;
    else entries.push(value);
  }
  raw[subject.field] = entries;
}

export function assertIndependentSettingsSubjects(subjects: readonly SettingsSubject[]): void {
  const seen = new Set<string>();
  for (const subject of subjects) {
    const id = settingsSubjectId(subject);
    if (seen.has(id)) throw new Error("Duplicate settings subject.");
    seen.add(id);
    const field = subject.kind === "agent-setting" ? "agentSettings" : subject.field;
    if (subject.kind === "field") {
      if (
        subjects.some(
          (other) =>
            other.kind !== "field" &&
            (other.kind === "agent-setting" ? "agentSettings" : other.field) === field,
        )
      ) {
        throw new Error("Overlapping settings subjects.");
      }
    }
  }
}

/** A load migration may normalize a supplied value, but it cannot bypass another subject's CAS. */
export function assertOnlyDeclaredSettingsSubjectsChanged(
  before: SharedSettings,
  after: SharedSettings,
  subjects: readonly SettingsSubject[],
): void {
  const remaining = [structuredClone(before), structuredClone(after)];
  for (const settings of remaining) {
    for (const subject of subjects) {
      replaceSettingsSubject(settings, subject, undefined);
      if (subject.kind === "agent-setting") {
        const values = settings.agentSettings[subject.agentKind];
        if (values && Object.keys(values).length === 0)
          delete settings.agentSettings[subject.agentKind];
      }
    }
  }
  if (canonicalSettingsJson(remaining[0]) !== canonicalSettingsJson(remaining[1]))
    throw new Error("Mutation changed an undeclared settings subject.");
}
