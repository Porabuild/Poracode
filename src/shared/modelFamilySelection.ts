import type {
  AgentCapability,
  ModelFamilyMember,
  ModelFamilySelection,
  ModelFamilySelectorOption,
} from "./contracts/agent";
import type { LabeledOption } from "./contracts/common";
import type { ThreadConfig } from "./contracts/config";
import { sortEffortsByCanonicalOrder } from "./effortOrder";
import { modelSelectionFor } from "./agentSelection";
import { isMessageKey } from "./messages";

/**
 * Neutral projection/edit algorithm for the optional `modelFamilies` capability
 * relation (see `modelFamilySelectionSchema` in `contracts/agent`).
 *
 * The provider adapter owns compiling its native catalog into the relation;
 * everything here is provider-agnostic. The relation is display metadata only:
 * `capabilities.models` stays the raw, backwards-compatible selection
 * authority, and member UIDs are always the exact advertised native ids. The
 * helpers never guess ("nearest model" substitutions are out of scope) — an
 * edit whose complete tuple has no member resolves to `null`/absent options so
 * callers can surface a visible unavailability.
 *
 * All lookups run through {@link projectModelFamilies}, which drops invalid or
 * ambiguous descriptors and intersects members with the current raw accepted
 * inventory. A descriptor that fails validation falls back to the ordinary
 * non-family behavior instead of surfacing half a relation.
 */

/**
 * One user edit at the event-handler boundary. Relationship resolution happens
 * only here — restore, capability refresh, native echo, and ordinary config
 * merging must not call {@link applyModelSelectionEdit}.
 *
 * A projected family row (the collapsed "one entry for the whole relation"
 * picker row) carries `kind: "family"`; every other row — plain models,
 * favorites, and recents, including a favorite of the family's representative
 * — carries `kind: "model"` and always selects that exact UID. The two kinds
 * differ only for the representative UID, where the family row preserves the
 * currently selected member while an exact pick selects the representative.
 */
export type ModelSelectionEdit =
  | { kind: "model"; model: string }
  | { kind: "family"; model: string }
  | { kind: "selector"; selectorId: string; value: string }
  | { kind: "effort"; value: string }
  | { kind: "fast"; value: boolean };

/** The saved-config axes the family helpers read. Drafts may omit `model`. */
export type ModelFamilyConfig = Partial<
  Pick<ThreadConfig, "model" | "effort" | "fast" | "thinking" | "contextSize">
>;

/** The relation-owned coordinates of one member. */
interface FamilyTuple {
  selections: Record<string, string>;
  effort?: string;
  fast?: boolean;
}

function tupleKey(tuple: FamilyTuple): string {
  const selectors = Object.keys(tuple.selections).sort();
  return JSON.stringify([
    selectors.map((id) => [id, tuple.selections[id]]),
    tuple.effort ?? null,
    tuple.fast === undefined ? null : tuple.fast,
  ]);
}

/** Whether `candidate` matches `selections` on every selector except `skipId`. */
function holdsOtherSelections(
  candidate: ModelFamilyMember,
  selections: Record<string, string>,
  skipId?: string,
): boolean {
  return Object.entries(selections).every(
    ([id, value]) => id === skipId || candidate.selections[id] === value,
  );
}

/**
 * Validate and normalize one descriptor against the raw accepted inventory.
 * Returns `undefined` for any shape the relation contract does not guarantee —
 * duplicate member UIDs or tuples, unknown/missing selector selections, a
 * model-bound coordinate missing from a member, an unknown `labelKey`, an
 * empty relation, or a representative that collides with another family.
 */
