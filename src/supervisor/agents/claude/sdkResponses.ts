import type {
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
} from "@anthropic-ai/claude-agent-sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { chosenOptionIds } from "../questionAnswers";
import { CLAUDE_DEFAULT_APPROVAL_POLICY } from "./detection";
import { ACCEPT_SUGGESTION_OPTION_PREFIX, type ClaudeQuestion } from "./sdkCanonicalMapping";

const CLAUDE_EXIT_PLAN_MODE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "ExitPlanMode",
  "exit_plan_mode",
]);

export type PendingPermission = {
  kind: "permission";
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
  resolve: (result: PermissionResult) => void;
};

export type PendingQuestion = {
  kind: "question";
  questions: ClaudeQuestion[];
  originalQuestions: unknown;
  resolve: (result: PermissionResult) => void;
};

export type PendingRequest = PendingPermission | PendingQuestion;

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

export function buildDenyMessage(
  decisionKind: PermissionDecision["kind"],
  pending: PendingRequest,
): string {
  if (decisionKind === "cancel") return "User cancelled tool execution.";
  if (pending.kind === "permission" && CLAUDE_EXIT_PLAN_MODE_TOOL_NAMES.has(pending.toolName)) {
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
