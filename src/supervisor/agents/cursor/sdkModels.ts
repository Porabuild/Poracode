import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { parseBracketParams, stripBracketParams } from "@/shared/modelLabels";
import { cursorDefaultHiddenModels } from "./defaultModelVisibility";
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

/**
 * Parameter families that Poracode already exposes as generic composer
 * controls. Cursor's account catalog names the same concept differently across
 * models (`context`, `context_size`, `context_window`, `contextSize`,
 * `reasoning`, `effort`, `reasoning_effort`, …), so families are matched by
 * substring rather than by an exact allow-list. One shared predicate is used by
 * both the capability projection and `buildCursorSdkModelSelection`, so a
 * parameter treated as a generic control can never diverge from the parameter
 * the selection builder fills from `ThreadConfig`.
 */
type CursorSdkParamFamily = "effort" | "context" | "fast" | "thinking";

function paramFamily(paramId: string): CursorSdkParamFamily | undefined {
  const id = paramId.trim().toLowerCase();
  if (id.includes("context")) return "context";
  if (id.includes("effort") || id.includes("reasoning")) return "effort";
  if (id === "fast") return "fast";
  if (id === "thinking") return "thinking";
  return undefined;
}

function familyParameter(
  model: CursorSdkModel | undefined,
  family: CursorSdkParamFamily,
): CursorSdkModelParameter | undefined {
  return model?.parameters?.find((candidate) => paramFamily(candidate.id) === family);
}

function parameterById(
  model: CursorSdkModel | undefined,
  paramId: string,
): CursorSdkModelParameter | undefined {
  return model?.parameters?.find((candidate) => candidate.id === paramId);
}

function accepts(param: CursorSdkModelParameter | undefined, value: string): boolean {
  return param?.values.some((candidate) => candidate.value === value) === true;
}

function isAutoModel(model: Pick<CursorSdkModel, "id" | "displayName">): boolean {
  return model.id === "auto" || model.id === "default" || labelKey(model.displayName) === "auto";
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
  const requestedModel =
    catalog.find(
      (candidate) =>
        candidate.id === requestedId || candidate.aliases?.includes(requestedId) === true,
    ) ?? (requestedId === "auto" ? catalog.find(isAutoModel) : undefined);
  // Detection may have supplied a deferred project-local catalog, or a saved
  // draft may name a model retired since the previous launch. Once the real
  // account catalog is available, never send a known-invalid id: prefer the
  // SDK's documented Auto fallback, then the account's first model.
  const model =
    requestedModel ?? (catalog.length > 0 ? (catalog.find(isAutoModel) ?? catalog[0]) : undefined);
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
    const definition = parameterById(model, paramId);
    if (
      definition
        ? accepts(definition, value)
        : SAFE_PARAM_TOKEN.test(paramId) && SAFE_PARAM_TOKEN.test(value)
    ) {
      output.set(paramId, value);
    }
  }

  setParam(output, familyParameter(model, "effort"), config.effort || undefined, fixedParamIds);
  setParam(
    output,
    familyParameter(model, "context"),
    config.contextSize && config.contextSize !== "default" ? config.contextSize : undefined,
    fixedParamIds,
  );

  const fast = familyParameter(model, "fast");
  if (fast && config.fast !== undefined) setParam(output, fast, String(config.fast), fixedParamIds);
  const thinking = familyParameter(model, "thinking");
  if (thinking && config.thinking !== undefined)
    setParam(output, thinking, String(config.thinking), fixedParamIds);

  // Cursor's canonical docs require an explicit Router objective. Poracode's
  // generic controls have no arbitrary-parameter picker, so Balance is the
  // stable default unless a catalog variant encoded another value in the id.
  // Keep this invariant during a resumed thread's temporary catalog outage:
  // `auto-smart` without `optimize_for` is not a supported SDK contract.
  const optimizeFor = parameterById(model, "optimize_for");
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
  return variant.params.some(({ id }) => paramFamily(id) === undefined);
}

/**
 * Rows are deduplicated on their user-visible label: the account catalog ships
 * several entries (and variant presets) that project to the same text, and a
 * picker full of identical names is unusable.
 */
function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

