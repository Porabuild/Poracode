import { z } from "zod";

/**
 * Canonical schemas for the neutral selection-binding contract (v1).
 *
 * A binding records the inert carrier values a deliberate family-member edit
 * deliberately wrote onto an encoded relation. It is inert evidence only: it
 * proves its recorded entries and makes no claim about any other control. The
 * wire shape is intentionally strict and portable — closed objects, a literal
 * version/kind, and a nonempty four-axis recorded-value map expressed as a
 * union (anyOf) instead of a custom refine or catch, so generated native
 * validators enforce exactly the same admission. Unknown keys are rejected,
 * never stripped into a recognized record.
 *
 * JSON missing, `""`, `false`, and `"default"` are distinct; `null` is invalid.
 * Values are never trimmed or coerced. An own property whose value is
 * `undefined` is not an exact recorded value and must not mint or match; at
 * in-process boundaries omit undefined optional properties.
 *
 * This module is an independent leaf: it imports nothing but zod, so
 * `contracts/agent` can consume {@link selectionRedundantValuesSchema} for the
 * canonical `modelFamilySelectionSchema` field without a cycle, and the pure
 * selection/binding shapes stay the single definitions every consumer
 * (thread/provider/project drafts, generation request payloads, operations)
 * imports. The surface-scoped declaration rides the family relation itself
 * (`modelFamilySelectionSchema.redundantValues`) — there is no second extended
 * relation schema.
 */

/** The four neutral selection carrier axes a binding can record. */
export type SelectionAxis = "effort" | "fast" | "thinking" | "contextSize";

/**
 * Carrier shape shared by the binding record and the canonical selection.
 * Optional here means "no claim": an omitted axis makes no statement about the
 * actual control, including no claim of absence.
 */
export const selectionCarrierShape = {
  effort: z.string().optional(),
  fast: z.boolean().optional(),
  thinking: z.boolean().optional(),
  contextSize: z.string().optional(),
} as const;

/** All four axes optional; the all-absent shape is valid here but is not a recordable map. */
export const selectionValuesSchema = z.strictObject(selectionCarrierShape);

/**
 * Nonempty CLOSED recorded-value map, expressed with portable anyOf rather
 * than a custom refine: each branch requires exactly one axis and retains ALL
 * four properties, so overlapping branches preserve every recorded field and
 * `{}` is rejected by every branch.
 */
export const selectionBindingValuesSchema = z.union([
  selectionValuesSchema.extend({ effort: z.string() }),
  selectionValuesSchema.extend({ fast: z.boolean() }),
  selectionValuesSchema.extend({ thinking: z.boolean() }),
  selectionValuesSchema.extend({ contextSize: z.string() }),
]);

/**
 * The actual execution-context owner, supplied independently of any stamp.
 * `agentKind` is the full selected/registered adapter kind (a profile's
 * `vendor:<id>` shape is already one string and is never decomposed).
 * `agentInstanceId` is carried exactly when the actual route has it; its
 * absence is not a claim of default-local execution. The concrete selected
 * presentation is the owner's surface.
 */
export const selectionBindingOwnerSchema = z.strictObject({
  agentKind: z.string().min(1),
  agentInstanceId: z.string().min(1).optional(),
  presentationMode: z.enum(["terminal", "gui"]),
});

/**
 * A recognized v1 binding: the recorded inert values of one deliberate
 * family-member edit, scoped to one owner and one exact member UID.
 */
export const selectionBindingSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal("family-member"),
  owner: selectionBindingOwnerSchema,
  model: z.string().min(1),
  inertValues: selectionBindingValuesSchema,
});

/**
 * Canonical complete utility selection. An empty `model` retains the existing
 * implicit/default-model convention, which can NEVER receive a binding.
 * Thread configs keep their own `min(1)` model rule; this shape is the
 * internal utility value.
 */
export const modelSelectionSchema = z.strictObject({
  model: z.string(),
  ...selectionCarrierShape,
  selectionBinding: selectionBindingSchema.optional(),
});

/**
 * Surface-scoped redundant-carrier declaration: the stored values this
 * relation's deliberate edits write that the provider declares redundant for
 * its own cold policy. Empty or missing lists authorize nothing. Declared by
 * the provider/surface relation, never inferred by shared code. The canonical
 * home of this shape is the optional `redundantValues` sibling of `bindings`
 * on `modelFamilySelectionSchema` (see `contracts/agent`); the neutral
 * projector and native mirrors preserve the declared field verbatim.
 */
export const selectionRedundantValuesSchema = z.strictObject({
  effort: z.array(z.string()).optional(),
  fast: z.array(z.boolean()).optional(),
  thinking: z.array(z.boolean()).optional(),
  contextSize: z.array(z.string()).optional(),
});
export type SelectionRedundantValues = z.infer<typeof selectionRedundantValuesSchema>;

export type SelectionBindingOwner = z.infer<typeof selectionBindingOwnerSchema>;
export type SelectionBinding = z.infer<typeof selectionBindingSchema>;
export type ModelSelection = z.infer<typeof modelSelectionSchema>;
