import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { parseBracketParams, stripBracketParams } from "@/shared/modelLabels";
import { cursorModelGrouping } from "./modelGrouping";

export interface CursorSdkModelParameter {
  id: string;
  displayName?: string;
  values: ReadonlyArray<{ value: string; displayName?: string }>;
}

export interface CursorSdkModelVariant {
  params: ReadonlyArray<{ id: string; value: string }>;
  displayName: string;
  description?: string;
  isDefault?: boolean;
}

export interface CursorSdkModel {
  id: string;
  displayName: string;
  description?: string;
  aliases?: readonly string[];
  parameters?: readonly CursorSdkModelParameter[];
  variants?: readonly CursorSdkModelVariant[];
}

export interface CursorSdkModelSelection {
  id: string;
  params?: Array<{ id: string; value: string }>;
}

const SAFE_PARAM_TOKEN = /^[^,[\]=]+$/u;
const EFFORT_PARAM_IDS = ["reasoning", "effort"] as const;
const CONTEXT_PARAM_IDS = ["context", "context_size"] as const;
const GENERIC_CONTROL_PARAM_IDS = new Set([
  ...EFFORT_PARAM_IDS,
  ...CONTEXT_PARAM_IDS,
  "fast",
  "thinking",
]);
function parameter(model: CursorSdkModel | undefined, ids: readonly string[]) {
  return model?.parameters?.find((candidate) => ids.includes(candidate.id));
}

function accepts(param: CursorSdkModelParameter | undefined, value: string): boolean {
  return param?.values.some((candidate) => candidate.value === value) === true;
}

function setParam(
  output: Map<string, string>,
  param: CursorSdkModelParameter | undefined,
  value: string | undefined,
  fixedParamIds?: ReadonlySet<string>,
): void {
  if (param && value !== undefined && !fixedParamIds?.has(param.id) && accepts(param, value)) {
    output.set(param.id, value);
  }
}

/**
 * Convert Poracode's fixed composer controls plus Cursor's bracket-encoded
 * variant ids into the SDK's open-ended `{ id, params }` representation.
 * Unknown/retired values are dropped against the live model catalog instead
 * of sending a parameter Cursor no longer accepts.
 */
export function buildCursorSdkModelSelection(
  config: Pick<ThreadConfig, "model" | "effort" | "contextSize" | "fast" | "thinking">,
  catalog: readonly CursorSdkModel[],
): CursorSdkModelSelection {
  const requestedId = stripBracketParams(config.model);
  const requestedModel = catalog.find(
    (candidate) =>
      candidate.id === requestedId || candidate.aliases?.includes(requestedId) === true,
  );
  // Detection may have supplied a deferred project-local catalog, or a saved
  // draft may name a model retired since the previous launch. Once the real
  // account catalog is available, never send a known-invalid id: prefer the
  // SDK's documented Auto fallback, then the account's first model.
  const model =
    requestedModel ??
    (catalog.length > 0
      ? (catalog.find((candidate) => candidate.id === "auto") ?? catalog[0])
      : undefined);
  const id = model?.id ?? requestedId;
  const output = new Map<string, string>();
  const selectedVariant = requestedModel?.variants?.find(
    (variant) => variantModelId(requestedModel.id, variant) === config.model,
  );
  const fixedParamIds = new Set(selectedVariant?.params.map(({ id: paramId }) => paramId));

  // A resumed local agent can remain usable while the account catalog is
  // temporarily unavailable. In that case its persisted bracket parameters
  // are the only self-describing model selection we have, so preserve safe
  // tokens verbatim. Once a non-empty catalog is available, only parameters
  // from a model that actually resolved are eligible; this keeps retired
  // model ids from leaking their parameters onto the Auto fallback.
  const persistedParams =
    requestedModel || catalog.length === 0 ? parseBracketParams(config.model) : {};
  for (const [paramId, value] of Object.entries(persistedParams)) {
    const definition = model?.parameters?.find((candidate) => candidate.id === paramId);
    if (
      definition
        ? accepts(definition, value)
        : SAFE_PARAM_TOKEN.test(paramId) && SAFE_PARAM_TOKEN.test(value)
    ) {
      output.set(paramId, value);
    }
  }

  setParam(output, parameter(model, EFFORT_PARAM_IDS), config.effort || undefined, fixedParamIds);
  setParam(
    output,
    parameter(model, CONTEXT_PARAM_IDS),
    config.contextSize && config.contextSize !== "default" ? config.contextSize : undefined,
    fixedParamIds,
  );

  const fast = parameter(model, ["fast"]);
  if (fast && config.fast !== undefined) setParam(output, fast, String(config.fast), fixedParamIds);
  const thinking = parameter(model, ["thinking"]);
  if (thinking && config.thinking !== undefined)
    setParam(output, thinking, String(config.thinking), fixedParamIds);

  // Cursor's canonical docs require an explicit Router objective. Poracode's
  // generic controls have no arbitrary-parameter picker, so Balance is the
  // stable default unless a catalog variant encoded another value in the id.
  // Keep this invariant during a resumed thread's temporary catalog outage:
  // `auto-smart` without `optimize_for` is not a supported SDK contract.
  const optimizeFor = parameter(model, ["optimize_for"]);
  if (id === "auto-smart" && !output.has("optimize_for")) {
    const preferred = optimizeFor
      ? ["balanced", "intelligence", "cost"].find((value) => accepts(optimizeFor, value))
      : "balanced";
    if (preferred) output.set("optimize_for", preferred);
  }

  const params = [...output].map(([paramId, value]) => ({ id: paramId, value }));
  return { id, ...(params.length > 0 ? { params } : {}) };
}

