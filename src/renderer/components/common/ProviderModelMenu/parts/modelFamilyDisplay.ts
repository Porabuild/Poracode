import { msg } from "@lingui/core/macro";
import type { AgentCapability, ModelFamilyMember, ModelFamilySelection } from "@/shared/contracts";
import { projectModelFamilies } from "@/shared/modelFamilySelection";
import { i18n } from "@/renderer/i18n/i18n";
import { formatEffortLabel } from "@/renderer/components/common/effortLabel";

/**
 * Renderer-side memo for the shared family projection. Projecting a 500+-member
 * relation per menu row would dominate every rebuild, and capability objects are
 * stable per surface — the same identity the provider row cache keys on — so one
 * projection per capability object is shared by the picker, the trigger label,
 * and the visibility surfaces.
 */
const projectionCache = new WeakMap<AgentCapability, readonly ModelFamilySelection[]>();

export function cachedProjectedFamilies(
  capabilities: AgentCapability,
): readonly ModelFamilySelection[] {
  const cached = projectionCache.get(capabilities);
  if (cached) return cached;
  const projected = projectModelFamilies(capabilities);
  projectionCache.set(capabilities, projected);
  return projected;
}

export interface ModelFamilyMemberDisplay {
  familyLabel: string;
  /** Native selector option labels of the current tuple, joined for a compact hint. */
  selectorSummary: string;
  /** The family's real default member UID — the picker row id inside the family. */
  representativeModel: string;
}

function memberSelectorParts(family: ModelFamilySelection, member: ModelFamilyMember): string[] {
  return family.selectors
    .map(
      (selector) =>
        selector.options.find((option) => option.id === member.selections[selector.id])?.label,
    )
    .filter((label): label is string => Boolean(label))
    .concat(
      // A model-bound Fast coordinate is part of what the member IS — without
      // it the fast and plain siblings would read identically.
      member.fast === true ? [i18n._(msg`Fast`)] : [],
    );
}

function memberSelectorSummary(family: ModelFamilySelection, member: ModelFamilyMember): string {
  return memberSelectorParts(family, member).join(" · ");
}

/**
 * Exact-member parts for a favorites/recents row: the selector summary plus
 * the localized encoded Effort coordinate. The live composer's Effort control
 * only ever describes the currently selected model, so shortcut labels must
 * distinguish members on their own — two exact UIDs that differ only by
 * encoded effort would otherwise read identically. The main trigger and
 * compact summary stay on the selector-only summary to avoid repeating an
 * effort that is already on display.
 */
function memberShortcutParts(family: ModelFamilySelection, member: ModelFamilyMember): string[] {
  return memberSelectorParts(family, member).concat(
    member.effort ? [formatEffortLabel(member.effort)] : [],
  );
}

/** Shortcut (favorites/recents) label for one relation member: family, selectors, encoded Effort/Fast. */
export function modelFamilyMemberCompactLabel(
  family: ModelFamilySelection,
  member: ModelFamilyMember,
): string {
  const summary = memberShortcutParts(family, member).join(" · ");
  return summary ? `${family.label} · ${summary}` : family.label;
}

/**
 * Family display facts for a member UID, for trigger and compact labels: the
 * family name plus the current selector options instead of the giant native
 * pair label. `undefined` when the model is not a projected family member.
 */
export function modelFamilyMemberDisplay(
  capabilities: AgentCapability | undefined,
  modelId: string | undefined,
): ModelFamilyMemberDisplay | undefined {
  if (!capabilities || !modelId) return undefined;
  for (const family of cachedProjectedFamilies(capabilities)) {
    const member = family.members.find((candidate) => candidate.model === modelId);
    if (!member) continue;
    return {
      familyLabel: family.label,
      selectorSummary: memberSelectorSummary(family, member),
      representativeModel: family.model,
    };
  }
  return undefined;
}

/** Compact `Family · selector summary` label; undefined outside a family. */
export function modelFamilyMemberLabel(
  capabilities: AgentCapability | undefined,
  modelId: string | undefined,
): string | undefined {
  const display = modelFamilyMemberDisplay(capabilities, modelId);
  if (!display) return undefined;
  return display.selectorSummary
    ? `${display.familyLabel} · ${display.selectorSummary}`
    : display.familyLabel;
}

/** Every exact member UID a projected family row stands for. */
export function modelFamilyMemberIds(
  capabilities: AgentCapability,
): ReadonlyMap<string, readonly string[]> {
  const byRepresentative = new Map<string, readonly string[]>();
  for (const family of cachedProjectedFamilies(capabilities)) {
    byRepresentative.set(
      family.model,
      family.members.map((member) => member.model),
    );
  }
  return byRepresentative;
}
