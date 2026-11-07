export type UserInputFormOption = {
  optionId: string;
  label: string;
  description?: string;
};

export type UserInputFormQuestion = {
  id: string;
  header: string;
  question: string;
  isSecret: boolean;
  multiSelect: boolean;
  allowCustom?: boolean;
  options: UserInputFormOption[] | null;
};

export type UserInputFormDetails = {
  questions: UserInputFormQuestion[];
  responseShape: "answers-map" | "codex-request-user-input";
};

export type UserInputFormAnswer = string | string[];
export type UserInputFormAnswers = Record<string, UserInputFormAnswer>;

const responseShapes = [
  { inputKey: "userInputForm", responseShape: "answers-map", headerFallback: "id" },
  // Persisted compatibility marker for already-open request items.
  {
    inputKey: "codexUserInput",
    responseShape: "codex-request-user-input",
    headerFallback: "question",
  },
] as const;

export function asUserInputFormDetails(value: unknown): UserInputFormDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  for (const shape of responseShapes) {
    const candidate = obj[shape.inputKey];
    if (!candidate || typeof candidate !== "object") continue;
    const questions = readUserInputFormQuestions(
      (candidate as { questions?: unknown }).questions,
      shape.headerFallback,
    );
    if (questions.length > 0) return { questions, responseShape: shape.responseShape };
  }
  return undefined;
}

function readUserInputFormQuestions(
  raw: unknown,
  headerFallback: "id" | "question",
): UserInputFormQuestion[] {
  if (!Array.isArray(raw)) return [];
  const questions: UserInputFormQuestion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    if (typeof value.question !== "string" || value.question.length === 0) continue;
    const id = typeof value.id === "string" && value.id.length > 0 ? value.id : value.question;
    const header =
      typeof value.header === "string" && value.header.length > 0
        ? value.header
        : headerFallback === "question"
          ? value.question
          : id;
    const options =
      Array.isArray(value.options) && value.options.length > 0
        ? value.options.flatMap((option) => {
            if (!option || typeof option !== "object") return [];
            const item = option as Record<string, unknown>;
            if (typeof item.label !== "string" || item.label.length === 0) return [];
            const optionId =
              typeof item.optionId === "string" && item.optionId.length > 0
                ? item.optionId
                : item.label;
            return [
              {
                optionId,
                label: item.label,
                ...(typeof item.description === "string" && item.description.length > 0
                  ? { description: item.description }
                  : {}),
              },
            ];
          })
        : null;
    questions.push({
      id,
      header,
      question: value.question,
      isSecret: value.isSecret === true,
      multiSelect: value.multiSelect === true,
      ...(value.allowCustom === true || value.custom === true ? { allowCustom: true } : {}),
      options,
    });
  }
  return questions;
}

export function initialUserInputFormAnswers(
  questions: readonly UserInputFormQuestion[],
): UserInputFormAnswers {
  return Object.fromEntries(
    questions.map((question) => [question.id, question.multiSelect ? [] : ""]),
  );
}

export function singleUserInputValue(value: UserInputFormAnswer | undefined): string {
  return typeof value === "string" ? value : "";
}

export function userInputValueList(value: UserInputFormAnswer | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

// Whitespace-only text is as unanswered: the supervisor rejects empty answer
// entries, so the gate and the trimmed payload must agree.
export function hasUserInputAnswer(value: UserInputFormAnswer | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function questionHasAnswer(
  question: UserInputFormQuestion,
  answers: UserInputFormAnswers,
  customAnswers: Record<string, string>,
): boolean {
  if ((customAnswers[question.id] ?? "").trim().length > 0) return true;
  return hasUserInputAnswer(answers[question.id]);
}

export function buildUserInputFormResponse(
  form: UserInputFormDetails,
  answers: UserInputFormAnswers,
  customAnswers: Record<string, string>,
  answerOverrides: UserInputFormAnswers = {},
): unknown {
  const responseAnswers = { ...answers, ...answerOverrides };
  const responseCustomAnswers = Object.fromEntries(
    Object.entries(customAnswers).filter(([key]) => !Object.hasOwn(answerOverrides, key)),
  );
  if (form.responseShape === "codex-request-user-input") {
    return {
      answers: Object.fromEntries(
        form.questions.map((question) => {
          const custom = (responseCustomAnswers[question.id] ?? "").trim();
          if (custom.length > 0) return [question.id, { answers: [custom] }];
          const value = responseAnswers[question.id];
          const values = Array.isArray(value) ? value : value ? [value] : [];
          return [question.id, { answers: values }];
        }),
      ),
    };
  }
  return {
    answers: Object.fromEntries(
      form.questions.map((question) => {
        const custom = (responseCustomAnswers[question.id] ?? "").trim();
        if (custom.length > 0) return [question.id, custom];
        return [question.id, responseAnswers[question.id]];
      }),
    ),
  };
}

export function buildUserInputFormDismissResponse() {
  return { action: "cancel" };
}

export function buildOptionSelectionResponse(value: string | readonly string[]) {
  const optionIds = typeof value === "string" ? [value] : [...value];
  const optionId = optionIds[0];
  if (!optionId) return undefined;
  return {
    optionId,
    ...(optionIds.length > 1 ? { optionIds } : {}),
  };
}
