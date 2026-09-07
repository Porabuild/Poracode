import { chosenOptionIds } from "../../questionAnswers";

export type PendingApproval = {
  kind: "approval";
  approvalId: string;
  requirementId: Record<string, unknown>;
  choices: Array<Record<string, unknown>>;
};

export type MspQuestion = {
  id: string;
  header: string;
  question: string;
  multiSelect: boolean;
  options: Array<{ optionId: string; label: string; description?: string }>;
};

export type PendingUserInput = {
  kind: "userInput";
  userInputId: string;
  questions: MspQuestion[];
};

export type PendingRequest = PendingApproval | PendingUserInput;

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requestResponseOption(response: unknown): string | undefined {
  const record = recordOf(response);
  if (!record) return undefined;
  return stringValue(record["optionId"]) ?? stringValue(record["decision"]);
}

export function isMuseCancelResponse(response: unknown): boolean {
  const record = recordOf(response);
  const action = stringValue(record?.["action"])?.toLowerCase();
  const option = requestResponseOption(response)?.toLowerCase();
  return action === "cancel" || action === "decline" || option === "cancel";
}

export function museApprovalRequestType(
  subject: Record<string, unknown> | undefined,
):
  | "command_execution_approval"
  | "file_read_approval"
  | "file_change_approval"
  | "tool_call_approval" {
  if (subject?.["kind"] === "shell") return "command_execution_approval";
  if (subject?.["kind"] === "fileAccess") {
    return subject["access"] === "read" ? "file_read_approval" : "file_change_approval";
  }
  return "tool_call_approval";
}

export function readMuseQuestions(params: Record<string, unknown>): MspQuestion[] {
  if (!Array.isArray(params["questions"])) return [];
  const questions: MspQuestion[] = [];
  for (const raw of params["questions"]) {
    const question = recordOf(raw);
    const id = stringValue(question?.["id"]);
    const text = stringValue(question?.["question"]);
    if (!question || !id || !text) continue;
    const selection = recordOf(question["selection"]);
    const options: MspQuestion["options"] = [];
    if (Array.isArray(question["options"])) {
      for (const rawOption of question["options"]) {
        const option = recordOf(rawOption);
        const label = stringValue(option?.["label"]);
        if (!option || !label) continue;
        const description = stringValue(option["description"]);
        options.push({ optionId: label, label, ...(description ? { description } : {}) });
      }
    }
    questions.push({
      id,
      header: stringValue(question["header"]) ?? id,
      question: text,
      multiSelect: selection?.["mode"] === "multiple",
      options,
    });
  }
  return questions;
}

function responseAnswers(
  response: unknown,
  questions: readonly MspQuestion[],
): Record<string, unknown> {
  const record = recordOf(response);
  const answers = recordOf(record?.["answers"]);
  if (answers) return answers;
  const option = requestResponseOption(response);
  return option && questions[0] ? { [questions[0].id]: option } : {};
}

export function buildMuseUserInputAnswers(
  response: unknown,
  questions: readonly MspQuestion[],
): Array<Record<string, unknown>> {
  const rawAnswers = responseAnswers(response, questions);
  return questions.map((question) => {
    const chosen = chosenOptionIds(rawAnswers[question.id] ?? rawAnswers[question.question]);
    const known = chosen.filter((value) =>
      question.options.some((option) => option.label === value),
    );
    const custom = chosen.filter((value) => !known.includes(value));
    return {
      questionId: question.id,
      ...(question.multiSelect
        ? known.length > 0
          ? { selectedLabels: known }
          : { freeText: custom.join("\n") }
        : known[0]
          ? { selectedLabel: known[0] }
          : { freeText: custom.join("\n") }),
    };
  });
}

export function settledMuseQuestionAnswers(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  const answers: Record<string, unknown> = {};
  for (const rawAnswer of value) {
    const answer = recordOf(rawAnswer);
    const questionId = stringValue(answer?.["questionId"]);
    if (!answer || !questionId) continue;
    const selectedLabels = Array.isArray(answer["selectedLabels"])
      ? answer["selectedLabels"].filter((label): label is string => typeof label === "string")
      : undefined;
    answers[questionId] =
      selectedLabels ??
      stringValue(answer["selectedLabel"]) ??
      stringValue(answer["freeText"]) ??
      stringValue(answer["note"]) ??
      "";
  }
  return answers;
}

export function resolveMuseApprovalChoiceId(
  pending: PendingApproval,
  response: unknown,
): string | undefined {
  const requested = requestResponseOption(response);
  const lower = requested?.toLowerCase() ?? "";
  const wanted = lower.includes("session")
    ? "approvedForSession"
    : lower.includes("decline") || lower.includes("deny") || lower.includes("reject")
      ? "denied"
      : lower.includes("cancel")
        ? "abort"
        : "approved";
  const choice =
    pending.choices.find((entry) => entry["choiceId"] === requested) ??
    pending.choices.find((entry) => entry["decision"] === wanted);
  return stringValue(choice?.["choiceId"]);
}

export function museRequestOutcome(
  outcome: unknown,
): "answered" | "accepted" | "cancelled" | "declined" {
  if (outcome === "answered") return "answered";
  if (
    outcome === "approved" ||
    outcome === "approvedForSession" ||
    outcome === "approvedPolicyAmendment"
  ) {
    return "accepted";
  }
  if (
    outcome === "cancelled" ||
    outcome === "abort" ||
    outcome === "interrupted" ||
    outcome === "aborted"
  ) {
    return "cancelled";
  }
  return "declined";
}
