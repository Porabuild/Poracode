import { msg } from "@/shared/messages";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import { resolveOneShotEffectiveModel } from "./oneShotModel";
import type { AgentAdapter } from "./types";

/**
 * Canonical-selection plumbing for the utility one-shot lanes.
 *
 * The persisted/request shapes carry one complete `ModelSelection` (model +
 * effort/fast/thinking/contextSize carriers + optional recognized binding).
 * The builder ABI keeps its legacy positional shape
 * (`model, effort, prompt, location, fast, options?`), so the positionals are
 * a **checked projection** of that one selection: derived exactly once at the
 * common runner boundary and validated against `options.selection` before any
 * provider effect. They are never a second independently mutable model choice.
 */

/** Positional projection (builder args 1/2/5) of a canonical selection. */
export interface LegacyOneShotPositionals {
  model: string;
  effort?: string | undefined;
  fast?: boolean | undefined;
}

/**
 * Mapping policy for ONE selection axis in a provider's one-shot lane.
 *
 * `true` — the lane maps every value of the axis natively (including its
 * empty/false/default carriers). Otherwise the lane maps nothing for that axis
 * and may locally declare exact carrier values that are inactive under this
 * provider's actual native semantics — the legacy default utility carriers
 * (empty effort, false Fast) a lane without that concept keeps accepting.
 * Any PRESENT value covered by neither refuses visibly. Declared per provider
 * lane; shared code never classifies values as inert.
 */
export type OneShotControlAxisMapping<V extends string | boolean> =
  | true
  | { readonly inactive?: readonly V[] };

/**
 * The selection axes a provider's one-shot lane maps or locally declares
 * inactive. Every axis of a present carrier must be covered by the lane's
 * declaration before any effect; an unlisted axis refuses when present.
 * Absence makes no claim, so an absent axis never refuses. Declared per
 * provider lane; shared code holds no provider names and no global inert list.
 */
export interface OneShotControlMapping {
  readonly effort?: OneShotControlAxisMapping<string>;
  readonly fast?: OneShotControlAxisMapping<boolean>;
  readonly thinking?: OneShotControlAxisMapping<boolean>;
  readonly contextSize?: OneShotControlAxisMapping<string>;
}

/**
 * A one-shot selection carried a present control the provider lane cannot
 * apply. Refusing is the contract: neither retries nor missing capabilities
 * may silently remove controls. The wording is the shared catalog message so
 * it localizes for the user; {@link axes} stays a programming-only diagnostic.
 */
export class UnsupportedOneShotControlError extends Error {
  constructor(readonly axes: readonly string[]) {
    super(msg("modelSelection.unsupportedOptions"));
    this.name = "UnsupportedOneShotControlError";
  }
}

/** Derive the legacy positional projection from the full selection. */
export function legacyOneShotPositionals(selection: ModelSelection): LegacyOneShotPositionals {
  return {
    model: selection.model,
    ...(selection.effort !== undefined ? { effort: selection.effort } : {}),
    ...(selection.fast !== undefined ? { fast: selection.fast } : {}),
  };
}

/**
 * Build the unstamped selection a direct legacy builder call represents.
 * Presence is exact (empty effort / false Fast stay present); no binding and
 * no thinking/contextSize can be recovered from scalars.
 */
export function unstampedOneShotSelection(
  model: string,
  effort?: string,
  fast?: boolean,
): ModelSelection {
  return {
    model,
    ...(effort !== undefined ? { effort } : {}),
    ...(fast !== undefined ? { fast } : {}),
  };
}

/**
 * Refuse a builder invocation whose positional arguments disagree with the
 * supplied selection. Presence-sensitive: an absent axis and a present empty
 * carrier are different tuples, and `undefined !== ""` / `undefined !== false`
 * on purpose. The disagreement is a visible input error raised before any
 * provider effect.
 */
export function assertOneShotProjectionMatches(
  selection: ModelSelection,
  positionals: LegacyOneShotPositionals,
): void {
  const derived = legacyOneShotPositionals(selection);
  const mismatched: string[] = [];
  if (derived.model !== positionals.model) mismatched.push("model");
  if (derived.effort !== positionals.effort) mismatched.push("effort");
  if (derived.fast !== positionals.fast) mismatched.push("fast");
  if (mismatched.length > 0) {
    throw new Error(
      `One-shot selection and its positional arguments disagree (${mismatched.join(", ")}); ` +
        "the positionals are a checked projection of one selection and cannot be resolved independently.",
    );
  }
}

