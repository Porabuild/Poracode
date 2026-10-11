import {
  modelFamilySelectionSchema,
  type AgentCapability,
  type ModelFamilySelection,
} from "./contracts/agent";
import { projectModelFamilies } from "./modelFamilySelection";
import {
  selectionBindingSchema,
  selectionBindingValuesSchema,
  type ModelSelection,
  type SelectionAxis,
  type SelectionBinding,
  type SelectionBindingOwner,
  type SelectionRedundantValues,
} from "./selectionBinding.schemas";

/**
 * Pure neutral operations for selection bindings: the one full-config
 * mutation API and the one consumer matching API. Both are event-aware and
 * provider-agnostic — routing is based on the caller's declared operation,
 * never on model-string syntax, provider names, or value patterns.
 *
 * A binding is inert evidence, never authority. `selectionBindingMatches`
 * proves only its recorded entries; every unrecorded actual control stays
 * outside its claim and is never erased by a match. Minting is a private
 * primitive of the mutation helper, not a second public writer: only a
 * resolved family event over a validated relation can mint, and only values
 * actually present in the resulting config and declared redundant by the
 * target surface's relation enter the record. No defaults are seeded.
 *
 * Retention first requires the previous record to match the previous
 * selection and the supplied owner. After any retention or axis reduction the
 * remaining record is validated against the resulting config; any mismatch
 * drops the entire remaining record. Stale evidence is never repaired by
 * changing controls back to recorded values.
 */

export type SelectionMutationEvent =
  | { type: "family-member-edit"; relation: ModelFamilySelection }
  | { type: "exact-model-edit" }
  | { type: "independent-carrier-edit"; axes: readonly SelectionAxis[] }
  | { type: "native-ack"; axes: readonly SelectionAxis[] }
  | { type: "unrelated-edit" }
  | { type: "owner-retarget" };

/**
 * A family event whose target cannot be proven: the relation failed strict
 * declaration validation, the resulting model does not resolve to an actual
 * member of that relation, or the supplied owner cannot form a valid record.
 * The mutation is refused without changing config or surface — no stamp is
 * invented and no member is guessed.
 */
export type SelectionBindingRefusalReason =
  | "unresolved-relation"
  | "unresolved-member"
  | "invalid-owner";

export class SelectionBindingRefusalError extends Error {
  readonly reason: SelectionBindingRefusalReason;

  constructor(reason: SelectionBindingRefusalReason, message: string) {
    super(message);
    this.name = "SelectionBindingRefusalError";
    this.reason = reason;
  }
}

/** The four neutral selection carrier axes, in canonical order. */
export const SELECTION_AXES: readonly SelectionAxis[] = [
  "effort",
  "fast",
  "thinking",
  "contextSize",
] as const;

/**
 * Whether an own, enumerable property exists with a defined value. JSON can
 * never carry an own `undefined` and never serializes a prototype carrier or
 * a non-enumerable field, so only an own, enumerable, defined property is an
 * actually-present value: an own `undefined` entry is not an exact recorded
 * value, and an inherited property is not present at all.
 */
function ownDefined(source: object, key: string): boolean {
  return (
    Object.prototype.propertyIsEnumerable.call(source, key) &&
    (source as Record<string, unknown>)[key] !== undefined
  );
}

/**
 * Whether a raw value carries the `required` keys, and every present
 * `optional` key, as OWN and ENUMERABLE properties. Installed Zod
 * materializes inherited properties as own output properties, so raw
 * ownership must be proven before any parse: an inherited required key — or
 * a known key JSON would drop because it is inherited or own non-enumerable
 * — must not become recorded or actual evidence through parsing. Unknown
 * enumerable keys, shapes, and literals stay the schema's responsibility;
 * this is a fixed local presence guard, not a serialization framework.
 */
function rawOwnKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    required.every((key) => Object.prototype.propertyIsEnumerable.call(value, key)) &&
    optional.every(
      (key) => !(key in value) || Object.prototype.propertyIsEnumerable.call(value, key),
    )
  );
}