function variantModelId(modelId: string, variant: CursorSdkModelVariant): string | undefined {
  if (variant.params.length === 0) return undefined;
  if (
    variant.params.some(
      ({ id, value }) => !SAFE_PARAM_TOKEN.test(id) || !SAFE_PARAM_TOKEN.test(value),
    )
  ) {
    return undefined;
  }
  return `${modelId}[${variant.params.map(({ id, value }) => `${id}=${value}`).join(",")}]`;
}

function needsDedicatedVariantRow(variant: CursorSdkModelVariant): boolean {
  return variant.params.some(({ id }) => !GENERIC_CONTROL_PARAM_IDS.has(id));
}

/**
 * Project the account-specific SDK catalog into Poracode's generic picker.
 * Known parameter families become ordinary controls; named presets are also
 * retained as bracket-encoded model rows so Router and future arbitrary SDK
 * parameters remain selectable without adding provider fields to ThreadConfig.
 */
export function cursorSdkCapabilitiesFromModels(
  catalog: readonly CursorSdkModel[],
): Pick<
  AgentCapability,
  | "models"
  | "efforts"
  | "defaultEffort"
  | "modelEfforts"
  | "subProviders"
  | "modelSubProvider"
  | "contextSizes"
  | "modelContextSizes"
  | "defaultContextSize"
  | "fastModels"
  | "thinkingModels"
