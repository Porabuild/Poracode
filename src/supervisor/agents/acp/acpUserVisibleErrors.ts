/**
 * Parse API failures Factory Droid surfaces as `agent_message_chunk` text before
 * `session/prompt` rejects with a generic JSON-RPC error.
 *
 * Observed wire format (Factory Droid `exec --output-format acp-daemon`):
 *   Error: 402 {"detail":"…","status":402,"title":"Payment Required","displayToUser":true,…}
 *   Error: 403 status code (no body)
 *
 * Antigravity ACP instead lands quota/provider failures on tool results (and
 * sometimes assistant text) as:
 *   Encountered retryable error from model provider: Agent execution terminated
 *   due to error. ("request failed (code 429): Individual quota reached. …")
 * and then retries `session/prompt` indefinitely, leaving the thread `working`.
 */
export function parseAcpAgentMessageApiError(text: string): string | undefined {
  const trimmed = text.trim();
  const jsonMatch = /^Error:\s*(\d{3})\s*(\{[\s\S]*\})\s*$/i.exec(trimmed);
  const statusCode = jsonMatch?.[1];
  const jsonBody = jsonMatch?.[2];
  if (statusCode && jsonBody) {
    return parseJsonApiError(statusCode, jsonBody);
  }

  const noBodyMatch = /^Error:\s*(\d{3})\s+status code\s*\(no body\)\s*$/i.exec(trimmed);
  const noBodyStatus = noBodyMatch?.[1];
  if (noBodyStatus) {
    return httpStatusUserMessage(noBodyStatus);
  }

  const plainMatch = /^Error:\s*(\d{3})\s+(.+)$/i.exec(trimmed);
  const plainStatus = plainMatch?.[1];
  const plainDetail = plainMatch?.[2];
  if (plainStatus && plainDetail && !plainDetail.trimStart().startsWith("{")) {
    const detail = plainDetail.trim();
    if (detail.length > 0 && !/^status code\b/i.test(detail)) {
      return detail;
    }
    return httpStatusUserMessage(plainStatus);
  }

  return parseAcpProviderFailureText(trimmed);
}

/**
 * True when the surfaced provider failure cannot be recovered by waiting on
 * the in-flight `session/prompt` (quota, hard terminate). Callers should fail
 * the turn instead of staying `working` through a retry loop.
 */
export function isFatalAcpQuotaError(message: string): boolean {
  return /quota reached|rate limit exceeded \(http 429\)|http 429/i.test(message);
}

/** Pull a user-facing message out of Antigravity/provider failure blobs. */
export function parseAcpProviderFailureText(text: string): string | undefined {
  const quotaDetail = text.match(/request failed \(code 429\):\s*(.+?)(?:[".]\s*\)\s*)?$/is);
  if (quotaDetail?.[1]) {
    return quotaDetail[1].replace(/[".\s]+$/u, "").trim();
  }
  const quotaSentence = text.match(/Individual quota reached\.[^"]*/i);
  if (quotaSentence) return quotaSentence[0].trim();
  if (/Agent execution terminated due to error/i.test(text) && /\b429\b|quota/i.test(text)) {
    return httpStatusUserMessage("429");
  }
  return undefined;
}

function parseJsonApiError(statusCode: string, jsonText: string): string | undefined {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const detail = typeof payload.detail === "string" ? payload.detail.trim() : undefined;
  const title = typeof payload.title === "string" ? payload.title.trim() : undefined;
  if (detail) return detail;
  if (title && payload.displayToUser === true) return title;
  if (payload.displayToUser === true) return httpStatusUserMessage(statusCode);
  return undefined;
}

function httpStatusUserMessage(code: string): string {
  switch (code) {
    case "401":
      return "Authentication failed (HTTP 401). Sign in to Factory or refresh your credentials.";
    case "402":
      return "Payment or usage limit reached (HTTP 402). Check your Factory account billing or usage.";
    case "403":
      return "Access denied (HTTP 403). Your Factory account may lack permission for this model or workspace.";
    case "429":
      return "Rate limit exceeded (HTTP 429). Wait and retry, or switch models.";
    default:
      return `Request failed (HTTP ${code}).`;
  }
}