/**
 * Strict recognized-v1 re-validation over possibly foreign input: raw
 * required keys and any present optional key must be own and enumerable (a
 * prototype carrier would otherwise be promoted into evidence by the parse),
 * and an own `undefined` recorded entry anywhere (recorded axis or optional
 * owner id) makes the record unproven before the schema is even consulted.
 * The wire schema stays portable and admits the shape (JSON cannot carry
 * it); this in-process guard is the admission.
 */
function recognizedRecord(binding: unknown): SelectionBinding | undefined {
  if (
    !rawOwnKeys(binding, ["version", "kind", "owner", "model", "inertValues"]) ||
    !rawOwnKeys(
      (binding as { owner?: unknown }).owner,
      ["agentKind", "presentationMode"],
      ["agentInstanceId"],
    ) ||
    !rawOwnKeys((binding as { inertValues?: unknown }).inertValues, [], SELECTION_AXES)
  ) {
    return undefined;
  }
  const candidate = binding as { owner?: unknown; inertValues?: unknown };
  if (!candidate.owner || typeof candidate.owner !== "object") return undefined;
  if (
    Object.hasOwn(candidate.owner, "agentInstanceId") &&
    (candidate.owner as Record<string, unknown>).agentInstanceId === undefined
  ) {
    return undefined;
  }
  if (!candidate.inertValues || typeof candidate.inertValues !== "object") return undefined;
  const inertValues = candidate.inertValues as Record<string, unknown>;
  for (const axis of SELECTION_AXES) {
    if (Object.hasOwn(inertValues, axis) && inertValues[axis] === undefined) return undefined;
  }
  const parsed = selectionBindingSchema.safeParse(binding);
  return parsed.success ? parsed.data : undefined;
}

/** Shape recognition only; persisted readers still require actual-owner matching at use time. */
export function isRecognizedSelectionBinding(binding: unknown): boolean {
  return recognizedRecord(binding) !== undefined;
}

/**
 * Whether a binding is a strict recognized v1 record that matches the actual
 * owner and selection: equal full owner (including optional instance-id
 * presence), exact model, and every recorded axis own-present on the actual
 * selection with exactly its recorded value. This public matcher is the
 * recognition boundary for unknown input; comparison of an already
 * recognized record lives in `matchesRecognizedRecord`.
 */
export function selectionBindingMatches(
  binding: unknown,
  actual: { owner: SelectionBindingOwner; selection: ModelSelection },
): boolean {
  const record = recognizedRecord(binding);
  if (!record) return false;
  return matchesRecognizedRecord(record, actual);
}

/**
 * Owner/model/axis comparison for an already recognized record. The actual
 * side proves the same raw presence: owner fields must be own, enumerable
 * properties, and the model and every claimed axis must be own, enumerable,
 * and defined — an inherited actual carrier is not present, so a record
 * minted from one would otherwise fail its own unchanged actual owner. One
 * failure makes the whole record unproven. Unrecorded actual controls are
 * outside the claim — a match does not decide redundancy, availability, or
 * permission.
 */
function matchesRecognizedRecord(
  record: SelectionBinding,
  actual: { owner: SelectionBindingOwner; selection: ModelSelection },
): boolean {
  if (
    !rawOwnKeys(actual.owner, ["agentKind", "presentationMode"], ["agentInstanceId"]) ||
    !ownDefined(actual.selection, "model")
  ) {
    return false;
  }
  if (record.owner.agentKind !== actual.owner.agentKind) return false;
  if (record.owner.presentationMode !== actual.owner.presentationMode) return false;
  // Optional instance id: equal presence (own property with a defined value).
  // An actual own `undefined` id normalizes to absent at the in-process
  // boundary; a record carrying one is refused outright by the record guard.
  const recordedId = ownDefined(record.owner, "agentInstanceId")
    ? record.owner.agentInstanceId
    : undefined;
  const actualId = ownDefined(actual.owner, "agentInstanceId")
    ? actual.owner.agentInstanceId
    : undefined;
  if (recordedId !== actualId) return false;
  if (record.model !== actual.selection.model) return false;
  for (const axis of SELECTION_AXES) {
    if (!Object.hasOwn(record.inertValues, axis)) continue; // no claim
    const recorded = record.inertValues[axis]; // own + defined by the record guard
    if (!ownDefined(actual.selection, axis)) return false;
    if (actual.selection[axis] !== recorded) return false;
  }
  return true;
}

