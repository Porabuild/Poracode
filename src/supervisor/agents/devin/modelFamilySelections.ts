import { DEVIN_TERMINAL_REDUNDANT_VALUES } from "./terminalSelectionPolicy";
import type { ModelFamilySelection } from "@/shared/contracts";
import type { MessageKey } from "@/shared/messages";
import type { DevinModelFamily } from "./models";

/**
 * Provider-compiled Fusion family relation (model family selection).
 *
 * The Devin Fusion family encodes a four-coordinate choice — lead model,
 * sidekick model, lead effort, pair Fast — inside each pair's exact native
 * UID. The pair label carries the coordinates as native display text
 * ("Fusion (Claude Fable 5.1 Medium + GPT-5.6 Luna High Thinking Fast)"),
 * where a trailing "Fast" marker may appear on either half and folds into the
 * single pair Fast bit. This module compiles the CLI catalog and the ACP
 * accepted menu into the neutral, optional `modelFamilies` capability
 * descriptor (`ModelFamilySelection`, `src/shared/contracts/agent.ts`; the
 * shared projection/edit helper lives in `src/shared/modelFamilySelection.ts`)
 * whose producer invariants this compilation must satisfy:
 *
 * - Terminal (base capabilities): one descriptor per all-composite family
 *   with EVERY decoded catalog pair as a member and both common controls
 *   bound to the relation (`effort`/`fast` coordinates on each member).
 * - GUI (negotiated override): the SAME relation intersected with the live
 *   accepted menu — only accepted pair rows become members, no effort/Fast
 *   coordinates (`bindings: "config"` — the independent native thought-level
 *   and speed selects own those controls). The accepted inventory is never
 *   widened to catalog variants a session would refuse.
 *
 * Decoding is label- and catalog-vocabulary-driven and never parses the
 * opaque pair UID: the UID is stored verbatim as the member identity and is
 * the only value that ever reaches a wire. A pair whose label does not
 * resolve against known catalog member labels stays OUT of the relation and
 * remains reachable as an exact raw choice (`capabilities.models` is
 * untouched) — normalization never costs reachability.
 *
 * Fast-folding rule (proven against the 3000.11.3 catalog: 575/575 injective
 * round trip, 65 declared holes, 45 members without an opposite-Fast
 * sibling, full single-axis reachability):
 *  1. A half exactly matching a NON-Fast catalog label is that choice
 *     (fast contribution false) — "SWE-1.6 Fast" is a product name, never a
 *     toggle.
 *  2. Otherwise a trailing " Fast" marker is stripped and the plain label
 *     must match a NON-Fast catalog label (fast contribution true) — the
 *     Fast and plain spellings of one half are the SAME choice, so the
 *     sidekick identity stays stable across the pair's Fast bit.
 * Anything else (a Fast variant label with no plain sibling, ambiguous
 * splits, unknown words) leaves the member undecoded — raw fallback.
 */

/** The two pair coordinates, as descriptor-local selector identities. */
export const DEVIN_FAMILY_LEAD_SELECTOR_ID = "lead";
export const DEVIN_FAMILY_SIDEKICK_SELECTOR_ID = "sidekick";
/** Shared message-catalog keys the renderer localizes for the two menus. */
export const DEVIN_FAMILY_LEAD_LABEL_KEY: MessageKey = "modelSelection.lead";
export const DEVIN_FAMILY_SIDEKICK_LABEL_KEY: MessageKey = "modelSelection.sidekick";

/** Conditional spread carrying a NONEMPTY relation (gap fills; never shadows). */
export function modelFamiliesField(
  modelFamilies: ModelFamilySelection[] | undefined,
): {} | { modelFamilies: ModelFamilySelection[] } {
  return modelFamilies?.length ? { modelFamilies } : {};
}

type MemberLabel = {
  uid: string;
  /** Full native variant label — the vocabulary key (a sidekick choice's name). */
  label: string;
  familyId: string;
  familyLabel: string;
  effort: string;
  fast: boolean;
};

/** Full native variant label → member identity, for pair-label resolution. */
type FamilyVocabulary = Map<string, MemberLabel>;