> {
  const models: AgentCapability["models"] = [];
  const effortSet = new Set<string>();
  const contextLabels = new Map<string, string>();
  const modelEfforts: Record<string, string[]> = {};
  const modelContextSizes: Record<string, string[]> = {};
  const fastModels: string[] = [];
  const thinkingModels: string[] = [];

  for (const model of catalog) {
    models.push({
      id: model.id,
      label: model.displayName,
      ...(model.description ? { tooltipDescription: model.description } : {}),
    });
    const variants: Array<{ id: string; variant: CursorSdkModelVariant }> = [];
    for (const variant of model.variants ?? []) {
      // Effort, context, Fast, and thinking are already first-class composer
      // controls. A second row for every combination makes one SDK model look
      // like many unrelated models. Keep only presets with parameters that the
      // generic controls cannot represent (for example Router optimize_for).
      if (!needsDedicatedVariantRow(variant)) continue;
      const id = variantModelId(model.id, variant);
      if (id) {
        models.push({
          id,
          label: `${model.displayName} · ${variant.displayName}`,
          ...(variant.description || model.description
            ? { tooltipDescription: variant.description ?? model.description! }
            : {}),
        });
        variants.push({ id, variant });
      }
    }

    const effort = parameter(model, EFFORT_PARAM_IDS);
    const efforts = effort?.values.map(({ value }) => value) ?? [];
    modelEfforts[model.id] = efforts;
    for (const { id, variant } of variants) {
      const fixedEffort = variantParamValue(variant, EFFORT_PARAM_IDS);
      modelEfforts[id] = fixedEffort && accepts(effort, fixedEffort) ? [fixedEffort] : efforts;
    }
    efforts.forEach((value) => effortSet.add(value));

    const context = parameter(model, CONTEXT_PARAM_IDS);
    const contexts = context?.values.map(({ value, displayName }) => {
      contextLabels.set(value, displayName ?? value.toUpperCase());
      return value;
    });
    if (contexts && contexts.length > 0) {
      modelContextSizes[model.id] = contexts;
      for (const { id, variant } of variants) {
        const fixedContext = variantParamValue(variant, CONTEXT_PARAM_IDS);
        modelContextSizes[id] =
          fixedContext && accepts(context, fixedContext) ? [fixedContext] : contexts;
      }
    }

    if (accepts(parameter(model, ["fast"]), "true")) {
      fastModels.push(model.id);
      for (const { id, variant } of variants) {
        if (variantParamValue(variant, ["fast"]) === undefined) fastModels.push(id);
      }
    }
    if (accepts(parameter(model, ["thinking"]), "true")) {
      thinkingModels.push(model.id);
      for (const { id, variant } of variants) {
        if (variantParamValue(variant, ["thinking"]) === undefined) thinkingModels.push(id);
      }
    }
  }

  const efforts = [...effortSet];
  const contextSizes = [...contextLabels].map(([id, label]) => ({ id, label }));
  return {
    models,
    ...cursorModelGrouping(models),
    efforts,
    ...(efforts.includes("medium") ? { defaultEffort: "medium" } : {}),
    modelEfforts,
    ...(contextSizes.length > 0 ? { contextSizes } : {}),
    ...(Object.keys(modelContextSizes).length > 0 ? { modelContextSizes } : {}),
    ...(contextSizes.some(({ id }) => id === "default") ? { defaultContextSize: "default" } : {}),
    ...(fastModels.length > 0 ? { fastModels } : {}),
    ...(thinkingModels.length > 0 ? { thinkingModels } : {}),
  };
}

function variantParamValue(
  variant: CursorSdkModelVariant,
  ids: readonly string[],
): string | undefined {
  return variant.params.find(({ id }) => ids.includes(id))?.value;
}

/**
 * Complete GUI capability projection for the local Cursor SDK runtime.
 *
 * SDK runs are headless: there is no interactive permission request. The
 * `default` approval id therefore means Cursor Auto-review, while `never`
 * preserves Poracode's provider-neutral full-access preset. The sandbox is a
 * separate, enforceable boundary and reuses the shared Codex-compatible ids.
 */
export function cursorSdkGuiCapabilities(
  catalog: readonly CursorSdkModel[],
): Partial<AgentCapability> {
  return {
    ...cursorSdkCapabilitiesFromModels(catalog),
    runtimeLabel: "SDK",
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "default", label: "Auto-review" },
      { id: "never", label: "Allow All Tools" },
    ],
    sandboxModes: [
      { id: "workspace-write", label: "Workspace Sandbox" },
      { id: "danger-full-access", label: "No Sandbox" },
    ],
    defaultApprovalPolicy: "default",
    defaultSandboxMode: "workspace-write",
    bypassPermissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    supportsResume: true,
    supportsDirectInput: false,
    liveInputMode: "server",
    presentationMode: "gui",
  };
}
