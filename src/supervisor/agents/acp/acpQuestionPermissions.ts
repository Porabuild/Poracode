import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { isAskUserQuestionToolName } from "@/shared/toolCallClassification";
import { chosenOptionIds } from "../questionAnswers";
import {
  buildQuestionAnswerEvents,
  type QuestionAnswerSourceQuestion,
} from "../questionAnswerEvents";
import { extractToolCallContentText } from "./canonicalMapping/contentExtraction";
import type { AcpMapperState } from "./canonicalMapping/state";

interface AcpPermissionQuestion {
  id: string;
  header: string;
  question: string;
  options: Array<{ optionId: string; label: string; description?: string }>;
  multiSelect: boolean;
}

type AcpQuestionPermissionResponse = RequestPermissionResponse & {
  answers?: Record<string, string>;
};

/**
 * AskUserQuestion is carried over ACP's requestPermission method in two
 * provider-native shapes, both normalized to the same AcpPermissionQuestion
 * contract so shared runtime and renderer code stays provider-agnostic:
 *  - Qwen Code sends a structured `rawInput.questions` array (header, question,
 *    options) — the same signal Qwen's own ACP clients use.
 *  - Kimi Code sends no rawInput at all: the question text arrives in
 *    `toolCall.content` and the answer choices are the standard requestPermission
 *    `options`. Detection stays semantic (tool identity + payload shape) rather
 *    than keyed on the provider kind.
 */
export function parseAcpPermissionQuestions(
  request: RequestPermissionRequest,
): AcpPermissionQuestion[] {
  const rawInput = request.toolCall?.rawInput;
  if (isRecord(rawInput) && Array.isArray(rawInput.questions)) {
    return parseRawInputQuestions(rawInput.questions);
  }
  return parseContentPermissionQuestion(request);
}

/** Qwen shape: structured questions embedded in the tool call's rawInput. */
function parseRawInputQuestions(rawQuestions: readonly unknown[]): AcpPermissionQuestion[] {
  return rawQuestions.flatMap((entry, index) => {
    if (!isRecord(entry) || typeof entry.question !== "string" || entry.question.length === 0) {
      return [];
    }
    const id = String(index);
    const header =
      typeof entry.header === "string" && entry.header.length > 0 ? entry.header : entry.question;
    const options = Array.isArray(entry.options)
      ? entry.options.flatMap((option, optionIndex) => {
          if (!isRecord(option)) return [];
          const fallback = `Option ${optionIndex + 1}`;
          const label =
            typeof option.label === "string" && option.label.length > 0
              ? option.label
              : typeof option.optionId === "string" && option.optionId.length > 0
                ? option.optionId
                : fallback;
          const optionId =
            typeof option.optionId === "string" && option.optionId.length > 0
              ? option.optionId
              : label;
          return [
            {
              optionId,
              label,
              ...(typeof option.description === "string" && option.description.length > 0
                ? { description: option.description }
                : {}),
            },
          ];
        })
      : [];
    return [
      {
        id,
        header,
        question: entry.question,
        options,
        multiSelect: entry.multiSelect === true,
      },
    ];
  });
}

/**
 * Kimi shape: no structured rawInput. The question text is carried in
 * `toolCall.content` and the answer choices are the standard requestPermission
 * `options` (the rejection option becomes the form's Cancel affordance rather
 * than a selectable choice). Gated on the AskUserQuestion tool identity so
 * ordinary approval requests are never reinterpreted as questions.
 */
function parseContentPermissionQuestion(
  request: RequestPermissionRequest,
): AcpPermissionQuestion[] {
  if (!isAcpAskUserQuestionToolCall(request.toolCall ?? {})) return [];
  const question = extractToolCallContentText(request.toolCall?.content)?.trim();
  if (!question) return [];
  const options = request.options.flatMap((option) => {
    if (isRejectionOptionKind(option.kind)) return [];
    const label =
      typeof option.name === "string" && option.name.length > 0 ? option.name : option.optionId;
    return [{ optionId: option.optionId, label }];
  });
  if (options.length === 0) return [];
  return [{ id: "0", header: question, question, options, multiSelect: false }];
}

export function mapAcpQuestionPermissionRequest(
  request: RequestPermissionRequest,
  state: AcpMapperState,
  requestId: string,
): RuntimeEvent | undefined {
  const questions = parseAcpPermissionQuestions(request);
  const firstQuestion = questions[0];
  if (!firstQuestion) return undefined;

  return {
    type: "request.opened",
    threadId: state.threadId,
    requestId,
    requestType: "tool_user_input",
    payload: {
      summary: firstQuestion.question,
      details: {
        userInputForm: {
          questions: questions.map((question) => ({
            id: question.id,
            header: question.header,
            question: question.question,
            options: question.options,
            multiSelect: question.multiSelect,
          })),
        },
      },
      ...(questions.length === 1 ? { options: firstQuestion.options } : {}),
      ...(questions.length === 1 ? { multiSelect: firstQuestion.multiSelect } : {}),
    },
  };
}

