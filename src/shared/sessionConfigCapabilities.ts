import type { AgentCapability } from "./contracts/agent";
import type { SessionConfigOptions } from "./contracts/sessionConfigOptions";
import { canonicalizeEffortId, sortEffortsByCanonicalOrder } from "./effortOrder";
import { projectModelFamilies } from "./modelFamilySelection";

/**
 * Overlay current-session model choices and model-scoped controls on detection.
 * A pending pick never inherits the previous native model's ladder. Missing or
 * retired inventories keep the detection fallback. Model-scoped controls are
 * authoritative only when the inventory identifies the native current model.
 */
export function capabilitiesForSessionConfig(
  base: AgentCapability,
  options: SessionConfigOptions | null | undefined,
): AgentCapability {
  if (options == null) return base;
  const model = options.find((option) => option.type === "select" && option.role === "model");
  const nativeModel = model?.type === "select" ? model.currentValue : undefined;
  let next = base;
  let modelsReplaced = false;
  if (model?.type === "select") {
    const seen = new Set<string>();
    const models = model.values.flatMap((value) => {
      if (seen.has(value.value)) return [];
      seen.add(value.value);
      const old = base.models.find((candidate) => candidate.id === value.value);
      return [{ ...old, id: value.value, label: value.name ?? old?.label ?? value.value }];
    });
    next = {
      ...next,
      models,
      subProviders: model.groups.map((group) => ({ id: group.id, label: group.name ?? group.id })),
      modelSubProvider: Object.fromEntries(
        model.values.flatMap((value) =>
          value.group === undefined ? [] : [[value.value, value.group]],
        ),
      ),
    };
    modelsReplaced = true;
  }
  // The live inventory is the accepted-value authority: family relations
  // intersect with it after the overlay so a retired member disappears and a
  // reduced menu can never widen back to the detection inventory. An empty or
  // retired remainder drops the descriptor instead of advertising an empty
  // family; members outside the accepted set are never reachable through it.
  if (modelsReplaced && next.modelFamilies) {
    next = { ...next, modelFamilies: projectModelFamilies(next) };
  }
  // Standard options can coexist with legacy model controls. Without native
  // model identity, keep their declared detection fallback instead of guessing
  // which model a ladder belongs to.
  const scopeModel = nativeModel;
  if (!scopeModel) return next;
  const effort = options.find((option) => option.role === "effort" && option.type === "select");
  const efforts =
    effort?.type === "select"
      ? sortEffortsByCanonicalOrder([
          ...new Set(effort.values.map((value) => canonicalizeEffortId(value.value))),
        ])
      : [];
  const defaults = { ...next.modelDefaultEfforts };
  if (effort?.type === "select" && effort.currentValue !== undefined) {
    defaults[scopeModel] = canonicalizeEffortId(effort.currentValue);
  } else {
    delete defaults[scopeModel];
  }
  const context = options.find((option) => option.type === "select" && option.role === "context");
  if (context?.type === "select") {
    const choices = context.values.map((value) => ({
      id: value.value,
      label: value.name ?? value.value,
    }));
    const nativeIds = new Set(choices.map((choice) => choice.id));
    next = {
      ...next,
      contextSizes: [
        ...(next.contextSizes ?? []).filter((choice) => !nativeIds.has(choice.id)),
        ...choices,
      ],
      modelContextSizes: {
        ...next.modelContextSizes,
        [scopeModel]: choices.map((choice) => choice.id),
      },
    };
  }
  const hasSelect = (role: "fast" | "thinking") =>
    options.some(
      (option) => option.type === "select" && option.role === role && option.values.length > 0,
    );
  next = {
    ...next,
    fastModels: [
      ...(next.fastModels ?? []).filter((id) => id !== scopeModel),
      ...(hasSelect("fast") ? [scopeModel] : []),
    ],
    thinkingModels: [
      ...(next.thinkingModels ?? []).filter((id) => id !== scopeModel),
      ...(hasSelect("thinking") ? [scopeModel] : []),
    ],
  };
  return {
    ...next,
    modelEfforts: { ...next.modelEfforts, [scopeModel]: efforts },
    modelDefaultEfforts: defaults,
  };
}