function projectFamily(
  family: ModelFamilySelection,
  accepted: ReadonlySet<string>,
  seenRepresentatives: ReadonlySet<string>,
): ModelFamilySelection | undefined {
  if (!family || typeof family !== "object") return undefined;
  if (typeof family.model !== "string" || family.model.length === 0) return undefined;
  if (typeof family.label !== "string" || family.label.length === 0) return undefined;
  const bindings = family.bindings;
  if (
    !bindings ||
    (bindings.effort !== "model" && bindings.effort !== "config") ||
    (bindings.fast !== "model" && bindings.fast !== "config")
  ) {
    return undefined;
  }
  const effortEncoded = bindings.effort === "model";
  const fastEncoded = bindings.fast === "model";

  const selectorOptions = new Map<string, Set<string>>();
  for (const selector of family.selectors ?? []) {
    if (!selector || typeof selector.id !== "string" || selector.id.length === 0) return undefined;
    if (selectorOptions.has(selector.id)) return undefined;
    if (typeof selector.labelKey !== "string" || !isMessageKey(selector.labelKey)) return undefined;
    const ids = new Set<string>();
    for (const option of selector.options ?? []) {
      if (!option || typeof option.id !== "string" || option.id.length === 0) return undefined;
      if (typeof option.label !== "string" || option.label.length === 0) return undefined;
      if (ids.has(option.id)) return undefined;
      ids.add(option.id);
    }
    if (ids.size === 0) return undefined;
    selectorOptions.set(selector.id, ids);
  }

  const byTuple = new Map<string, string>();
  const memberIds = new Set<string>();
  const members: ModelFamilyMember[] = [];
  for (const member of family.members ?? []) {
    if (!member || typeof member.model !== "string" || member.model.length === 0) return undefined;
    if (memberIds.has(member.model)) return undefined;
    const selections: Record<string, string> = {};
    for (const [selectorId, optionIds] of selectorOptions) {
      const value = member.selections?.[selectorId];
      if (typeof value !== "string" || !optionIds.has(value)) return undefined;
      selections[selectorId] = value;
    }
    if (member.selections && Object.keys(member.selections).length !== selectorOptions.size) {
      return undefined;
    }
    if (effortEncoded && (typeof member.effort !== "string" || member.effort.length === 0)) {
      return undefined;
    }
    if (fastEncoded && typeof member.fast !== "boolean") return undefined;
    // Coordinates a binding does not own are display-independent noise for this
    // family; the projection drops them instead of letting them leak.
    const tuple: FamilyTuple = { selections };
    if (effortEncoded && member.effort !== undefined) tuple.effort = member.effort;
    if (fastEncoded && member.fast !== undefined) tuple.fast = member.fast;
    const key = tupleKey(tuple);
    if (byTuple.has(key)) return undefined;
    byTuple.set(key, member.model);
    memberIds.add(member.model);
    members.push({
      model: member.model,
      selections,
      ...(effortEncoded && member.effort !== undefined ? { effort: member.effort } : {}),
      ...(fastEncoded && member.fast !== undefined ? { fast: member.fast } : {}),
    });
  }
  if (members.length === 0) return undefined;

  // Intersect with the current raw accepted inventory. A member that left the
  // accepted set disappears from the relation; an empty remainder invalidates
  // the whole descriptor rather than advertising an empty family.
  const present = members.filter((member) => accepted.has(member.model));
  if (present.length === 0) return undefined;

  // The descriptor default must belong to its own relation; one pointing at a
  // foreign UID is a producer bug, not a substitutable default.
  if (!memberIds.has(family.model)) return undefined;
  // If the intersection removed the declared default, substitute a real member
  // inside the projection only (the input descriptor is never rewritten).
  const fallback = present[0];
  if (!fallback) return undefined;
  const model = accepted.has(family.model) ? family.model : fallback.model;
  if (seenRepresentatives.has(model)) return undefined;
  return {
    model,
    label: family.label,
    selectors: (family.selectors ?? []).map((selector) => ({ ...selector })),
    bindings: { effort: bindings.effort, fast: bindings.fast },
    // The surface-scoped redundant-carrier declaration is preserved verbatim
    // (selectionBinding contract): the projector never interprets the declared
    // ids, and downstream mint/cold-policy consumers must see exactly what the
    // provider declared for this surface's relation.
    ...(family.redundantValues !== undefined ? { redundantValues: family.redundantValues } : {}),
    members: present,
  };
}

/**
 * Valid, inventory-intersected descriptors for one capability surface.
 * Invalid descriptors are dropped (safe fallback), not repaired; `capabilities`
 * itself is never mutated and its raw `models` are untouched.
 */
