// Helpers used by resolveServerRequest. The renderer sends decisions in a
// generic shape — we accept the pieces we need and ignore the rest.

export function parsePermissionReply(response: unknown): "once" | "always" | "reject" {
  if (!response || typeof response !== "object") return "reject";
  const value = response as { decision?: unknown; optionId?: unknown };
  switch (value.decision ?? value.optionId) {
    case "accept":
    case "approve":
    case "allow":
    case "once":
      return "once";
    case "acceptForSession":
    case "always":
      return "always";
    default:
      return "reject";
  }
}

/**
 * The renderer answers the shared `userInputForm` details shape
 * (`{ answers: { [fieldKey]: value } }`); keep only the value forms V2's
 * `form.reply` accepts.
 */
export function parseFormAnswer(
  response: unknown,
): Record<string, string | number | boolean | string[]> | undefined {
  if (!response || typeof response !== "object") return undefined;
  const input = response as { answers?: unknown; content?: unknown };
  const answers = input.content ?? input.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return undefined;
  const output: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      output[key] = value as string[];
    }
  }
  return output;
}