/**
 * The single full-config selection mutation. `next` is the complete post-edit
 * config with `selectionBinding` removed and the caller's resolved patch or
 * deletions already applied; any runtime-injected stamp on it is discarded —
 * only the event decides the returned field. Inputs are never mutated.
 *
 * Event semantics:
 *
 * - `family-member-edit` — a successful deliberate relation edit. The relation
 *   must strictly validate and `next.model` must be an actual member of it;
 *   otherwise the mutation is refused. On success the old record is replaced
 *   by a fresh mint from the target relation and `next`, independently of any
 *   old mismatching owner/record. No declared present values means no stamp.
 * - `exact-model-edit` — an explicit raw/exact pick. Drops the entire old
 *   record, including a same-UID/same-value pick. Never mints.
 * - `independent-carrier-edit` — removes the touched axes from the retained
 *   record, even when unchanged in value, then applies the actual edit
 *   (already present in `next`). Drops the record when the reduction empties
 *   it or the remaining entries fail validation against `next`.
 * - `native-ack` — the same revocation for axes acknowledged by a successful
 *   native selector write, including same-value acknowledgements; a changed
 *   model drops the entire record. Never mints.
 * - `unrelated-edit` — a family-row no-op or an unrelated mode/approval/
 *   sandbox/MCP edit. Retains only still-matching previous intent; no mint,
 *   and an unstamped row is never upgraded.
 * - `owner-retarget` — a profile/instance retarget or ordinary-path surface
 *   switch. Drops the entire record. (A proven target-member presentation
 *   transition instead routes as `family-member-edit` with the target owner
 *   and target relation; a relation declaring no redundancy mints nothing.)
 */
export function applyThreadConfigMutation<T extends ModelSelection>(input: {
  previous: T;
  next: Omit<T, "selectionBinding">; // complete post-edit config, no stamp authority
  owner: SelectionBindingOwner; // actual ACTIVE/TARGET owner, required
  event: SelectionMutationEvent;
}): T {
  const result = withoutInjectedStamp(input.next);
  switch (input.event.type) {
    case "family-member-edit": {
      const relation = validatedRelation(input.event.relation);
      // Member resolution runs against the projected (intrinsically validated)
      // relation, and the target must be an own property of the resulting
      // config — an exact UID in an invalid graph, or a target read through a
      // prototype, resolves nothing.
      if (
        !ownDefined(result, "model") ||
        typeof result.model !== "string" ||
        !relation.projected.members.some((member) => member.model === result.model)
      ) {
        throw new SelectionBindingRefusalError(
          "unresolved-member",
          `Family event target ${JSON.stringify(result.model)} does not resolve to a member of the validated relation`,
        );
      }
      return withRecord(result, mintBinding(input.owner, result, relation));
    }
    case "exact-model-edit":
    case "owner-retarget":
      // Unconditional drops never parse the previous stamp.
      return withRecord(result, undefined);
    case "independent-carrier-edit":
    case "native-ack": {
      const retained = retainMatching(recognizedPreviousRecord(input.previous), input);
      if (!retained) return withRecord(result, undefined);
      const reduced = reduceAxes(retained, input.event.axes);
      return withRecord(result, validateAgainstNext(reduced, input));
    }
    case "unrelated-edit": {
      const retained = retainMatching(recognizedPreviousRecord(input.previous), input);
      return withRecord(result, validateAgainstNext(retained, input));
    }
  }
}