export function projectModelFamilies(capabilities: AgentCapability): ModelFamilySelection[] {
  const accepted = new Set((capabilities.models ?? []).map((model) => model.id));
  const seenRepresentatives = new Set<string>();
  const seenMembers = new Set<string>();
  const families: ModelFamilySelection[] = [];
  for (const family of capabilities.modelFamilies ?? []) {
    const projected = projectFamily(family, accepted, seenRepresentatives);
    if (!projected) continue;
    // A member has one owner. A later overlapping descriptor stays on the
    // raw-model fallback path rather than giving the same UID two meanings.
    if (projected.members.some((member) => seenMembers.has(member.model))) continue;
    seenRepresentatives.add(projected.model);
    for (const member of projected.members) seenMembers.add(member.model);
    families.push(projected);
  }
  return families;
}

function familyForMember(
  families: readonly ModelFamilySelection[],
  model: string | undefined,
): { family: ModelFamilySelection; member: ModelFamilyMember } | undefined {
  if (!model) return undefined;
  for (const family of families) {
    const member = family.members.find((candidate) => candidate.model === model);
    if (member) return { family, member };
  }
  return undefined;
}

/** The projected family whose relation contains `model` as an exact member. */
export function modelFamilyForModel(
  capabilities: AgentCapability,
  model: string | undefined,
): ModelFamilySelection | undefined {
  return familyForMember(projectModelFamilies(capabilities), model)?.family;
}

/** The displayed model/effort/fast view for a saved config under its family. */
export function modelFamilyDisplayConfig(
  capabilities: AgentCapability,
  config: ModelFamilyConfig | undefined,
): Partial<ThreadConfig> | undefined {
  const found = familyForMember(projectModelFamilies(capabilities), config?.model);
  if (!found || config?.model === undefined) return undefined;
  const { family, member } = found;
  // A meaningful stored override on a model-bound axis is not re-interpreted as
  // a tuple request: the caller keeps the raw saved view and its existing
  // rejection path until an explicit edit replaces the selection.
  if (family.bindings.effort === "model" && !isInertEffort(config.effort)) return undefined;
  if (family.bindings.fast === "model" && !isInertFast(config.fast)) return undefined;
  const effort = family.bindings.effort === "model" ? member.effort : config.effort;
  const fast = family.bindings.fast === "model" ? member.fast : config.fast;
  return {
    model: config.model,
    ...(effort !== undefined ? { effort } : {}),
    ...(fast !== undefined ? { fast } : {}),
  };
}

function isInertEffort(effort: string | undefined): boolean {
  return effort === undefined || effort === "" || effort === "default";
}

function isInertFast(fast: boolean | undefined): boolean {
  return fast === undefined || fast === false;
}

/**
 * Options of one family selector, filtered to coordinates reachable from the
 * current selection: the other selectors (and encoded Effort/Fast axes) are
 * held at the current member's values. `[]` when no family/selector applies.
 */
export function modelFamilySelectorOptions(
  capabilities: AgentCapability,
  config: ModelFamilyConfig | undefined,
  selectorId: string,
): ModelFamilySelectorOption[] {
  const found = familyForMember(projectModelFamilies(capabilities), config?.model);
  if (!found) return [];
  const { family, member } = found;
  const selector = family.selectors.find((candidate) => candidate.id === selectorId);
  if (!selector) return [];
  return selector.options.filter((option) =>
    family.members.some(
      (candidate) =>
        holdsOtherSelections(candidate, member.selections, selectorId) &&
        candidate.selections[selectorId] === option.id &&
        (family.bindings.effort !== "model" || candidate.effort === member.effort) &&
        (family.bindings.fast !== "model" || candidate.fast === member.fast),
    ),
  );
}

/**
 * Effort ladder for the current selection. Inside a model-bound family this is
 * the encoded coordinates reachable without changing any other axis; otherwise
 * it falls back to the ordinary (non-family) ladder.
 */