/**
 * Vocabulary of NON-composite variant labels across the catalog: the names
 * pair halves are matched against. Labels are the native full variant text
 * ("SWE-2 Medium", "GPT-5.6 Luna High Thinking", "SWE-1.6 Fast"), so family
 * membership comes from catalog data, never from opaque IDs.
 */
function familySelectionVocabulary(families: readonly DevinModelFamily[]): FamilyVocabulary {
  const vocabulary: FamilyVocabulary = new Map();
  const ambiguousLabels = new Set<string>();
  for (const family of families) {
    if (isAllCompositeFamily(family)) continue;
    for (const variant of family.variants) {
      if (variant.composite !== undefined) continue;
      if (!variant.label || ambiguousLabels.has(variant.label)) continue;
      const existing = vocabulary.get(variant.label);
      if (existing) {
        if (existing.uid !== variant.id) {
          vocabulary.delete(variant.label);
          ambiguousLabels.add(variant.label);
        }
        continue;
      }
      vocabulary.set(variant.label, {
        uid: variant.id,
        label: variant.label,
        familyId: family.id,
        familyLabel: family.label,
        effort: variant.effort,
        fast: variant.fast,
      });
    }
  }
  return vocabulary;
}

/** A family whose every variant is an opaque composite pair (Fusion). */
function isAllCompositeFamily(family: DevinModelFamily): boolean {
  return family.variants.length > 0 && family.variants.every((v) => v.composite !== undefined);
}

const TRAILING_FAST = /\s+Fast$/i;

/**
 * Resolve one pair-label half against the vocabulary. Returns the resolved
 * member (whose parsed effort is the lead coordinate) and the half's
 * contribution to the pair Fast bit (see the module folding rule).
 */
function resolveFamilyPairHalf(
  half: string,
  vocabulary: FamilyVocabulary,
): { member: MemberLabel; fast: boolean } | undefined {
  const exact = vocabulary.get(half);
  if (exact && !exact.fast) return { member: exact, fast: false };
  const stripped = half.replace(TRAILING_FAST, "");
  if (stripped !== half) {
    const base = vocabulary.get(stripped);
    if (base && !base.fast) return { member: base, fast: true };
  }
  return undefined;
}

export type DecodedFamilyPair = {
  uid: string;
  lead: { id: string; label: string };
  sidekick: { id: string; label: string };
  /** Lead effort coordinate ("low"…"max"); empty means undecodable. */
  effort: string;
  fast: boolean;
};

/**
 * Decode one composite variant label — "(Lead Effort[ Fast] + Sidekick[
 * Fast])" — into its coordinates in a single pass. Every " + " split must
 * resolve exactly once and the lead half must carry a real effort coordinate;
 * an ambiguous split or an effort-less lead leaves the member undecoded
 * rather than guessed.
 */
function decodeFamilyPairLabel(
  uid: string,
  compositeTail: string,
  vocabulary: FamilyVocabulary,
): DecodedFamilyPair | undefined {
  if (!compositeTail.startsWith("(") || !compositeTail.endsWith(")")) return undefined;
  const inner = compositeTail.slice(1, -1);
  let decoded: Omit<DecodedFamilyPair, "uid"> | undefined;
  let splitIndex = inner.indexOf(" + ");
  while (splitIndex !== -1) {
    const lead = resolveFamilyPairHalf(inner.slice(0, splitIndex).trim(), vocabulary);
    const sidekick = resolveFamilyPairHalf(inner.slice(splitIndex + 3).trim(), vocabulary);
    if (lead && sidekick) {
      // Two viable splits mean the label cannot be read faithfully.
      if (decoded) return undefined;
      if (!lead.member.effort) return undefined;
      decoded = {
        // The lead choice is the family (family label); the sidekick choice is
        // the exact variant ("SWE-2 Medium", never its family's bare "SWE-2").
        lead: { id: lead.member.familyId, label: lead.member.familyLabel },
        sidekick: { id: sidekick.member.uid, label: sidekick.member.label },
        effort: lead.member.effort,
        fast: lead.fast || sidekick.fast,
      };
    }
    splitIndex = inner.indexOf(" + ", splitIndex + 1);
  }
  if (!decoded) return undefined;
  return { uid, ...decoded };
}

