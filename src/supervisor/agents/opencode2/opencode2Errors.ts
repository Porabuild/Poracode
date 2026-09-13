/**
 * Classify raw failures that surface from the OpenCode 2 client / spawned
 * `opencode2 serve` into short, user-facing strings.
 *
 * Deliberately narrower than the OpenCode 1 classifier: the V2 sidecar owns its
 * generated Basic credentials (so auth can't be user-misconfigured) and the
 * provider surfaces no CLI fallbacks, so the only failures worth naming are the
 * environmental ones — a missing binary, an unreachable server, a lost
 * connection. The caller surfaces the classified string through whatever
 * channel it has; this file does not decide where it lands.
 */

/** Pull a flat lowercase message out of any error-like value. */
export function readOpenCode2ErrorText(cause: unknown): string {
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

export function isOpenCode2ConnectionLoss(cause: unknown): boolean {
  const text = readOpenCode2ErrorText(cause);
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
export function classifyOpenCode2Error(input: {
  cause: unknown;
  serverUrl?: string | undefined;
  operation?: string | undefined;
}): string {
  const text = readOpenCode2ErrorText(input.cause);
  const where = input.operation ? `${input.operation}: ` : "";

  if (/(econnrefused|connection refused)/.test(text)) {
    const target = input.serverUrl ? ` at ${input.serverUrl}` : "";
    return `${where}Couldn't reach the OpenCode 2 server${target} (connection refused). Make sure it's running and reachable.`;
  }
  if (/(enotfound|getaddrinfo)/.test(text)) {
    const target = input.serverUrl ? ` (${input.serverUrl})` : "";
    return `${where}OpenCode 2 server hostname could not be resolved${target}. Check the URL and your network.`;
  }
  if (
    /(fetch failed|networkerror|socket hang up|aborted)/.test(text) &&
    !/aborted by user/.test(text)
  ) {
    return `${where}Lost the connection to the OpenCode 2 server. Retry, or check the server logs.`;
  }
  if (/(etimedout|timeout|timed out|deadline)/.test(text)) {
    return `${where}OpenCode 2 server did not respond in time. Retry, or check the server's load.`;
  }
  if (/eaddrinuse|address already in use|port/.test(text)) {
    return `${where}OpenCode 2 server could not bind a port. Retry, or check for a stale server process.`;
  }
  if (/enoent|spawn .* enoent|not found.*path/.test(text)) {
    return `${where}OpenCode 2 CLI (\`opencode\`) is not installed or not on PATH.`;
  }
  if (/quarantine|operation not permitted/.test(text)) {
    return `${where}macOS is blocking the OpenCode 2 binary (quarantine). Run \`xattr -d com.apple.quarantine "$(which opencode)"\` to clear it.`;
  }
  if (/invalid code signature|killed: 9|sigkill/.test(text)) {
    return `${where}macOS killed the OpenCode 2 process (invalid code signature). Reinstall OpenCode 2 to fix the binary.`;
  }
  // Fall-through: use whatever message we have, prefixed by the operation if
  // one was supplied. Keeps the original failure visible for debugging while
  // still routing it through the same surface as classified errors.
  const original =
    input.cause instanceof Error && input.cause.message.trim().length > 0
      ? input.cause.message.trim()
      : typeof input.cause === "string" && input.cause.trim().length > 0
        ? input.cause.trim()
        : "OpenCode 2 operation failed.";
  return `${where}${original}`;
}
