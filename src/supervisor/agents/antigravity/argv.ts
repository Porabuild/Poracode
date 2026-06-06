import type { ThreadConfig } from "@/shared/contracts";
import { ANTIGRAVITY_DEFAULT_MODEL_ID } from "./detection";
import { ANTIGRAVITY_KNOWN_MODEL_VARIANTS, splitModelEffort } from "./models";

export function resolveAntigravityModel(model: string | undefined, effort?: string): string {
  const normalizedModel = !model || model === "auto" ? ANTIGRAVITY_DEFAULT_MODEL_ID : model;
  const persisted = splitModelEffort(normalizedModel);
  const baseModel = persisted?.model ?? normalizedModel;
  const selectedEffort = effort ?? persisted?.effort;
  const variant = ANTIGRAVITY_KNOWN_MODEL_VARIANTS.find(
    (item) => item.model === baseModel && (selectedEffort ? item.effort === selectedEffort : true),
  );
  if (variant) return variant.cliModel;
  return selectedEffort ? `${baseModel} (${selectedEffort})` : baseModel;
}

export function buildAntigravityArgs(
  config: ThreadConfig,
  prompt: string,
  resumeConversationId?: string,
): string[] {
  const args: string[] = [];

  if (resumeConversationId) {
    args.push("--conversation", resumeConversationId);
  }
  args.push("--model", resolveAntigravityModel(config.model, config.effort));
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