/**
 * Validate and compact decoded members into the neutral descriptor.
 * Producer invariants (design review §Small relationship contract): unique
 * member IDs, unique encoded tuples, complete coordinates for model-bound
 * controls, declared options covering every selection, and a default that
 * belongs to the relation. Any violation drops the WHOLE descriptor — a
 * half-valid relation would advertise choices the table cannot resolve.
 */
function compileModelFamilySelection(input: {
  label: string;
  bindings: ModelFamilySelection["bindings"];
  redundantValues?: ModelFamilySelection["redundantValues"];
  selectors: ModelFamilySelection["selectors"];
  members: readonly DecodedFamilyPair[];
  /** Preferred default; falls back to the first member. */
  defaultModel?: string;
}): ModelFamilySelection | undefined {
  const { bindings, selectors, label } = input;
  if (selectors.length === 0 || input.members.length === 0) return undefined;
  const selectorIds = selectors.map((selector) => selector.id);
  if (new Set(selectorIds).size !== selectorIds.length) return undefined;
  for (const selector of selectors) {
    const optionIds = selector.options.map((option) => option.id);
    if (optionIds.length === 0 || new Set(optionIds).size !== optionIds.length) return undefined;
  }
  const members: ModelFamilySelection["members"] = [];
  const memberIds = new Set<string>();
  const tuples = new Set<string>();
  for (const member of input.members) {
    if (memberIds.has(member.uid)) return undefined;
    if (bindings.effort === "model" && !member.effort) return undefined;
    const selections: Record<string, string> = {
      [DEVIN_FAMILY_LEAD_SELECTOR_ID]: member.lead.id,
      [DEVIN_FAMILY_SIDEKICK_SELECTOR_ID]: member.sidekick.id,
    };
    for (const selector of selectors) {
      const value = selections[selector.id];
      if (value === undefined || !selector.options.some((option) => option.id === value)) {
        return undefined;
      }
    }
    const tuple = JSON.stringify([
      ...selectorIds.map((id) => selections[id]),
      ...(bindings.effort === "model" ? [member.effort] : []),
      ...(bindings.fast === "model" ? [member.fast] : []),
    ]);
    if (tuples.has(tuple)) return undefined;
    tuples.add(tuple);
    memberIds.add(member.uid);
    members.push({
      model: member.uid,
      selections,
      ...(bindings.effort === "model" ? { effort: member.effort } : {}),
      ...(bindings.fast === "model" ? { fast: member.fast } : {}),
    });
  }
  const defaultModel =
    input.defaultModel && memberIds.has(input.defaultModel)
      ? input.defaultModel
      : input.members[0]!.uid;
  return {
    model: defaultModel,
    label,
    selectors: selectors.map((selector) => ({
      id: selector.id,
      labelKey: selector.labelKey,
      options: selector.options,
    })),
    bindings,
    ...(input.redundantValues ? { redundantValues: input.redundantValues } : {}),
    members,
  };
}

/** Distinct decoded options for one selector, in first-appearance order. */
function selectorOptions(
  members: readonly DecodedFamilyPair[],
  side: "lead" | "sidekick",
): Array<{ id: string; label: string }> {
  const options: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  for (const member of members) {
    const option = member[side];
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    options.push({ id: option.id, label: option.label });
  }
  return options;
}

function pairSelectors(members: readonly DecodedFamilyPair[]): ModelFamilySelection["selectors"] {
  return [
    {
      id: DEVIN_FAMILY_LEAD_SELECTOR_ID,
      labelKey: DEVIN_FAMILY_LEAD_LABEL_KEY,
      options: selectorOptions(members, "lead"),
    },
    {
      id: DEVIN_FAMILY_SIDEKICK_SELECTOR_ID,
      labelKey: DEVIN_FAMILY_SIDEKICK_LABEL_KEY,
      options: selectorOptions(members, "sidekick"),
    },
  ];
}

/**
 * The TERMINAL relation for one all-composite family: every decodable catalog
 * pair, with the lead effort and pair Fast encoded on each member. Undecodable
 * members are left out (they stay reachable as exact raw choices); a family
 * with no decodable members produces no descriptor.
 */
