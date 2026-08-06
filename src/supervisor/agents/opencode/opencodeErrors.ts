/**
 * Classify raw failures that surface from the OpenCode SDK / spawned
 * `opencode serve` into short, user-facing strings.
 *
 * The classification only looks at the message text — the SDK throws plain
 * `Error`s with a mixed bag of shapes (`fetch failed`, `{response, request}`,
 * `Error: 401`), and we want the same message regardless of whether the
 * failure was raised at fetch time, parse time, or server-spawn time. The
 * caller surfaces the classified string through whatever channel it has
 * (`listener.onError`, console.warn, status pill, etc.) — this file does not
 * decide where it lands.
 */

/**
 * Pull a flat lowercase message out of any error-like value. Keeps the test
 * surface narrow: every classifier branch checks this string only.
 */
export function readOpenCodeErrorText(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message.toLowerCase();
  }
  if (cause && typeof cause === "object") {
    const obj = cause as Record<string, unknown>;
    const status =
      obj.response && typeof obj.response === "object"
        ? (obj.response as { status?: unknown }).status
        : undefined;
    const body = obj.error ?? obj.data ?? obj.body ?? obj.message;
    const text = typeof body === "string" ? body : JSON.stringify(body ?? obj);
    return `${status !== undefined ? `status=${String(status)} ` : ""}${text}`.toLowerCase();
  }
  return String(cause ?? "").toLowerCase();
}

export function isOpenCodeConnectionLoss(cause: unknown): boolean {
  const text = readOpenCodeErrorText(cause);
  return (
    /(econnrefused|connection refused|fetch failed|networkerror|socket hang up|aborted)/.test(
      text,
    ) && !/aborted by user/.test(text)
  );
}

/**
 * Convert a raw failure into a user-facing summary. The original message is
 * still appended after a colon when no classification matched, so power users
 * see the underlying error without having to dig through logs.
 */
export function classifyOpenCodeError(input: {
  cause: unknown;
  serverUrl?: string | undefined;
  operation?: string | undefined;
}): string {
  const text = readOpenCodeErrorText(input.cause);
  const where = input.operation ? `${input.operation}: ` : "";

  if (
    /\b(401|unauthorized|invalid api key|invalid token)\b/.test(text) ||
    /\bauthentication\b.*\bfailed\b/.test(text)
  ) {
    return `${where}OpenCode rejected authentication. Run \`opencode auth login\` or check the server password.`;
  }
  if (/\b(403|forbidden)\b/.test(text)) {
    return `${where}OpenCode refused the request (403 Forbidden). Check that the active credential has permission for this provider/model.`;
  }
  if (/\b(404|not found)\b/.test(text) && /provider|model/.test(text)) {
    return `${where}OpenCode reported the provider or model is not available. Run \`opencode providers list\` to see what's connected.`;
  }
  if (/(econnrefused|connection refused)/.test(text)) {
    const target = input.serverUrl ? ` at ${input.serverUrl}` : "";
    return `${where}Couldn't reach the OpenCode server${target} (connection refused). Make sure it's running and reachable.`;
  }
  if (/(enotfound|getaddrinfo)/.test(text)) {
    const target = input.serverUrl ? ` (${input.serverUrl})` : "";
    return `${where}OpenCode server hostname could not be resolved${target}. Check the URL and your network.`;
  }
  if (
    /(fetch failed|networkerror|socket hang up|aborted)/.test(text) &&
    !/aborted by user/.test(text)
  ) {
    return `${where}Lost the connection to the OpenCode server. Retry, or check the server logs.`;
  }
  if (/(etimedout|timeout|timed out|deadline)/.test(text)) {
    return `${where}OpenCode server did not respond in time. Retry, or check the server's load.`;
  }
  if (/enoent|spawn .* enoent|not found.*path/.test(text)) {
    return `${where}OpenCode CLI (\`opencode\`) is not installed or not on PATH.`;
  }
  if (/quarantine|operation not permitted/.test(text)) {
    return `${where}macOS is blocking the OpenCode binary (quarantine). Run \`xattr -d com.apple.quarantine "$(which opencode)"\` to clear it.`;
  }
  if (/invalid code signature|killed: 9|sigkill/.test(text)) {
    return `${where}macOS killed the OpenCode process (invalid code signature). Reinstall OpenCode to fix the binary.`;
  }
  if (/version|too old|min/i.test(text) && /opencode/.test(text)) {
    return `${where}OpenCode binary is too old. Run \`opencode upgrade\` (or reinstall) to get a supported version.`;
  }
  // Fall-through: use whatever message we have, prefixed by the operation if
  // one was supplied. Keeps the original failure visible for debugging while
  // still routing it through the same surface as classified errors.
  const original =
    input.cause instanceof Error && input.cause.message.trim().length > 0
      ? input.cause.message.trim()
      : typeof input.cause === "string" && input.cause.trim().length > 0
        ? input.cause.trim()
        : "OpenCode operation failed.";
  return `${where}${original}`;
}
