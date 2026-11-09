import type { FormAnswer, FormField, FormInfo, FormWhen } from "@opencode/client";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  asStructuredElicitationDetails,
  asUserInputFormDetails,
  buildOptionSelectionResponse,
  buildStructuredElicitationDismissResponse,
  buildStructuredElicitationResponse,
  buildUserInputFormDismissResponse,
  buildUserInputFormResponse,
  type UserInputFormAnswers,
} from "@/shared/runtimeRequestForms";
import {
  structuredFormOptions,
  type StructuredFormProperty,
  type StructuredFormValue,
} from "@/shared/structuredForm";
import { formId, sessionId } from "./ids";
import { record } from "./toolMapping";
import { z } from "zod";

export const formAnswerSchema: z.ZodType<FormAnswer> = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

export type OpenRuntimeRequest = Extract<RuntimeEvent, { type: "request.opened" }>;

export function formInfoForRequest(request: OpenRuntimeRequest): FormInfo | undefined {
  if (request.requestType !== "tool_user_input") return undefined;
  const structured = asStructuredElicitationDetails(request.payload.details);
  const questions = asUserInputFormDetails(request.payload.details);
  const fields = structured
    ? structuredFields(structured)
    : questions
      ? questions.questions.map((question): FormField => {
          const options = question.options?.map((option) => ({
            value: option.optionId,
            label: option.label,
            ...(option.description ? { description: option.description } : {}),
          }));
          const common = {
            key: question.id,
            title: question.header || question.question,
            // The vendored form renders `field.description` under the title;
            // the question text always lives there (the desktop rule).
            description: question.question,
            required: true,
          };
          if (question.multiSelect)
            return {
              ...common,
              type: "multiselect",
              options: options ?? [],
              // Desktop always offers "Something else…" on optioned questions.
              ...(options && options.length > 0 ? { custom: true } : {}),
            };
          return {
            ...common,
            type: "string",
            ...(options && options.length > 0 ? { options } : {}),
            ...(options && options.length > 0 ? { custom: true } : {}),
          };
        })
      : plainOptionField(request);
  if (fields.length === 0) return undefined;
  // The vendored form renders title, then metadata.message, then each field's
  // description — so the userInputForm path must not repeat the summary as a
  // message (the question text already sits in the field description). Its
  // title follows the desktop rule: a distinct header, else "Question" for a
  // single question and the summary (or "Questions") for several.
  const title = questions
    ? questions.questions.length === 1
      ? (() => {
          const question = questions.questions[0]!;
          const header = question.header ?? "";
          return header.length > 0 && header !== question.question ? header : "Question";
        })()
      : request.payload.summary || "Questions"
    : (structured?.message ?? request.payload.summary) || "Input requested";
  // Secret questions display masked in the TUI; the submitted value is the
  // real answer, unchanged. The flag rides form metadata, not the field type.
  const maskedKeys = questions?.questions.filter((q) => q.isSecret).map((q) => q.id) ?? [];
  const message = structured?.message ?? request.payload.summary;
  return {
    id: formId(request.threadId, request.requestId) as FormInfo["id"],
    sessionID: sessionId(request.threadId),
    title,
    metadata: {
      ...(questions ? {} : message ? { message } : {}),
      ...(maskedKeys.length > 0 ? { poracode: { maskedKeys } } : {}),
    },
    fields: fields as FormInfo["fields"],
  };
}

export function formUnavailableMessage() {
  return "This question does not contain a supported form.";
}

/**
 * A structured form elicitation whose schema asks for nothing is a binary
 * accept/decline prompt (desktop renders Continue/Decline), not a form the
 * OpenCode UI can fill. `payload` may be any request payload record.
 */
export function emptyFormElicitationPayload(payload: { details?: unknown }) {
  const structured = asStructuredElicitationDetails(payload.details);
  return structured?.mode === "form" &&
    Object.keys(structured.requestedSchema.properties).length === 0
    ? structured
    : undefined;
}

export function emptyFormElicitation(request: OpenRuntimeRequest) {
  return request.requestType === "tool_user_input"
    ? emptyFormElicitationPayload(request.payload)
    : undefined;
}

export const ELICITATION_PERMISSION_OPTIONS = [
  { optionId: "accept", label: "Accept" },
  { optionId: "decline", label: "Decline" },
] as const;

export function elicitationReply(
  structured: NonNullable<ReturnType<typeof emptyFormElicitationPayload>>,
  decline: boolean,
) {
  return decline
    ? buildStructuredElicitationDismissResponse()
    : buildStructuredElicitationResponse(structured, {});
}

function plainOptionField(request: OpenRuntimeRequest): FormField[] {
  const details = record(request.payload.details);
  const options = (request.payload.options ?? []).map((option) => ({
    value: option.optionId,
    label: option.label,
    ...(option.description ? { description: option.description } : {}),
  }));
  const common = {
    key: "answer",
    title: request.payload.summary || "Answer",
    required: true,
  };
  const custom = details.allowCustom === true || details.custom === true;
  return request.payload.multiSelect
    ? [{ ...common, type: "multiselect", options, ...(custom ? { custom: true } : {}) }]
    : [
        {
          ...common,
          type: "string",
          ...(options.length > 0 ? { options } : {}),
          ...(custom && options.length > 0 ? { custom: true } : {}),
        },
      ];
}