export function normalizeAcpQuestionPermissionResponse(
  request: RequestPermissionRequest,
  response: unknown,
): AcpQuestionPermissionResponse {
  if (isCancelledResponse(response)) return { outcome: { outcome: "cancelled" } };

  const optionId = selectedPermissionOptionId(request, response);
  if (!optionId) return { outcome: { outcome: "cancelled" } };
  const answers = normalizeQuestionAnswers(request, response);
  return {
    outcome: { outcome: "selected", optionId },
    ...(Object.keys(answers).length > 0 ? { answers } : {}),
  };
}

export function buildAcpQuestionPermissionAnswerEvents(input: {
  threadId: string;
  itemId: string;
  request: RequestPermissionRequest;
  response: unknown;
}): RuntimeEvent[] {
  if (isCancelledResponse(input.response)) return [];
  const questions = parseAcpPermissionQuestions(input.request);
  return buildQuestionAnswerEvents({
    threadId: input.threadId,
    itemId: input.itemId,
    questions: questions.map(
      (question): QuestionAnswerSourceQuestion => ({
        keys: [question.id, question.question, question.header],
        header: question.header,
        question: question.question,
        options: question.options,
      }),
    ),
    answers: responseAnswers(input.response),
  });
}

/**
 * Detect an AskUserQuestion tool call by its identity (tool name / title), used
 * both to gate the Kimi content-shape parser and to suppress the redundant tool
 * row once the same call is presented as a form. Kept independent of `rawInput`
 * so it recognizes providers (Kimi Code) that omit structured input.
 */
export function isAcpAskUserQuestionToolCall(toolCall: {
  title?: unknown;
  rawInput?: unknown;
  _meta?: unknown;
}): boolean {
  const metaName = isRecord(toolCall._meta) ? toolCall._meta.toolName : undefined;
  return [metaName, toolCall.title].some(isAskUserQuestionToolName);
}

function normalizeQuestionAnswers(
  request: RequestPermissionRequest,
  response: unknown,
): Record<string, string> {
  const rawAnswers = responseAnswers(response);
  const answers: Record<string, string> = {};
  for (const question of parseAcpPermissionQuestions(request)) {
    const raw =
      rawAnswers[question.id] ?? rawAnswers[question.question] ?? rawAnswers[question.header];
    const selected = chosenOptionIds(raw);
    if (selected.length === 0) continue;
    answers[question.id] = selected
      .map(
        (optionId) =>
          question.options.find((option) => option.optionId === optionId)?.label ?? optionId,
      )
      .join(", ");
  }
  return answers;
}

function responseAnswers(response: unknown): Record<string, unknown> {
  if (!isRecord(response) || !isRecord(response.answers)) return {};
  return response.answers;
}

function selectedPermissionOptionId(
  request: RequestPermissionRequest,
  response: unknown,
): string | undefined {
  const requested =
    isRecord(response) && typeof response.optionId === "string" ? response.optionId : undefined;
  if (requested && request.options.some((option) => option.optionId === requested))
    return requested;
  const answered = answerSelectedOptionId(request, response);
  if (answered) return answered;
  return (
    request.options.find((option) => option.kind === "allow_once") ??
    request.options.find((option) => !isRejectionOptionKind(option.kind))
  )?.optionId;
}

/**
 * Providers whose ACP options ARE the answer choices (Kimi Code) submit the
 * picked choice inside the answers map rather than a top-level `optionId`.
 * Promote a chosen value that matches a real (non-reject) option so the correct
 * outcome optionId reaches the agent. Qwen's answers reference its own rawInput
 * option ids (never the ACP proceed/cancel options), so this is a no-op there.
 */
function answerSelectedOptionId(
  request: RequestPermissionRequest,
  response: unknown,
): string | undefined {
  const selectable = new Set(
    request.options.filter((option) => !isRejectionOptionKind(option.kind)).map((o) => o.optionId),
  );
  if (selectable.size === 0) return undefined;
  for (const value of Object.values(responseAnswers(response))) {
    for (const optionId of chosenOptionIds(value)) {
      if (selectable.has(optionId)) return optionId;
    }
  }
  return undefined;
}

const REJECTION_OPTION_ID_PATTERN = /(?:cancel|decline|deny|reject|abort)/iu;

/** True when an ACP option id names a decline/cancel/reject/abort choice. */
export function isRejectionOptionId(optionId: unknown): boolean {
  return typeof optionId === "string" && REJECTION_OPTION_ID_PATTERN.test(optionId);
}

/** True for ACP permission option kinds that reject rather than approve. */
function isRejectionOptionKind(kind: unknown): boolean {
  return typeof kind === "string" && kind.startsWith("reject");
}

function isCancelledResponse(response: unknown): boolean {
  if (!isRecord(response)) return true;
  if (response.action === "cancel" || response.action === "decline") return true;
  return isRejectionOptionId(response.optionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