export function modelFamilyEfforts(
  capabilities: AgentCapability,
  config: ModelFamilyConfig | undefined,
): string[] {
  const found = familyForMember(projectModelFamilies(capabilities), config?.model);
  if (found && found.family.bindings.effort === "model") {
    const { family, member } = found;
    const efforts = new Set<string>();
    for (const candidate of family.members) {
      if (!holdsOtherSelections(candidate, member.selections)) continue;
      if (family.bindings.fast === "model" && candidate.fast !== member.fast) continue;
      if (candidate.effort !== undefined) efforts.add(candidate.effort);
    }
    return sortEffortsByCanonicalOrder([...efforts]);
  }
  return modelSelectionFor(capabilities, config?.model ?? "").reasoning.values;
}

/**
 * Whether the Fast toggle can flip for the current selection: inside a
 * model-bound family an opposite-Fast sibling must exist, otherwise the
 * ordinary fast availability applies.
 */
export function modelFamilyFastAvailable(
  capabilities: AgentCapability,
  config: ModelFamilyConfig | undefined,
): boolean {
  const found = familyForMember(projectModelFamilies(capabilities), config?.model);
  if (found && found.family.bindings.fast === "model") {
    const { family, member } = found;
    return family.members.some(
      (candidate) =>
        holdsOtherSelections(candidate, member.selections) &&
        (family.bindings.effort !== "model" || candidate.effort === member.effort) &&
        candidate.fast !== member.fast,
    );
  }
  return modelSelectionFor(capabilities, config?.model ?? "").fast.available;
}

/**
 * The atomic patch for a resolved family member: the exact target UID plus the
 * inert stored seeds for every encoded axis (the existing composite storage
 * convention). Config-bound axes are left alone — their independent carriers
 * stay whatever the caller saved.
 */
function atomicFamilyPatch(
  family: ModelFamilySelection,
  member: ModelFamilyMember,
): Partial<ThreadConfig> {
  return {
    model: member.model,
    ...(family.bindings.effort === "model" ? { effort: "" } : {}),
    ...(family.bindings.fast === "model" ? { fast: false } : {}),
  };
}

/**
 * Meaningful thinking/context cannot be represented by an encoded relation and
 * must not be silently kept beneath a resolved family patch (the strict
 * resolver would reject the result). The caller treats `null` as a visible
 * unavailability instead of a side-effect-erasing save. Config-bound families
 * patch only `model`, so their unrelated carriers are untouched.
 */
function encodedAxesEditable(
  family: ModelFamilySelection,
  config: ModelFamilyConfig | undefined,
): boolean {
  const relationBound = family.bindings.effort === "model" || family.bindings.fast === "model";
  if (!relationBound) return true;
  return config?.thinking !== true && (!config?.contextSize || config.contextSize === "default");
}

/**
 * Resolve one explicit user edit against the current surface relation.
 *
 * Returns the single atomic valid patch, an empty patch when the edit is a
 * no-op (a projected family-row click while already inside that family), or
 * `null` when the edit is unavailable: an unknown model, a selector edit
 * without family context, or a complete tuple with no member. No sibling
 * guessing, no suffix or label reconstruction — a hole stays a hole.
 *
 * `kind: "model"` is an exact pick and always selects the named UID — including
 * the family's representative, so an exact favorite or recent of that UID
 * restores that exact member instead of collapsing into a family no-op.
 * `kind: "family"` is the projected family row: inside its own family it
 * preserves the current member, otherwise it adopts the declared default.
 *
 * Absent-family edits use the ordinary patch semantics (`{model}` / `{effort}` /
 * `{fast}`); a selector edit without a family has nothing to resolve and is
 * `null`. This function is event-path only — never call it during restore,
 * capability refresh, native echo, or ordinary config merging.
 */