function structuredFields(params: NonNullable<ReturnType<typeof asStructuredElicitationDetails>>) {
  if (params.mode === "url")
    return [
      {
        key: "external",
        type: "external",
        url: params.url,
        title: params.message || "Continue",
        description: params.sourceText,
      },
    ] satisfies FormField[];

  const required = new Set(params.requestedSchema.required ?? []);
  return Object.entries(params.requestedSchema.properties).map(([key, property]) =>
    structuredField(key, property, required.has(key)),
  );
}

function structuredField(
  key: string,
  property: StructuredFormProperty,
  required: boolean,
): FormField {
  const when: FormWhen[] =
    property.visibleWhen?.flatMap((condition): FormWhen[] => {
      if (Object.hasOwn(condition, "equals"))
        return [{ key: condition.field, op: "eq", value: condition.equals! }];
      if (Object.hasOwn(condition, "notEquals"))
        return [{ key: condition.field, op: "neq", value: condition.notEquals! }];
      return [];
    }) ?? [];
  const common = {
    key,
    ...(property.title ? { title: property.title } : {}),
    ...(property.description ? { description: property.description } : {}),
    ...(required ? { required: true } : {}),
    ...(when.length > 0 ? { when } : {}),
  };
  if (property.type === "array")
    return {
      ...common,
      type: "multiselect",
      options: formOptions(structuredFormOptions(property)),
      ...(property.allowCustom ? { custom: true } : {}),
      ...(property.minItems !== undefined ? { minItems: property.minItems } : {}),
      ...(property.maxItems !== undefined ? { maxItems: property.maxItems } : {}),
      ...(Array.isArray(property.default) ? { default: property.default } : {}),
    };
  if (property.type === "boolean")
    return {
      ...common,
      type: "boolean",
      ...(typeof property.default === "boolean" ? { default: property.default } : {}),
    };
  if (property.type === "integer")
    return {
      ...common,
      type: "integer",
      ...(property.minimum !== undefined ? { minimum: property.minimum } : {}),
      ...(property.maximum !== undefined ? { maximum: property.maximum } : {}),
      ...(typeof property.default === "number" ? { default: property.default } : {}),
    };
  if (property.type === "number")
    return {
      ...common,
      type: "number",
      ...(property.minimum !== undefined ? { minimum: property.minimum } : {}),
      ...(property.maximum !== undefined ? { maximum: property.maximum } : {}),
      ...(typeof property.default === "number" ? { default: property.default } : {}),
    };
  const options = formOptions(structuredFormOptions(property));
  return {
    ...common,
    type: "string",
    ...(property.format ? { format: property.format } : {}),
    ...(property.minLength !== undefined ? { minLength: property.minLength } : {}),
    ...(property.maxLength !== undefined ? { maxLength: property.maxLength } : {}),
    ...(property.pattern ? { pattern: property.pattern } : {}),
    ...(property.placeholder ? { placeholder: property.placeholder } : {}),
    ...(typeof property.default === "string" ? { default: property.default } : {}),
    ...(options.length > 0 ? { options } : {}),
    ...(property.allowCustom ? { custom: true } : {}),
  };
}

function formOptions(options: Array<{ id: string; label: string }>) {
  return options.map(({ id, label }) => ({ value: id, label }));
}

export function formResponseForRequest(request: OpenRuntimeRequest, answer: FormAnswer) {
  const structured = asStructuredElicitationDetails(request.payload.details);
  if (structured)
    return {
      response: buildStructuredElicitationResponse(
        structured,
        answer as Record<string, StructuredFormValue>,
      ),
      outcome: "answered" as const,
    };
  const details = asUserInputFormDetails(request.payload.details);
  if (details) {
    // The vendored form folds "Type your own answer" text into the field's
    // value; desktop keeps it in a separate customAnswers map. Values that
    // match no option id are custom answers — route them the same way.
    const answers: UserInputFormAnswers = {};
    const customAnswers: Record<string, string> = {};
    for (const [key, value] of Object.entries(answer)) {
      if (
        typeof value !== "string" &&
        !(Array.isArray(value) && value.every((entry) => typeof entry === "string"))
      )
        continue;
      const question = details.questions.find((entry) => entry.id === key);
      const optionIds = new Set(question?.options?.map((option) => option.optionId) ?? []);
      if (!question || optionIds.size === 0) {
        answers[key] = value;
        continue;
      }
      const values = Array.isArray(value) ? value : [value];
      const picked = values.filter((entry) => optionIds.has(entry));
      const custom = values.filter((entry) => !optionIds.has(entry));
      if (custom.length > 0) customAnswers[key] = custom.join(", ");
      if (picked.length > 0) answers[key] = Array.isArray(value) ? picked : picked[0]!;
    }
    return {
      response: buildUserInputFormResponse(details, answers, customAnswers),
      outcome: "answered" as const,
    };
  }
  const value = answer.answer;
  if (
    typeof value !== "string" &&
    !(Array.isArray(value) && value.every((entry) => typeof entry === "string"))
  )
    throw new Error("The form answer must select one or more string options.");
  const response = buildOptionSelectionResponse(value);
  if (!response) throw new Error("The form answer is empty.");
  return { response, outcome: "answered" as const };
}

export function formDismissalForRequest(request: OpenRuntimeRequest) {
  const structured = asStructuredElicitationDetails(request.payload.details);
  return structured
    ? { response: buildStructuredElicitationDismissResponse(), outcome: "declined" as const }
    : { response: buildUserInputFormDismissResponse(), outcome: "cancelled" as const };
}
