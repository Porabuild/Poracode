import {
  CreateElicitationRequest as AcpCreateElicitationRequest,
  type CreateElicitationRequest,
} from "@agentclientprotocol/sdk";

/**
 * Vendor flag on the one qualified custom-answer elicitation.
 *
 * A form with this flag set, and exactly one string property that already
 * lists choices, is presented through the shared custom-answer control.
 * Every other shape stays closed. The original request is not modified;
 * reply normalization keeps reading it.
 */
const ALLOW_OTHER = "cognition.ai/allowOther";

export function projectQualifiedAllowOtherPresentation(
  request: CreateElicitationRequest,
): CreateElicitationRequest {
  if (!AcpCreateElicitationRequest.isForm(request)) return request;
  if (request._meta?.[ALLOW_OTHER] !== true) return request;
  const properties = request.requestedSchema.properties ?? {};
  const entries = Object.entries(properties);
  if (entries.length !== 1) return request;
  const [key, schema] = entries[0]!;
  if (!schema || schema.type !== "string") return request;
  const choices = schema as { oneOf?: unknown; enum?: unknown; allowCustom?: unknown };
  const hasChoices =
    (Array.isArray(choices.oneOf) && choices.oneOf.length > 0) ||
    (Array.isArray(choices.enum) && choices.enum.length > 0);
  if (!hasChoices || choices.allowCustom === true) return request;
  return {
    ...request,
    requestedSchema: {
      ...request.requestedSchema,
      properties: {
        ...properties,
        [key]: { ...schema, allowCustom: true },
      },
    },
  } as CreateElicitationRequest;
}
