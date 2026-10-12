import { z } from "zod";
import { agentKindSchema, threadModeSchema } from "./common";
import { selectionBindingSchema, type SelectionBinding } from "../selectionBinding.schemas.ts";
import { threadImportedFromSchema } from "./sessionImport";

const threadConfigShape = {
  model: z.string().min(1),
  effort: z.string().optional(),
  contextSize: z.string().optional(),
  fast: z.boolean().optional(),
  thinking: z.boolean().optional(),
  /**
   * Optional recognized-v1 selection binding (`selectionBinding` contract):
   * inert recorded evidence of one deliberate family-member edit, owned by one
   * full execution-context owner and one exact member UID. Strict on the wire
   * — unknown/future shapes are rejected, never stripped into a recognized
   * record — and every equality guard must include it. Inherited by the
   * provider-draft and project-draft config schemas.
   */
  selectionBinding: selectionBindingSchema.optional(),
  mode: threadModeSchema.optional(),
  approvalPolicy: z.string().optional(),
  approvalsReviewer: z.string().optional(),
  sandboxMode: z.string().optional(),
  browserMcp: z.boolean().optional(),
  crossagentMcp: z.boolean().optional(),
  computerUse: z.boolean().optional(),
  chromeMcp: z.boolean().optional(),
  /** Runtime environment selected for a provider that cannot execute natively. */
  executionEnvironment: z.object({ kind: z.literal("wsl"), distro: z.string().min(1) }).optional(),
  /** Transcript this thread was imported from; drives the notice and re-import dedupe. */
  importedFrom: threadImportedFromSchema.optional(),
} as const;

export const threadConfigBaseSchema = z.object(threadConfigShape);

export const threadConfigSchema = threadConfigBaseSchema;
export type ThreadConfig = z.infer<typeof threadConfigSchema>;

export const providerDraftConfigSchema = threadConfigBaseSchema;
export type ProviderDraftConfig = z.infer<typeof providerDraftConfigSchema>;

/** Saved draft state may not have a chosen model yet. */
export const projectDraftConfigSchema = threadConfigBaseSchema
  .extend({
    agentKind: agentKindSchema,
    worktreeMode: z.boolean().optional(),
  })
  .extend({
    model: z.string(),
  });
export type ProjectDraftConfig = z.infer<typeof projectDraftConfigSchema>;

/**
 * Structural equality for one selection-binding record: equal full owner,
 * equal version/kind/model, and every recorded axis present on both sides with
 * exactly its recorded value. An absent record equals only an absent record;
 * presence is compared exactly, so a record never equals a bare config without
 * one.
 *
 * Both inputs are assumed to be RECOGNIZED, NORMALIZED JSON-shaped records
 * (what the strict wire schema admits). This comparator is value-based, not a
 * raw own-key validator: JSON cannot carry an own `undefined`, so a recognized
 * owner with no `agentInstanceId` and one carrying an own `agentInstanceId:
 * undefined` compare equal here. Raw own-key presence — including rejecting an
 * own-`undefined` recorded axis or owner id before any parse — is the separate
 * recognition boundary enforced by `selectionBindingMatches` and the wire
 * schema, and this comparator must never be substituted for it.
 */
export function areSelectionBindingsEqual(
  left: SelectionBinding | undefined,
  right: SelectionBinding | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.version !== right.version || left.kind !== right.kind || left.model !== right.model) {
    return false;
  }
  if (
    left.owner.agentKind !== right.owner.agentKind ||
    left.owner.presentationMode !== right.owner.presentationMode ||
    left.owner.agentInstanceId !== right.owner.agentInstanceId
  ) {
    return false;
  }
  const axes: Array<keyof NonNullable<SelectionBinding["inertValues"]>> = [
    "effort",
    "fast",
    "thinking",
    "contextSize",
  ];
  for (const axis of axes) {
    const leftPresent = Object.hasOwn(left.inertValues, axis);
    const rightPresent = Object.hasOwn(right.inertValues, axis);
    if (leftPresent !== rightPresent) return false;
    if (leftPresent && left.inertValues[axis] !== right.inertValues[axis]) return false;
  }
  return true;
}

export function isThreadConfigEqual(
  left: ThreadConfig | undefined,
  right: ThreadConfig | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.model === right.model &&
    left.effort === right.effort &&
    left.contextSize === right.contextSize &&
    left.fast === right.fast &&
    left.thinking === right.thinking &&
    areSelectionBindingsEqual(left.selectionBinding, right.selectionBinding) &&
    left.mode === right.mode &&
    left.approvalPolicy === right.approvalPolicy &&
    left.approvalsReviewer === right.approvalsReviewer &&
    left.sandboxMode === right.sandboxMode &&
    left.browserMcp === right.browserMcp &&
    left.crossagentMcp === right.crossagentMcp &&
    left.computerUse === right.computerUse &&
    left.chromeMcp === right.chromeMcp &&
    left.executionEnvironment?.kind === right.executionEnvironment?.kind &&
    left.executionEnvironment?.distro === right.executionEnvironment?.distro
  );
}
