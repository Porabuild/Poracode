import type { RuntimeErrorReason } from "@/shared/contracts";
import { msg } from "@/shared/messages";

const GEMINI_AUTH_ERROR_RE =
  /invalid api key|api_key_invalid|unauthenticated|authentication(?: failed| required)|unauthorized|permission_denied|\b401\b|\b403\b|credentials?.*(?:missing|invalid|expired)|oauth.*(?:expired|invalid|failed)|login required/i;
const GEMINI_QUOTA_ERROR_RE = /quota|rate.?limit|resource_exhausted|\b429\b|too many requests/i;
const GEMINI_BLOCKED_ERROR_RE =
  /safety|blocked|recitation|prohibited_content|finish[_ ]?reason.*(?:safety|recitation|blocklist|prohibited|spii)/i;

/**
 * Gemini CLI v0.68.0's ACP runner can catch stream/model/safety failures and
 * still resolve `session/prompt` with `{ stopReason: "end_turn" }` and no
 * assistant text. Classify stderr hints when available, and always fail loudly
 * instead of returning an empty completion (e.g. to Crossagents).
 */
export function resolveGeminiEmptyResponseError(input: {
  stopReason: string;
  stderr: readonly string[];
}): Error {
  const stderr = input.stderr.join("\n");
  if (GEMINI_AUTH_ERROR_RE.test(stderr)) {
    return new Error(msg("gemini.authFailed"));
  }
  if (GEMINI_QUOTA_ERROR_RE.test(stderr)) {
    return new Error(msg("gemini.quotaExceeded"));
  }
  if (GEMINI_BLOCKED_ERROR_RE.test(stderr)) {
    return new Error(msg("gemini.responseBlocked"));
  }
  return new Error(msg("gemini.emptyResponse"));
}

function readNumericErrorField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

/**
 * Map Gemini JSON-RPC prompt errors that signal rejected credentials/API keys
 * (without using the standard ACP -32000 `auth_required` envelope) to the
 * shared `"auth_required"` runtime error reason.
 */
export function resolveGeminiPromptErrorReason(error: unknown): RuntimeErrorReason | undefined {
  if (typeof error !== "object" || error === null) {
    return typeof error === "string" && GEMINI_AUTH_ERROR_RE.test(error)
      ? "auth_required"
      : undefined;
  }
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    data?: unknown;
  };
  const data =
    typeof candidate.data === "object" && candidate.data !== null
      ? (candidate.data as Record<string, unknown>)
      : undefined;

  const status = readNumericErrorField(data?.status) ?? readNumericErrorField(data?.code);
  if (status === 401 || status === 403) {
    return "auth_required";
  }

  const texts = [candidate.message, data?.message, data?.details, data?.detail, data?.error].filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  if (texts.some((text) => GEMINI_AUTH_ERROR_RE.test(text))) {
    return "auth_required";
  }
  return undefined;
}