/**
 * Refuse a one-shot selection whose present carriers include an axis the
 * provider lane neither maps natively nor locally declares inactive. A lane
 * that maps an axis accepts every value of it; a lane that maps nothing may
 * still declare exact inactive carrier values (its legacy default carriers,
 * such as empty effort or false Fast) based on its own native semantics. Any
 * other PRESENT value refuses exactly like a meaningful one — an absent axis
 * never refuses, and shared code holds no provider names or global inert list.
 */
export function assertOneShotControlsMapped(
  selection: ModelSelection,
  mapping: OneShotControlMapping = {},
): void {
  const unsupported: string[] = [];
  if (selection.effort !== undefined && !oneShotAxisValueMapped(mapping.effort, selection.effort)) {
    unsupported.push("effort");
  }
  if (selection.fast !== undefined && !oneShotAxisValueMapped(mapping.fast, selection.fast)) {
    unsupported.push("fast");
  }
  if (
    selection.thinking !== undefined &&
    !oneShotAxisValueMapped(mapping.thinking, selection.thinking)
  ) {
    unsupported.push("thinking");
  }
  if (
    selection.contextSize !== undefined &&
    !oneShotAxisValueMapped(mapping.contextSize, selection.contextSize)
  ) {
    unsupported.push("contextSize");
  }
  if (unsupported.length > 0) {
    throw new UnsupportedOneShotControlError(unsupported);
  }
}

function oneShotAxisValueMapped<V extends string | boolean>(
  mapping: OneShotControlAxisMapping<V> | undefined,
  value: V,
): boolean {
  if (mapping === true) return true;
  return mapping?.inactive?.includes(value) === true;
}

/**
 * Resolve the selection a builder consumes from its positional arguments and
 * the caller's options: a supplied `options.selection` is validated against
 * the positionals (visible input error on disagreement) and returned as-is;
 * a missing one constructs the unstamped selection the legacy scalars
 * represent. Never recovers intent from a thread or other external state.
 */
export function resolveCheckedOneShotBuilderSelection(
  positionals: LegacyOneShotPositionals,
  options: { selection?: ModelSelection | undefined } | undefined,
): ModelSelection {
  if (!options?.selection) {
    return unstampedOneShotSelection(positionals.model, positionals.effort, positionals.fast);
  }
  assertOneShotProjectionMatches(options.selection, positionals);
  return options.selection;
}

/**
 * Resolve the selection a resume extraction builder consumes. The resume lane
 * has a single scalar positional (the model), so only that axis is a checked
 * projection of a supplied selection — the carriers travel through
 * `options.selection` alone. A missing options argument is the unstamped
 * legacy direct call. Never recovers intent from a thread or other external
 * state.
 */
export function resolveCheckedOneShotResumeSelection(
  model: string | undefined,
  options: { selection?: ModelSelection | undefined } | undefined,
): ModelSelection {
  const positional = model ?? "";
  if (!options?.selection) {
    return unstampedOneShotSelection(positional);
  }
  if (options.selection.model !== positional) {
    throw new Error(
      "One-shot resume selection and its model argument disagree; the model is a checked " +
        "projection of one selection and cannot be resolved independently.",
    );
  }
  return options.selection;
}

/**
 * Resolve the complete selection a utility generator runs with: the caller's
 * selection with its model replaced by the effective one-shot model (the
 * explicit pick, else the adapter default). An omitted selection becomes the
 * bare default-model selection — the existing utility default — with no
 * invented carriers. A supplied selection keeps every carrier and any
 * binding verbatim; only `model` is normalized.
 */
export function resolveOneShotSelection(
  adapter: Pick<AgentAdapter, "defaultOneShotModel" | "allowsImplicitOneShotModel" | "label">,
  selection: ModelSelection | undefined,
  makeNoModelError: () => Error,
): ModelSelection {
  const model = resolveOneShotEffectiveModel(adapter, selection?.model, makeNoModelError);
  return selection ? { ...selection, model } : { model };
}
