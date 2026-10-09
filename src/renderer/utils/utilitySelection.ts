import type {
  AgentCapability,
  ModelFamilySelection,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { applyThreadConfigMutation } from "@/shared/selectionBinding";
import {
  modelSelectionSchema,
  type ModelSelection,
  type SelectionAxis,
  type SelectionBindingOwner,
} from "@/shared/selectionBinding.schemas";
import { modelFamilyForModel } from "@/shared/modelFamilySelection";

/**
 * Renderer-side canonical utility-preset semantics for the AI helpers (title
 * generation, commit-message generation, conflict resolver — plus their WSL
 * variants). The persisted shared settings carry one optional canonical
 * `ModelSelection` per domain; the legacy scalar siblings stay the
 * compatibility read.
 *
 * Read rule: a present canonical object is the sole complete tuple — its
 * carriers (`effort: ""`, `fast: false`), `thinking`/`contextSize`, and its
 * own recognized selection binding are preserved verbatim. An absent (or
 * invalid) object falls back to an UNSTAMPED exact tuple built from the
 * scalar siblings. There is no backfill: nothing here writes a canonical
 * object from scalar values — only a deliberate preset edit does (see
 * {@link applyUtilityPresetMutation}).
 *
 * A binding is never invented and never inherited: the tuple a request
 * carries is the saved utility tuple itself, and a thread's binding never
 * transfers to a utility preset (or vice versa). The owner of a minted
 * record always comes from the actual selected provider/preset, never from
 * an existing binding.
 */

/** The legacy scalar preset siblings a canonical tuple replaces. */
export interface UtilityPresetScalars {
  model: string;
  effort: string;
  fast: boolean;
}

/**
 * An unstamped selection built from exact scalar values. Presence is exact:
 * `effort` is always a present string (empty means the empty carrier, not an
 * omitted axis) and `fast` a present boolean. No binding is ever attached.
 */
export function buildUnstampedSelection(scalars: UtilityPresetScalars): ModelSelection {
  return { model: scalars.model, effort: scalars.effort, fast: scalars.fast };
}

/**
 * The complete utility tuple for a request or a preset edit: the canonical
 * object when present and valid, otherwise the unstamped scalar tuple. A
 * present-but-invalid object behaves as absent (the settings normalization
 * already drops those from the projection; this guard keeps direct callers
 * honest instead of forwarding shapeless data).
 */
export function readUtilitySelection(
  canonical: ModelSelection | undefined,
  fallback: UtilityPresetScalars,
): ModelSelection {
  if (canonical === undefined) return buildUnstampedSelection(fallback);
  const parsed = modelSelectionSchema.safeParse(canonical);
  return parsed.success ? parsed.data : buildUnstampedSelection(fallback);
}

/**
 * The actual owner of a utility preset: the full selected adapter kind
 * (profiles already carry their suffix in the kind — never decomposed) and
 * the surface's declared presentation. No instance id is invented.
 */
export function utilitySelectionOwner(
  agentKind: string,
  presentationMode: ThreadPresentationMode,
): SelectionBindingOwner {
  return { agentKind, presentationMode };
}

/** Resolve only implicit model intent; modern controls and explicit UIDs are exact. */
export function resolveUtilitySelection(
  selection: ModelSelection | undefined,
  legacy: UtilityPresetScalars,
  resolveLegacy: (scalars: UtilityPresetScalars) => UtilityPresetScalars,
): ModelSelection {
  if (selection === undefined) return buildUnstampedSelection(resolveLegacy(legacy));
  return selection.model === ""
    ? { ...selection, model: resolveLegacy({ model: "", effort: "", fast: false }).model }
    : { ...selection };
}

/**
 * What the user deliberately did to a utility preset. Routed to the neutral
 * mutation events — never inferred from values:
 *
 * - `reset` — Auto/Disabled (or the ineligible-provider self-heal): a fresh
 *   explicit default tuple under retarget semantics, so a stale canonical
 *   object can never win over the deliberate preset.
 * - `model` — one explicit model pick. A deliberate family member (relation
 *   carried from the shared edit helper for a family-origin event only)
 *   routes as a family-member edit — the only minting event, and only when
 *   `mintAllowed` proves the owner's presentation from an existing
 *   declaration. It establishes fresh target intent even when the provider
 *   changed. Every other pick (including a same-UID re-pick) drops the
 *   record; a provider change without a family event retargets.
 * - `family-noop` — a family-row click that retained the current member:
 *   unrelated-edit semantics only for the same owner. A different full
 *   provider kind still retargets and persists, even with the same member UID.
 * - `carrier` — an independent control edit; touched axes are revoked from
 *   a retained record even when the value did not change.
 * - `presentation` — an ordinary surface retarget, dropping old intent.
 */
export type UtilityPresetEdit =
  | { kind: "reset" }
  | {
      kind: "model";
      relation?: ModelFamilySelection;
      patch?: Partial<Omit<ModelSelection, "selectionBinding">>;
    }
  | { kind: "presentation" }
  | { kind: "family-noop" }
  | {
      kind: "carrier";
      axes: readonly SelectionAxis[];
      patch?: Partial<Omit<ModelSelection, "selectionBinding">>;
    };

/**
 * The one event-aware mutation for deliberate utility preset edits, over the
 * shared neutral primitive. `previousProvider`/`nextProvider` decide
 * retarget; `relation` must come from the projected target relation (the
 * shared family helper resolves members — never a UID parse here), and
 * `mintAllowed` must hold only when the owner presentation is proven by an
 * existing declaration. Refusals (an unresolvable relation/member/owner)
 * propagate from the shared mutation: the edit is refused without changing
 * the preset.
 */
export function applyUtilityPresetMutation(input: {
  previous: ModelSelection;
  previousProvider: string;
  nextProvider: string;
  next: Omit<ModelSelection, "selectionBinding">;
  owner: SelectionBindingOwner;
  mintAllowed: boolean;
  edit: UtilityPresetEdit;
}): ModelSelection {
  const mutation = {
    previous: input.previous,
    next: input.next,
    owner: input.owner,
  };
  // A proven deliberate family event establishes fresh target intent even
  // across a provider change; every other provider change is a retarget.
  const familyRelation =
    input.edit.kind === "model" && input.mintAllowed ? input.edit.relation : undefined;
  if (familyRelation) {
    return applyThreadConfigMutation({
      ...mutation,
      event: { type: "family-member-edit", relation: familyRelation },
    });
  }
  if (input.nextProvider !== input.previousProvider) {
    return applyThreadConfigMutation({ ...mutation, event: { type: "owner-retarget" } });
  }
  switch (input.edit.kind) {
    case "family-noop":
      return applyThreadConfigMutation({ ...mutation, event: { type: "unrelated-edit" } });
    case "presentation":
    case "reset":
      return applyThreadConfigMutation({ ...mutation, event: { type: "owner-retarget" } });
    case "carrier":
      return applyThreadConfigMutation({
        ...mutation,
        event: { type: "independent-carrier-edit", axes: input.edit.axes },
      });
    case "model":
      return applyThreadConfigMutation({ ...mutation, event: { type: "exact-model-edit" } });
  }
}

/**
 * The projected family relation a resolved member belongs to, for edits the
 * shared family helper already resolved. Returns `undefined` for models
 * outside every declared relation (raw picks) — the caller then routes the
 * edit without a mint claim.
 */
export function relationForResolvedMember(
  capabilities: AgentCapability,
  model: string | undefined,
): ModelFamilySelection | undefined {
  if (!model) return undefined;
  return modelFamilyForModel(capabilities, model);
}
