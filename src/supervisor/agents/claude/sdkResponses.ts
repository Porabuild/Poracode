import type {
  CanUseTool,
  ElicitationRequest,
  ElicitationResult,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
} from "@anthropic-ai/claude-agent-sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { chosenOptionIds } from "../questionAnswers";
import { CLAUDE_DEFAULT_APPROVAL_POLICY } from "./detection";
import { ACCEPT_SUGGESTION_OPTION_PREFIX, type ClaudeQuestion } from "./sdkCanonicalMapping";
import { isExitPlanModeToolName } from "./canonicalMapping/toolClassification";

export type PendingPermission = {
  kind: "permission";
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
  resolving?: Promise<void>;
  resolve: (result: PermissionResult) => void;
};

export type PendingQuestion = {
  kind: "question";
  questions: ClaudeQuestion[];
  originalQuestions: unknown;
  resolve: (result: PermissionResult) => void;
};

export type PendingElicitation = {
  kind: "elicitation";
  request: ElicitationRequest;
  resolve: (result: ElicitationResult) => void;
  cleanup: () => void;
};

export type PendingRequest = PendingPermission | PendingQuestion | PendingElicitation;

interface PermissionDecision {
  kind: "accept" | "acceptForSession" | "decline" | "cancel";
  /** Index into `pending.suggestions` when the user picked a single suggestion. */
  suggestionIndex?: number;
}

export function permissionModeForConfig(config: ThreadConfig): PermissionMode {
  return (
    config.mode === "plan" ? "plan" : (config.approvalPolicy ?? CLAUDE_DEFAULT_APPROVAL_POLICY)
  ) as PermissionMode;
}

export function basePermissionModeForConfig(config: ThreadConfig): PermissionMode {
  return (config.approvalPolicy ?? CLAUDE_DEFAULT_APPROVAL_POLICY) as PermissionMode;
}

/** Replace ordinary Plan approvals while preserving native explicit asks. */
export function canBypassPlanPermission(
  toolName: string,
  options: Parameters<CanUseTool>[2],
): boolean {
  // SDK 0.3.296 forwards the CLI's structured reason but omits it from this
  // callback's public type. Older CLIs without it keep their approval flow.
  return (
    toolName !== "AskUserQuestion" &&
    !isExitPlanModeToolName(toolName) &&
    !options.matchedAskRule &&
    !options.defaultToNo &&
    !options.suppressAlwaysAllowRule &&
    !("requiresUserInteraction" in options && options.requiresUserInteraction === true) &&
    !("serverPrompt" in options && options.serverPrompt) &&
    !("decisionReasonCode" in options && options.decisionReasonCode) &&
    "decisionReasonType" in options &&
    (options.decisionReasonType === "mode" || options.decisionReasonType === "other")
  );
}

export function buildDenyMessage(
  decisionKind: PermissionDecision["kind"],
  pending: PendingRequest,
): string {
  if (decisionKind === "cancel") return "User cancelled tool execution.";
  if (pending.kind === "permission" && isExitPlanModeToolName(pending.toolName)) {
    return "User wants to keep planning. Stop here and wait for the user's next message; do not call ExitPlanMode again until the user explicitly approves the plan.";
  }
  return "User declined tool execution.";
}

function responseOptionId(response: unknown): string | undefined {
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    if (typeof obj.optionId === "string") return obj.optionId;
    if (typeof obj.decision === "string") return obj.decision;
  }
  return undefined;
}

export function exitPlanApprovalMode(response: unknown): "default" | "auto" | undefined {
  const option = responseOptionId(response);
  return option === "default" || option === "auto" ? option : undefined;
}

export function permissionDecision(response: unknown): PermissionDecision {
  const option = responseOptionId(response);
  if (!option) return { kind: "accept" };

  if (option.startsWith(ACCEPT_SUGGESTION_OPTION_PREFIX)) {
    const idx = Number.parseInt(option.slice(ACCEPT_SUGGESTION_OPTION_PREFIX.length), 10);
    if (Number.isFinite(idx) && idx >= 0) {
      return { kind: "acceptForSession", suggestionIndex: idx };
    }
  }

  const lower = option.toLowerCase();
  if (lower.includes("session") || lower.includes("always")) return { kind: "acceptForSession" };
  if (lower.includes("decline") || lower.includes("deny") || lower.includes("reject")) {
    return { kind: "decline" };
  }
  if (lower.includes("cancel")) return { kind: "cancel" };
  return { kind: "accept" };
}

export function rawQuestionAnswers(
  response: unknown,
  pending: PendingQuestion,
): Record<string, unknown> {
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    if (obj.answers && typeof obj.answers === "object") {
      return obj.answers as Record<string, unknown>;
    }
  }
  const option = responseOptionId(response);
  const first = pending.questions[0];
  return first && option ? { [first.question]: option } : {};
}

export function isQuestionCancelResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const action = (response as Record<string, unknown>).action;
  return action === "cancel" || action === "decline";
}

export function normalizeQuestionAnswersForSdk(
  answers: Record<string, unknown>,
  pending: PendingQuestion,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const question of pending.questions) {
    const raw = answers[question.question] ?? answers[question.header];
    const value = normalizeQuestionAnswerValue(question, raw);
    if (value !== undefined) normalized[question.question] = value;
  }
  return normalized;
}

function normalizeQuestionAnswerValue(question: ClaudeQuestion, raw: unknown): string | undefined {
  const chosen = chosenOptionIds(raw);
  if (chosen.length === 0) return undefined;
  return chosen.map((id) => labelForOption(question, id)).join(", ");
}

function labelForOption(question: ClaudeQuestion, optionId: string): string {
  const match = question.options.find((opt) => opt.optionId === optionId);
  return match?.label ?? optionId;
}