/** Copy the candidate without any stamp that a runtime may have injected into `next`. */
function withoutInjectedStamp<T extends ModelSelection>(next: Omit<T, "selectionBinding">): T {
  const copy = { ...(next as T) } as T & { selectionBinding?: unknown };
  delete copy.selectionBinding;
  return copy;
}

/** Attach exactly one record (or none) to the already-stripped result config. */
function withRecord<T extends ModelSelection>(config: T, record: SelectionBinding | undefined): T {
  const writable = config as T & { selectionBinding?: SelectionBinding };
  if (record === undefined) delete writable.selectionBinding;
  else writable.selectionBinding = record;
  return config;
}

/**
 * Recognize the raw previous stamp exactly once, only in retaining event
 * paths: the stamp property itself must be an own, enumerable property of
 * the previous config, so an inherited enclosing stamp — invisible to the
 * JSON this config serializes — stays absent instead of being promoted into
 * a record by parsing. Unconditional drops never call this.
 */
function recognizedPreviousRecord(previous: ModelSelection): SelectionBinding | undefined {
  if (!Object.prototype.propertyIsEnumerable.call(previous, "selectionBinding")) return undefined;
  return recognizedRecord(previous.selectionBinding);
}

/**
 * Retention precondition over an already recognized record: it must match
 * the previous selection and the supplied owner. Anything else drops the
 * entire record before any reduction.
 */
function retainMatching(
  record: SelectionBinding | undefined,
  input: {
    previous: ModelSelection;
    owner: SelectionBindingOwner;
  },
): SelectionBinding | undefined {
  if (!record) return undefined;
  if (!matchesRecognizedRecord(record, { owner: input.owner, selection: input.previous })) {
    return undefined;
  }
  return record;
}

/**
 * Post-retention validation over an already recognized record: it must still
 * match the resulting config under the same owner; a model/owner/value
 * mismatch drops the entire remaining record.
 */
function validateAgainstNext(
  record: SelectionBinding | undefined,
  input: {
    next: ModelSelection;
    owner: SelectionBindingOwner;
  },
): SelectionBinding | undefined {
  if (!record) return undefined;
  if (!matchesRecognizedRecord(record, { owner: input.owner, selection: input.next })) {
    return undefined;
  }
  return cloneRecord(record);
}

/** Remove touched axes from the record, even when their values did not change. */
function reduceAxes(
  record: SelectionBinding,
  axes: readonly SelectionAxis[],
): SelectionBinding | undefined {
  const remaining = { ...record.inertValues } as Record<string, unknown>;
  let changed = false;
  for (const axis of axes) {
    if (Object.hasOwn(remaining, axis)) {
      delete remaining[axis];
      changed = true;
    }
  }
  if (!changed) return record;
  if (Object.keys(remaining).length === 0) return undefined;
  const parsed = selectionBindingValuesSchema.safeParse(remaining);
  return parsed.success ? { ...record, inertValues: parsed.data } : undefined;
}

/**
 * A family relation proven by the existing shared validation algorithm: the
 * projected, inventory-intersected relation whose members are the only
 * resolvable targets, plus the surface's own redundant-carrier declaration
 * taken from the parsed canonical relation (the projector preserves the
 * declared field verbatim; the mint reads the declaration, never a projected
 * reinterpretation of it).
 */
interface ValidatedRelation {
  projected: ModelFamilySelection;
  redundantValues: SelectionRedundantValues | undefined;
}

/**
 * Strict validation for a family event's target relation: the canonical
 * portable relation schema (including its optional redundant declaration)
 * first, then the existing shared family algorithm over the declaration's own
 * members as the accepted inventory. That refuses every intrinsic-invalid
 * graph the plain schema alone admits — duplicate member UIDs or tuples, a
 * missing model-bound coordinate, selector selections outside the declared
 * options or not covering every selector, an unknown label key, and a default
 * UID outside its own relation. No family logic is forked here and the inputs
 * are never mutated.
 */