export function applyModelSelectionEdit(
  capabilities: AgentCapability,
  config: ModelFamilyConfig | undefined,
  edit: ModelSelectionEdit,
): Partial<ThreadConfig> | null {
  const families = projectModelFamilies(capabilities);
  const current = familyForMember(families, config?.model);
  switch (edit.kind) {
    case "model": {
      for (const family of families) {
        const member = family.members.find((candidate) => candidate.model === edit.model);
        if (!member) continue;
        // Exact pick: the named member is selected as is, representative
        // included. A deliberate click on a value equal to an old seed is
        // still an edit.
        if (!encodedAxesEditable(family, config)) return null;
        return atomicFamilyPatch(family, member);
      }
      return (capabilities.models ?? []).some((model) => model.id === edit.model)
        ? { model: edit.model }
        : null;
    }
    case "family": {
      const family = families.find((candidate) => candidate.model === edit.model);
      if (!family) return null;
      // The family row stands for the whole relation: inside it, the current
      // member is retained; a fresh pick adopts the declared default.
      if (current?.family === family) return {};
      if (!encodedAxesEditable(family, config)) return null;
      const member = family.members.find((candidate) => candidate.model === family.model);
      return member ? atomicFamilyPatch(family, member) : null;
    }
    case "selector": {
      if (!current) return null;
      const { family, member } = current;
      const selector = family.selectors.find((candidate) => candidate.id === edit.selectorId);
      if (!selector || !selector.options.some((option) => option.id === edit.value)) return null;
      if (!encodedAxesEditable(family, config)) return null;
      const target = family.members.find(
        (candidate) =>
          holdsOtherSelections(candidate, member.selections, edit.selectorId) &&
          candidate.selections[edit.selectorId] === edit.value &&
          (family.bindings.effort !== "model" || candidate.effort === member.effort) &&
          (family.bindings.fast !== "model" || candidate.fast === member.fast),
      );
      return target ? atomicFamilyPatch(family, target) : null;
    }
    case "effort": {
      if (current && current.family.bindings.effort === "model") {
        const { family, member } = current;
        if (!encodedAxesEditable(family, config)) return null;
        const target = family.members.find(
          (candidate) =>
            holdsOtherSelections(candidate, member.selections) &&
            (family.bindings.fast !== "model" || candidate.fast === member.fast) &&
            candidate.effort === edit.value,
        );
        return target ? atomicFamilyPatch(family, target) : null;
      }
      return { effort: edit.value };
    }
    case "fast": {
      if (current && current.family.bindings.fast === "model") {
        const { family, member } = current;
        if (!encodedAxesEditable(family, config)) return null;
        const target = family.members.find(
          (candidate) =>
            holdsOtherSelections(candidate, member.selections) &&
            (family.bindings.effort !== "model" || candidate.effort === member.effort) &&
            candidate.fast === edit.value,
        );
        return target ? atomicFamilyPatch(family, target) : null;
      }
      return { fast: edit.value };
    }
  }
}

/**
 * Map one explicit presentation-surface switch onto the target surface's
 * relation, exactly. The source selection's selector coordinates come from the
 * source member — only while the stored carriers on source-encoded axes are
 * inert, because a meaningful override is an unprovable (already rejected)
 * state whose tuple cannot be derived — and source-independent controls come
 * from the canonical user state, filled from the source's declared defaults.
 * The target resolves an accepted member by those selector coordinates plus
 * the mapped values for target-encoded axes, and validates target-independent
 * carriers against the target's declared ladders.
 *
 * Returns the atomic target patch (`undefined` when family semantics are not
 * involved on either surface and the ordinary presentation path should run,
 * `null` when they are involved but cannot be proven — a hole, an unknown
 * shape, a missing target relation, or an unsupported carrier — so the caller
 * keeps the current surface and config and surfaces a visible failure). No
 * nearest substitution, no adaptive fallback, and hydration must never call
 * this: it resolves deliberate user events only.
 */
