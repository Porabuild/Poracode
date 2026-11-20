import type { CanonicalRequestType, RequestPayload } from "@/shared/contracts";
import type { AppThreadReply } from "@/shared/contracts/appThreadRequests";
import {
  asStructuredElicitationDetails,
  asUserInputFormDetails,
  buildStructuredElicitationDismissResponse,
  buildStructuredElicitationResponse,
  buildOptionSelectionResponse,
  buildUserInputFormDismissResponse,
  buildUserInputFormResponse,
  DEFAULT_APPROVAL_OPTION_IDS,
  structuredRequestFieldSchema,
  structuredFieldIsSecret,
} from "@/shared/runtimeRequestForms";
import {
  structuredFieldVisible,
  validStructuredValue,
  type StructuredFormProperty,
} from "@/shared/structuredForm";

export function buildAppThreadReply(
  { payload }: { requestType: CanonicalRequestType; payload: RequestPayload },
  reply: AppThreadReply,
): unknown {
  const structured = asStructuredElicitationDetails(payload.details);
  if (structured?.mode === "url") throw new Error("Complete this browser request in Poracode.");
  if (structured?.mode === "form") {
    if (reply.kind === "dismiss") return buildStructuredElicitationDismissResponse();
    if (reply.kind !== "form") throw new Error("This request requires a structured form reply.");
    const { requestedSchema } = structured;
    const required = new Set(requestedSchema.required);
    const validated = Object.fromEntries(
      Object.entries(requestedSchema.properties).map(([id, raw]) => [
        id,
        structuredRequestFieldSchema.parse(raw),
      ]),
    );
    if (Object.values(validated).some(structuredFieldIsSecret)) {
      throw new Error("Answer this secret-bearing request in Poracode.");
    }
    const properties = validated as Record<string, StructuredFormProperty>;
    if (Object.keys(reply.values).some((id) => !Object.hasOwn(properties, id))) {
      throw new Error("The reply includes a field this form did not request.");
    }
    for (const [id, property] of Object.entries(properties)) {
      if (
        structuredFieldVisible(property, reply.values) &&
        !validStructuredValue(property, reply.values[id], required.has(id))
      ) {
        throw new Error(`The form field ${id} requires a valid value.`);
      }
    }
    return buildStructuredElicitationResponse(
      { ...structured, requestedSchema: { ...requestedSchema, properties } },
      reply.values,
    );
  }
  const form = asUserInputFormDetails(payload.details);
  if (form) {
    if (reply.kind === "dismiss") return buildUserInputFormDismissResponse();
    if (form.questions.some(({ isSecret }) => isSecret)) {
      throw new Error("Answer this secret-bearing request in Poracode.");
    }
    if (reply.kind !== "questions")
      throw new Error("This request requires answers by question ID.");
    const ids = new Set(form.questions.map(({ id }) => id));
    if (Object.keys(reply.answers).some((id) => !ids.has(id))) {
      throw new Error("The reply includes a question this form did not ask.");
    }
    for (const question of form.questions) {
      const answer = Object.hasOwn(reply.answers, question.id)
        ? reply.answers[question.id]
        : undefined;
      const selections = typeof answer === "string" ? [answer] : (answer ?? []);
      if (
        selections.length === 0 ||
        Array.isArray(answer) !== question.multiSelect ||
        selections.some(
          (value) =>
            !value.trim() ||
            (question.options &&
              !question.allowCustom &&
              !question.options.some(({ optionId }) => optionId === value)),
        )
      )
        throw new Error(`Question ${question.id} requires a valid answer.`);
    }
    return buildUserInputFormResponse(form, reply.answers, {});
  }
  if (reply.kind !== "options") throw new Error("Choose an option from the pending request.");
  const available =
    payload.options?.map(({ optionId }) => optionId) ?? Object.values(DEFAULT_APPROVAL_OPTION_IDS);
  if (
    (!payload.multiSelect && reply.optionIds.length > 1) ||
    new Set(reply.optionIds).size !== reply.optionIds.length ||
    reply.optionIds.some((id) => !available.includes(id))
  )
    throw new Error("The reply includes an unavailable or repeated option.");
  return buildOptionSelectionResponse(reply.optionIds);
}
