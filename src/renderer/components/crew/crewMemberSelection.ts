import type { AgentCapability } from "@/shared/contracts";
import type { CrewMemberSelection } from "@/shared/crew";
import { modelSelectionFor, resolveReasoningSelection } from "@/shared/agentSelection";
import {
  applyModelSelectionEdit,
  modelFamilyDisplayConfig,
  modelFamilyEfforts,
  modelFamilyFastAvailable,
  modelFamilyForModel,
  type ModelSelectionEdit,
} from "@/shared/modelFamilySelection";
import { normalizeProviderModelConfig } from "@/renderer/components/providers/modelConfig";
import type { ProviderModelSelectionIntent } from "@/renderer/components/common/ProviderModelMenu/parts/types";

export type CrewMemberSelectionEdit =
  | { kind: "model"; model: string; selectionIntent?: ProviderModelSelectionIntent }
  | { kind: "effort"; value: string }
  | { kind: "fast"; value: boolean };

function familyConfig(selection: CrewMemberSelection) {
  return {
    model: selection.model,
    ...(selection.effort !== undefined ? { effort: selection.effort } : {}),
    ...(selection.fast !== undefined ? { fast: selection.fast } : {}),
    ...(selection.contextSize !== undefined ? { contextSize: selection.contextSize } : {}),
  };
}

function compactSelection(input: {
  agentKind: string;
  model: string;
  effort?: string;
  fast?: boolean;
  contextSize?: string;
}): CrewMemberSelection {
  return {
    agentKind: input.agentKind,
    model: input.model,
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.fast === true ? { fast: true } : {}),
    ...(input.contextSize ? { contextSize: input.contextSize } : {}),
  };
}

/**
 * Merge a resolver patch into a crew member's quick selection. Family-encoded
 * axes stay inert (absent here); independent axes keep their current value
 * when the target accepts it and otherwise resolve to the target's default,
 * matching the composer model-change path.
 */
function mergeResolvedPatch(
  capabilities: AgentCapability,
  current: CrewMemberSelection,
  patch: Partial<Pick<CrewMemberSelection, "model" | "effort" | "fast" | "contextSize">>,
  pickedFast: boolean | undefined,
): CrewMemberSelection {
  const targetModel = patch.model ?? current.model;
  const modelChanged = patch.model !== undefined;
  const family = modelFamilyForModel(capabilities, targetModel);

  let effort = current.effort;
  if (patch.effort !== undefined) {
    effort = patch.effort;
  } else if (modelChanged && family?.bindings.effort !== "model") {
    effort = resolveReasoningSelection(capabilities, targetModel, current.effort);
  }

  let fast = current.fast;
  if (patch.fast !== undefined) {
    fast = patch.fast;
  } else if (pickedFast !== undefined) {
    fast = pickedFast;
  } else if (
    modelChanged &&
    family?.bindings.fast !== "model" &&
    current.fast === true &&
    !modelSelectionFor(capabilities, targetModel).fast.available
  ) {
    fast = false;
  }

  let contextSize = current.contextSize;
  if (
    modelChanged &&
    contextSize !== undefined &&
    !(capabilities.modelContextSizes?.[targetModel] ?? []).includes(contextSize)
  ) {
    contextSize = undefined;
  }

  return compactSelection({
    agentKind: current.agentKind,
    model: targetModel,
    ...(effort !== undefined ? { effort } : {}),
    ...(fast !== undefined ? { fast } : {}),
    ...(contextSize !== undefined ? { contextSize } : {}),
  });
}

function normalizedModelPick(
  capabilities: AgentCapability,
  agentKind: string,
  model: string,
): { model: string; fast?: boolean } {
  const picked = normalizeProviderModelConfig(agentKind, { model }, capabilities.models);
  return {
    model: picked.model ?? model,
    ...(picked.fast !== undefined ? { fast: picked.fast } : {}),
  };
}

/**
 * Resolve one deliberate crew-member edit exactly like the composer's event
 * boundary: picker intent distinguishes projected family rows from exact rows,
 * provider model-id normalization runs before the pick, and model-family
 * axes resolve to their exact member UID instead of a display label or an
 * independent carrier the child session cannot accept.
 */
export function resolveCrewMemberSelectionEdit(
  capabilities: AgentCapability,
  selection: CrewMemberSelection,
  edit: CrewMemberSelectionEdit,
  targetAgentKind = selection.agentKind,
): CrewMemberSelection | undefined {
  let familyEdit: ModelSelectionEdit;
  let pickedFast: boolean | undefined;
  if (edit.kind === "model") {
    const picked = normalizedModelPick(capabilities, targetAgentKind, edit.model);
    pickedFast = picked.fast;
    familyEdit =
      edit.selectionIntent === "family"
        ? { kind: "family", model: picked.model }
        : { kind: "model", model: picked.model };
  } else {
    familyEdit =
      edit.kind === "effort"
        ? { kind: "effort", value: edit.value }
        : { kind: "fast", value: edit.value };
  }

  const patch = applyModelSelectionEdit(capabilities, familyConfig(selection), familyEdit);
  if (patch === null) return undefined;
  if (Object.keys(patch).length === 0) return selection;
  return mergeResolvedPatch(
    capabilities,
    { ...selection, agentKind: targetAgentKind },
    patch,
    pickedFast,
  );
}

/** Initial selection for a deliberately picked model row (a new role or fallback). */
export function initialCrewMemberSelection(
  capabilities: AgentCapability,
  agentKind: string,
  model: string,
  selectionIntent: ProviderModelSelectionIntent = "exact",
): CrewMemberSelection | undefined {
  const picked = normalizedModelPick(capabilities, agentKind, model);
  const patch = applyModelSelectionEdit(
    capabilities,
    undefined,
    selectionIntent === "family"
      ? { kind: "family", model: picked.model }
      : { kind: "model", model: picked.model },
  );
  if (patch === null) return undefined;
  const targetModel = patch.model ?? picked.model;
  const family = modelFamilyForModel(capabilities, targetModel);
  const effort =
    patch.effort !== undefined
      ? patch.effort
      : family?.bindings.effort === "model"
        ? undefined
        : resolveReasoningSelection(capabilities, targetModel, undefined);
  const fast = patch.fast !== undefined ? patch.fast : picked.fast;
  return compactSelection({
    agentKind,
    model: targetModel,
    ...(effort !== undefined ? { effort } : {}),
    ...(fast !== undefined ? { fast } : {}),
  });
}

/** Display coordinates and edit ladders for a member, including family-encoded axes. */
export function crewMemberDisplayState(
  capabilities: AgentCapability,
  selection: CrewMemberSelection,
): {
  efforts: readonly string[];
  effortValue?: string;
  fastAvailable: boolean;
  fastSelected: boolean;
  fastDisabledReason?: string;
} {
  const config = familyConfig(selection);
  const display = modelFamilyDisplayConfig(capabilities, config);
  const ordinary = modelSelectionFor(capabilities, selection.model);
  const effortValue = display?.effort ?? selection.effort ?? ordinary.reasoning.default;
  return {
    efforts: modelFamilyEfforts(capabilities, config),
    ...(effortValue !== undefined ? { effortValue } : {}),
    fastAvailable: modelFamilyFastAvailable(capabilities, config),
    fastSelected: display?.fast ?? selection.fast === true,
    ...(ordinary.fast.disabledReason !== undefined
      ? { fastDisabledReason: ordinary.fast.disabledReason }
      : {}),
  };
}