function validatedRelation(relation: ModelFamilySelection): ValidatedRelation {
  const parsed = modelFamilySelectionSchema.safeParse(relation);
  if (!parsed.success) {
    throw new SelectionBindingRefusalError(
      "unresolved-relation",
      "Family event relation failed strict declaration validation",
    );
  }
  // Read-only reuse: `projectModelFamilies` reads only `models` (ids) and
  // `modelFamilies` from the capability, never mutating either.
  const projectionInput = {
    models: parsed.data.members.map((member) => ({ id: member.model, label: member.model })),
    modelFamilies: [parsed.data],
  } as AgentCapability;
  const projected = projectModelFamilies(projectionInput)[0];
  if (!projected) {
    throw new SelectionBindingRefusalError(
      "unresolved-relation",
      "Family event relation is an intrinsically invalid graph under the shared family algorithm",
    );
  }
  return { projected, redundantValues: parsed.data.redundantValues };
}

/**
 * Private mint primitive: record the intersection of the resulting present
 * values with the relation's redundancy declaration. Only values actually
 * present and declared enter the record — present means an OWN, DEFINED
 * property of the resulting config (an inherited prototype carrier is absent
 * from the JSON this config will serialize, and an own `undefined` is not an
 * exact value). No defaults are seeded, and no recordable values means no
 * stamp. Member resolution was already proven by the caller of this
 * primitive.
 */
function mintBinding(
  owner: SelectionBindingOwner,
  selection: ModelSelection,
  relation: ValidatedRelation,
): SelectionBinding | undefined {
  const declared = relation.redundantValues;
  const candidate: { [K in SelectionAxis]?: string | boolean } = {};
  for (const axis of SELECTION_AXES) {
    const allowed = declared?.[axis];
    if (!allowed || allowed.length === 0) continue;
    if (!Object.hasOwn(selection, axis)) continue;
    const value = selection[axis];
    if (value === undefined) continue;
    if (!allowed.some((entry) => entry === value)) continue;
    candidate[axis] = value;
  }
  // Raw owner presence first: kind/presentation (and any present optional
  // id) must be own, enumerable properties of the actual owner. Otherwise
  // the mint would write an ID the actual owner does not own, and matching
  // would then ignore that inherited ID — the fresh record would fail its
  // own unchanged actual owner.
  if (!rawOwnKeys(owner, ["agentKind", "presentationMode"], ["agentInstanceId"])) {
    throw new SelectionBindingRefusalError(
      "invalid-owner",
      "Family event owner requires own fields",
    );
  }
  const ownerParsed = selectionBindingSchema.shape.owner.safeParse(owner);
  if (!ownerParsed.success) {
    throw new SelectionBindingRefusalError(
      "invalid-owner",
      "Family event owner does not satisfy the strict v1 owner shape",
    );
  }
  // Normalize the minted owner at the in-process boundary: an own `undefined`
  // optional id is omitted, so the record carries exactly the owner it proves.
  const parsedOwner = ownerParsed.data;
  const mintedOwner: SelectionBindingOwner = {
    agentKind: parsedOwner.agentKind,
    ...(ownDefined(parsedOwner, "agentInstanceId")
      ? { agentInstanceId: parsedOwner.agentInstanceId }
      : {}),
    presentationMode: parsedOwner.presentationMode,
  };
  const inertValues = selectionBindingValuesSchema.safeParse(candidate);
  if (!inertValues.success) return undefined;
  return {
    version: 1,
    kind: "family-member",
    owner: mintedOwner,
    model: selection.model,
    inertValues: inertValues.data,
  };
}

/** Fresh deep copy so retained/minted records never alias input objects. */
function cloneRecord(record: SelectionBinding): SelectionBinding {
  return { ...record, owner: { ...record.owner }, inertValues: { ...record.inertValues } };
}