function devinCompositeFamilySelection(
  family: DevinModelFamily,
  vocabulary: FamilyVocabulary,
): ModelFamilySelection | undefined {
  const members: DecodedFamilyPair[] = [];
  for (const variant of family.variants) {
    if (variant.composite === undefined) continue;
    const decoded = decodeFamilyPairLabel(variant.id, variant.composite, vocabulary);
    if (decoded) members.push(decoded);
  }
  return compileModelFamilySelection({
    label: family.label,
    bindings: { effort: "model", fast: "model" },
    redundantValues: DEVIN_TERMINAL_REDUNDANT_VALUES,
    selectors: pairSelectors(members),
    members,
    defaultModel: family.id,
  });
}

/**
 * The Terminal/base family relation compiled from the CLI catalog.
 * Structurally every all-composite family compiles (Fusion today); a catalog
 * without one returns an empty relation.
 */
export function devinTerminalFamilySelections(
  families: readonly DevinModelFamily[],
): ModelFamilySelection[] {
  const vocabulary = familySelectionVocabulary(families);
  const selections: ModelFamilySelection[] = [];
  for (const family of families) {
    if (!isAllCompositeFamily(family)) continue;
    const selection = devinCompositeFamilySelection(family, vocabulary);
    if (selection) selections.push(selection);
  }
  return selections;
}

/**
 * The GUI relation: the composite relation INTERSECTED with the live accepted
 * menu. An accepted row joins through (a) the catalog's own mapping of its
 * UID, or (b) its native label parsed against the catalog vocabulary — a
 * future pair the catalog does not know yet stays decodable from its label.
 * Anything else (unknown UID, unreadable label, pair the session no longer
 * offers) stays raw fallback; the accepted inventory is never widened.
 */
export function devinGuiFamilySelections(
  accepted: readonly { id: string; label: string }[],
  families: readonly DevinModelFamily[],
): ModelFamilySelection[] {
  if (accepted.length === 0 || families.length === 0) return [];
  const compositeFamilies = families.filter(isAllCompositeFamily);
  if (compositeFamilies.length === 0) return [];
  const vocabulary = familySelectionVocabulary(families);
  const groups: Array<{ family: DevinModelFamily; members: DecodedFamilyPair[]; valid: boolean }> =
    compositeFamilies.map((family) => ({ family, members: [], valid: true }));
  const memberUids = new Set<string>();
  for (const row of accepted) {
    if (memberUids.has(row.id)) continue;
    const decoded = decodeAcceptedPair(row, compositeFamilies, vocabulary);
    if (!decoded) continue;
    const group = groups.find((candidate) => candidate.family.label === decoded.familyLabel);
    if (!group) continue;
    // A duplicate pair tuple collapses the relation's injectivity, and a
    // repeated row id is a contradictory menu — the family descriptor is
    // dropped whole rather than normalized from a partial table.
    if (
      !group.valid ||
      group.members.some(
        (member) =>
          member.lead.id === decoded.member.lead.id &&
          member.sidekick.id === decoded.member.sidekick.id,
      )
    ) {
      group.valid = false;
      group.members.length = 0;
      continue;
    }
    memberUids.add(row.id);
    group.members.push(decoded.member);
  }
  const selections: ModelFamilySelection[] = [];
  for (const { family, members, valid } of groups) {
    if (!valid || members.length === 0) continue;
    const selection = compileModelFamilySelection({
      label: family.label,
      bindings: { effort: "config", fast: "config" },
      selectors: pairSelectors(members),
      // Accepted order: the default follows the live menu, never the catalog.
      members,
    });
    if (selection) selections.push(selection);
  }
  return selections;
}

/** Decode one accepted row: catalog UID mapping first, accepted label second. */
function decodeAcceptedPair(
  row: { id: string; label: string },
  compositeFamilies: readonly DevinModelFamily[],
  vocabulary: FamilyVocabulary,
): { familyLabel: string; member: DecodedFamilyPair } | undefined {
  for (const family of compositeFamilies) {
    const variant = family.variants.find((candidate) => candidate.id === row.id);
    if (variant?.composite !== undefined) {
      const member = decodeFamilyPairLabel(row.id, variant.composite, vocabulary);
      if (member) return { familyLabel: family.label, member };
    }
  }
  for (const family of compositeFamilies) {
    if (!row.label.startsWith(family.label)) continue;
    const tail = row.label.slice(family.label.length).trim();
    const member = decodeFamilyPairLabel(row.id, tail, vocabulary);
    if (member) return { familyLabel: family.label, member };
  }
  return undefined;
}