function mergeValues(target: string[], values: readonly string[]): void {
  for (const value of values) if (!target.includes(value)) target.push(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

interface CursorSdkRow {
  id: string;
  label: string;
  tooltipDescription?: string;
  efforts: readonly string[];
  contexts: readonly string[];
  fast: boolean;
  thinking: boolean;
}

function modelLabel(model: CursorSdkModel, effort: CursorSdkModelParameter | undefined): string {
  if (!effort) return model.displayName;
  const suffixes = effort.values
    .flatMap(({ value, displayName }) => [displayName, value])
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);
  for (const suffix of suffixes) {
    const label = model.displayName
      .replace(new RegExp(`\\s+${escapeRegExp(suffix)}$`, "iu"), "")
      .trim();
    if (label && label !== model.displayName) return label;
  }
  return model.displayName;
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
  | "defaultHiddenModels"
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
  const rowIdByLabel = new Map<string, string>();

  // The first row with a given label keeps its own id; later rows with the same
  // label contribute their capability ranges to that winner instead of adding a
  // visually identical picker entry.
  const emitRow = (row: CursorSdkRow): void => {
    row.efforts.forEach((value) => effortSet.add(value));
    const winner = rowIdByLabel.get(labelKey(row.label));
    if (winner === undefined) {
      rowIdByLabel.set(labelKey(row.label), row.id);
      models.push({
        id: row.id,
        label: row.label,
        ...(row.tooltipDescription ? { tooltipDescription: row.tooltipDescription } : {}),
      });
      modelEfforts[row.id] = [...row.efforts];
      if (row.contexts.length > 0) modelContextSizes[row.id] = [...row.contexts];
      if (row.fast) fastModels.push(row.id);
      if (row.thinking) thinkingModels.push(row.id);
      return;
    }
    mergeValues((modelEfforts[winner] ??= []), row.efforts);
    if (row.contexts.length > 0) mergeValues((modelContextSizes[winner] ??= []), row.contexts);
    if (row.fast && !fastModels.includes(winner)) fastModels.push(winner);
    if (row.thinking && !thinkingModels.includes(winner)) thinkingModels.push(winner);
  };

  for (const model of catalog) {
    const effort = familyParameter(model, "effort");
    const context = familyParameter(model, "context");
    const label = modelLabel(model, effort);
    const efforts = effort?.values.map(({ value }) => value) ?? [];
    const contexts =
      context?.values.map(({ value, displayName }) => {
        contextLabels.set(value, displayName ?? value.toUpperCase());
        return value;
      }) ?? [];
    const fast = accepts(familyParameter(model, "fast"), "true");
    const thinking = accepts(familyParameter(model, "thinking"), "true");

    emitRow({
      id: model.id,
      label,
      ...(model.description ? { tooltipDescription: model.description } : {}),
      efforts,
      contexts,
      fast,
      thinking,
    });

    for (const variant of model.variants ?? []) {
      // Effort, context, Fast, and thinking are already first-class composer
      // controls. A second row for every combination makes one SDK model look
      // like many unrelated models. Keep only presets with parameters that the
      // generic controls cannot represent (for example Router optimize_for).
      if (!needsDedicatedVariantRow(variant)) continue;
      // A preset named after its own model reads as a duplicate of the base row.
      if (labelKey(variant.displayName) === labelKey(label)) continue;
      const id = variantModelId(model.id, variant);
      if (!id) continue;
      const fixedEffort = variantFamilyValue(variant, "effort");
      const fixedContext = variantFamilyValue(variant, "context");
      emitRow({
        id,
        label: `${label} · ${variant.displayName}`,
        ...(variant.description || model.description
          ? { tooltipDescription: variant.description ?? model.description! }
          : {}),
        efforts: fixedEffort && accepts(effort, fixedEffort) ? [fixedEffort] : efforts,
        contexts: fixedContext && accepts(context, fixedContext) ? [fixedContext] : contexts,
        fast: fast && variantFamilyValue(variant, "fast") === undefined,
        thinking: thinking && variantFamilyValue(variant, "thinking") === undefined,
      });
    }
  }

  const autoIndex = models.findIndex(
    (model) => model.id === "auto" || model.id === "default" || labelKey(model.label) === "auto",
  );
  // Local agents require a selection returned by Cursor.models.list(). Keep a
  // native Auto entry first, but never invent one when the account did not
  // advertise it.
  if (autoIndex > 0) {
    models.unshift(models.splice(autoIndex, 1)[0]!);
  }

  const efforts = [...effortSet];
  const contextSizes = [...contextLabels].map(([id, label]) => ({ id, label }));
  const defaultHiddenModels = cursorDefaultHiddenModels(models);
  return {
    models,
    ...(defaultHiddenModels.length > 0 ? { defaultHiddenModels } : {}),
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

function variantFamilyValue(
  variant: CursorSdkModelVariant,
  family: CursorSdkParamFamily,
): string | undefined {
  return variant.params.find(({ id }) => paramFamily(id) === family)?.value;
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
    defaultApprovalPolicy: "never",
    defaultSandboxMode: "danger-full-access",
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
