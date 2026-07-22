import type { ThreadConfig } from "@/shared/contracts";
import { ANTIGRAVITY_DEFAULT_MODEL_ID } from "./detection";
import { ANTIGRAVITY_KNOWN_MODEL_VARIANTS, splitModelEffort } from "./models";

function slugifyModelPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isAgyModelSlug(value: string): boolean {
  return /^[a-z0-9.]+(?:-[a-z0-9.]+)+$/i.test(value);
}

function resolvedModelSelection(
  model: string | undefined,
  effort?: string,
  defaultModel = ANTIGRAVITY_DEFAULT_MODEL_ID,
) {
  const normalizedModel = !model || model === "auto" ? defaultModel : model;
  const persisted = splitModelEffort(normalizedModel);
  const baseModel = persisted?.model ?? normalizedModel;
  const selectedEffort = effort ?? persisted?.effort;
  return { baseModel, selectedEffort };
}

export function resolveAntigravityModel(
  model: string | undefined,
  effort?: string,
  defaultModel = ANTIGRAVITY_DEFAULT_MODEL_ID,
): string {
  const { baseModel, selectedEffort } = resolvedModelSelection(model, effort, defaultModel);
  if (isAgyModelSlug(baseModel)) {
    return selectedEffort ? `${baseModel}-${slugifyModelPart(selectedEffort)}` : baseModel;
  }
  const variant = ANTIGRAVITY_KNOWN_MODEL_VARIANTS.find(
    (item) => item.model === baseModel && (selectedEffort ? item.effort === selectedEffort : true),
  );
  if (variant) return variant.cliModel;
  if (selectedEffort && ANTIGRAVITY_KNOWN_MODEL_VARIANTS.some((item) => item.model === baseModel)) {
    return `${slugifyModelPart(baseModel)}-${slugifyModelPart(selectedEffort)}`;
  }
  return selectedEffort ? `${baseModel} (${selectedEffort})` : baseModel;
}

function buildSeparateModelEffortArgs(
  model: string | undefined,
  effort?: string,
  defaultModel = ANTIGRAVITY_DEFAULT_MODEL_ID,
): string[] {
  const selection = resolvedModelSelection(model, effort, defaultModel);
  const variant = ANTIGRAVITY_KNOWN_MODEL_VARIANTS.find(
    (item) =>
      item.model === selection.baseModel &&
      (selection.selectedEffort ? item.effort === selection.selectedEffort : true),
  );
  const selectedEffort = selection.selectedEffort ?? variant?.effort;
  const effortSlug = selectedEffort ? slugifyModelPart(selectedEffort) : undefined;

  let modelSlug: string;
  if (isAgyModelSlug(selection.baseModel)) {
    modelSlug = selection.baseModel;
  } else if (variant?.cliSlug) {
    modelSlug =
      effortSlug &&
      selectedEffort?.toLowerCase() !== "thinking" &&
      variant.cliSlug.endsWith(`-${effortSlug}`)
        ? variant.cliSlug.slice(0, -(effortSlug.length + 1))
        : variant.cliSlug;
  } else {
    modelSlug = slugifyModelPart(selection.baseModel);
  }

  // Dynamically discovered slug models only expose efforts accepted by the
  // installed CLI's `--effort` flag. Legacy fallback metadata still models
  // Claude's baked-in "Thinking" suffix as an effort, so do not emit it there.
  const canPassEffort = Boolean(
    selectedEffort &&
    (isAgyModelSlug(selection.baseModel) || selectedEffort.toLowerCase() !== "thinking"),
  );
  return ["--model", modelSlug, ...(canPassEffort && effortSlug ? ["--effort", effortSlug] : [])];
}

export function buildAntigravityModelArgs(
  model: string | undefined,
  effort?: string,
  separateModelEffort = true,
  defaultModel = ANTIGRAVITY_DEFAULT_MODEL_ID,
): string[] {
  return separateModelEffort
    ? buildSeparateModelEffortArgs(model, effort, defaultModel)
    : ["--model", resolveAntigravityModel(model, effort, defaultModel)];
}

export function buildAntigravityArgs(
  config: ThreadConfig,
  prompt: string,
  resumeConversationId?: string,
  separateModelEffort = true,
  defaultModel = ANTIGRAVITY_DEFAULT_MODEL_ID,
): string[] {
  const args: string[] = [];

  if (resumeConversationId) {
    args.push("--conversation", resumeConversationId);
  }
  args.push(
    ...buildAntigravityModelArgs(config.model, config.effort, separateModelEffort, defaultModel),
  );
  if (config.mode === "plan") {
    args.push("--mode", "plan");
  } else if (config.approvalPolicy === "accept-edits") {
    args.push("--mode", "accept-edits");
  }
  if (config.approvalPolicy === "never" || config.approvalPolicy === "yolo") {
    args.push("--dangerously-skip-permissions");
  }
  if (config.sandboxMode === "sandbox") {
    args.push("--sandbox");
  }
  if (prompt.trim().length > 0) {
    args.push("--prompt-interactive", prompt);
  }
  return args;
}
