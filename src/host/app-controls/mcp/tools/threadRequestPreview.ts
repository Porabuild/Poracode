import { asPermissionRequestDetails } from "@/shared/contracts";
import type { OpenRuntimeRequestPreview } from "@/shared/runtimeRequestPreview";
import {
  asStructuredElicitationDetails,
  asUserInputFormDetails,
  DEFAULT_APPROVAL_OPTION_IDS,
  isPlanApprovalRequest,
  readInputString,
  structuredRequestFieldSchema,
  structuredFieldIsSecret,
} from "@/shared/runtimeRequestForms";
import { structuredFormOptions } from "@/shared/structuredForm";

export function describeThreadRequest(
  request: Pick<OpenRuntimeRequestPreview, "requestId" | "requestType" | "payload">,
  includeDetails: boolean,
) {
  const { requestId, requestType, payload } = request;
  const approval = asPermissionRequestDetails(payload.details);
  const structured = asStructuredElicitationDetails(payload.details);
  const form = structured ? undefined : asUserInputFormDetails(payload.details);
  const plan = isPlanApprovalRequest(request);
  const responseMode =
    structured?.mode === "url"
      ? "browser"
      : structured
        ? "structured_form"
        : form
          ? "questions"
          : "options";

  return {
    requestId,
    requestType,
    summary: payload.summary,
    options:
      payload.options ??
      (responseMode === "options"
        ? [
            { optionId: DEFAULT_APPROVAL_OPTION_IDS.allow, label: "Allow" },
            { optionId: DEFAULT_APPROVAL_OPTION_IDS.deny, label: "Deny" },
          ]
        : undefined),
    multiSelect: payload.multiSelect,
    responseMode,
    ...(approval
      ? {
          toolName: approval.toolName,
          blockedPath: approval.blockedPath,
          decisionReason: approval.decisionReason,
        }
      : {}),
    ...(plan ? { planReview: true } : {}),
    ...(includeDetails ? requestDetails() : {}),
  };

  function requestDetails() {
    if (structured?.mode === "url") {
      return { details: { message: structured.message, source: structured.sourceText } };
    }
    if (structured?.mode === "form") {
      const { requestedSchema, message, sourceText } = structured;
      const required = new Set(requestedSchema.required);
      const fields = Object.entries(requestedSchema.properties).map(([id, raw]) => {
        const field = structuredRequestFieldSchema.safeParse(raw);
        if (!field.success) return { id, required: required.has(id), unsupported: true };
        const {
          enum: _enum,
          enumNames: _names,
          oneOf: _one,
          anyOf: _any,
          items: _items,
          ...constraints
        } = field.data;
        return {
          id,
          ...constraints,
          ...(structuredFieldIsSecret(field.data) ? { isSecret: true } : {}),
          required: required.has(id),
          options: structuredFormOptions(field.data as Parameters<typeof structuredFormOptions>[0]),
        };
      });
      return { details: { message, source: sourceText, fields } };
    }
    if (form) return { details: { questions: form.questions } };
    if (plan) {
      const planText = readInputString(approval?.input, "plan");
      return {
        details: {
          planFilePath: readInputString(approval?.input, "planFilePath", "plan_filename"),
          ...(planText === undefined
            ? {}
            : {
                plan: planText.slice(0, 12_000),
                planTruncated: planText.length > 12_000,
              }),
        },
      };
    }
    return approval?.description
      ? { details: { description: approval.description.slice(0, 2_000) } }
      : {};
  }
}