export function resolveFamilyPresentationTransition(
  source: AgentCapability,
  target: AgentCapability,
  config: ModelFamilyConfig | undefined,
): Partial<ThreadConfig> | null | undefined {
  const current = familyForMember(projectModelFamilies(source), config?.model);
  if (!current) {
    // Not a source relation member. If the target relation nonetheless claims
    // this UID, the stored carriers carry the other surface's meaning and the
    // mapping is unprovable; otherwise family semantics are simply not
    // involved.
    return modelFamilyForModel(target, config?.model) ? null : undefined;
  }
  const { family: sourceFamily, member } = current;
  if (sourceFamily.bindings.effort === "model" && !isInertEffort(config?.effort)) return null;
  if (sourceFamily.bindings.fast === "model" && !isInertFast(config?.fast)) return null;

  // The two surface descriptors must describe the same relation shape for a
  // mapping to exist; selector ids are descriptor-local, so a target family
  // with a different id set is a different relation, not a rename.
  const sourceSelectorIds = sourceFamily.selectors.map((selector) => selector.id);
  const targetFamily = projectModelFamilies(target).find(
    (candidate) =>
      candidate.selectors.length === sourceFamily.selectors.length &&
      candidate.selectors.every((selector) => sourceSelectorIds.includes(selector.id)),
  );
  if (!targetFamily) return null;

  // Source semantics per axis: encoded coordinates read the member; independent
  // controls read the canonical user state, with the source's declared default
  // filling an unset effort (Fast has no declared default — unset means off).
  const sourceEffort =
    sourceFamily.bindings.effort === "model"
      ? member.effort
      : isInertEffort(config?.effort)
        ? (modelSelectionFor(source, member.model).reasoning.default ?? "")
        : (config?.effort ?? "");
  const sourceFast =
    sourceFamily.bindings.fast === "model" ? member.fast === true : config?.fast === true;

  // Target resolution: an accepted member for the complete mapped tuple, and
  // declared known carriers for the independent axes. A hole stays a hole.
  const targetMember = targetFamily.members.find(
    (candidate) =>
      sourceFamily.selectors.every(
        (selector) => candidate.selections[selector.id] === member.selections[selector.id],
      ) &&
      (targetFamily.bindings.effort !== "model" || candidate.effort === sourceEffort) &&
      (targetFamily.bindings.fast !== "model" || candidate.fast === sourceFast),
  );
  if (!targetMember) return null;
  // Meaningful thinking/context cannot ride an encoded target relation; on a
  // config-bound target they stay unrelated carriers of the merged config.
  if (!encodedAxesEditable(targetFamily, config)) return null;

  const targetSelection = modelSelectionFor(target, targetMember.model);
  let targetEffort = "";
  if (targetFamily.bindings.effort !== "model") {
    if (!sourceEffort) {
      targetEffort = targetSelection.reasoning.default ?? "";
    } else if (targetSelection.reasoning.values.includes(sourceEffort)) {
      targetEffort = sourceEffort;
    } else {
      return null;
    }
  }
  let targetFast = false;
  if (targetFamily.bindings.fast !== "model") {
    if (sourceFast && !targetSelection.fast.available) return null;
    targetFast = sourceFast;
  }

  return {
    ...atomicFamilyPatch(targetFamily, targetMember),
    ...(targetFamily.bindings.effort !== "model" ? { effort: targetEffort } : {}),
    ...(targetFamily.bindings.fast !== "model" ? { fast: targetFast } : {}),
  };
}

/**
 * The visible main model list: represented member rows collapse into one
 * labeled family row placed at the representative's catalog position; every
 * other raw choice is preserved untouched. The representative UID stays the
 * row id, so an explicit family pick can adopt (or retain) an exact member.
 */
export function modelFamilyPickerModels(capabilities: AgentCapability): LabeledOption[] {
  const models = capabilities.models ?? [];
  const families = projectModelFamilies(capabilities);
  if (families.length === 0) return models;
  const members = new Set(families.flatMap((family) => family.members.map((m) => m.model)));
  const representatives = new Map<string, ModelFamilySelection>();
  for (const family of families) {
    if (!representatives.has(family.model)) representatives.set(family.model, family);
  }
  const rows: LabeledOption[] = [];
  const emitted = new Set<string>();
  for (const model of models) {
    const family = representatives.get(model.id);
    if (family) {
      emitted.add(family.model);
      rows.push({ id: family.model, label: family.label });
      continue;
    }
    if (!members.has(model.id)) rows.push(model);
  }
  return rows;
}
