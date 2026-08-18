/**
 * Map host filesystem failures from the ACP `fs/read_text_file` and
 * `fs/write_text_file` handlers onto JSON-RPC errors the agent can classify.
 *
 * Without this, a Node errno (`ENOENT`, `EACCES`, …) escapes the handler as a
 * plain `Error` and the ACP SDK reports it as `-32603 Internal error`, which
 * tells the agent nothing — a missing file becomes indistinguishable from a
 * broken client. The spec reserves `-32002` (resource not found) for exactly
 * this case, so a "does the file exist yet?" read gets an answer instead of a
 * hard failure.
 */
import { RequestError } from "@agentclientprotocol/sdk";

/** Node errnos that mean "this path does not resolve to a file". */
const NOT_FOUND_CODES = new Set(["ENOENT", "ENOTDIR"]);

export function isMissingPathError(error: unknown): boolean {
  const code = errnoOf(error);
  return code !== undefined && NOT_FOUND_CODES.has(code);
}

function errnoOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Convert an fs error into the JSON-RPC error to send back to the agent.
 * `RequestError`s (e.g. the outside-the-project rejection from
 * `resolveAcp*HostFsPath`) pass through untouched; everything else keeps its
 * errno and message in the error payload so failures stay diagnosable.
 */
export function toAcpFsRequestError(error: unknown, rawPath: string): unknown {
  if (error instanceof RequestError) return error;
  const code = errnoOf(error);
  if (code !== undefined && NOT_FOUND_CODES.has(code)) {
    return RequestError.resourceNotFound(rawPath);
  }
  return RequestError.internalError({
    path: rawPath,
    ...(code !== undefined ? { code } : {}),
    message: error instanceof Error ? error.message : String(error),
  });
}
