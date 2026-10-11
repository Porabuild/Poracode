import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

/**
 * Native ACP asks one question at a time via requestPermission, with plain
 * string choices in rawInput. Project it into the shared question contract,
 * keeping the server's option IDs so the answer returns to the same choice.
 */
export function normalizeCommandCodePermissionRequest(
  request: RequestPermissionRequest,
): RequestPermissionRequest {
  const raw = request.toolCall.rawInput;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return request;
  const input = raw as Record<string, unknown>;
  if (
    request.toolCall.kind !== "other" ||
    typeof input.question !== "string" ||
    !input.question.trim() ||
    !Array.isArray(input.options) ||
    !input.options.every((label) => typeof label === "string") ||
    input.options.length !== request.options.length ||
    !request.options.every((option, index) => option.optionId === `option_${index}`)
  ) {
    return request;
  }
  return {
    ...request,
    toolCall: {
      ...request.toolCall,
      title: "AskUserQuestion",
      content: [
        {
          type: "content",
          content: { type: "text", text: request.toolCall.title || input.question },
        },
      ],
    },
  };
}
