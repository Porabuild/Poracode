/**
 * Devin client-hosted diagnostics bridge: answers the agent-initiated
 * `_cognition.ai/request_diagnostics` pull from the host's LSP diagnostics
 * snapshot.
 *
 * Contract proven live on `devin acp` 3000.11.3 (read-only lanes; no probe
 * repeats):
 *   - E6 (tmp/devin/lane-e6-result.md): mid-turn pull with `{}` params — no
 *     `sessionId` field — and honest `-32601` fallback when the client does
 *     not implement the method (proven graceful: WARN + completed turn).
 *   - E7 (tmp/devin/lane-e7-result.md): populated RESULT schema —
 *     `RequestDiagnosticsResult {items?: DiagnosticItem[], truncated?: bool}`
 *     where every `DiagnosticItem` requires exactly six fields with plain
 *     string `severity`/`source` and 0-based `range` positions. `code`, `path`
 *     and friends are NOT native fields (silently ignored wire-side), and a
 *     deserialize failure is as graceful as `-32601`.
 *
 * Host seam (root-owned, `src/shared/lsp.ts`): `readHostDiagnostics(signal)`
 * resolves a readonly detached snapshot bound to the owning project, or
 * `undefined` when no diagnostics source is available. An empty `documents`
 * array is a legitimate "ready source, no diagnostics" answer and is served
 * as a real success; an unavailable source is NOT — the handler declines and
 * the agent receives the proven-honest `-32601` instead of a fabricated ACK.
 *
 */

import { createHash } from "node:crypto";
import type { HostDiagnostic, HostDiagnosticDocument, HostDiagnosticsSnapshot } from "@/shared/lsp";

import { assertBoundedJson } from "@/shared/jsonBounds";

import type { AcpExtensionRequestHandler, AcpExtensionRequestOutcome } from "../../base/types";
import { AcpExtensionRequestError } from "../../acp/sessionExtensionRequests";

/** Exact wire method (the leading underscore is dispatch-only). */
export const DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD = "_cognition.ai/request_diagnostics";

/**
 * Per-request result bound. A host snapshot whose wire result exceeds this
 * fails the pull visibly (`-32603`, proven graceful) instead of returning an
 * oversized payload the agent's serde would reject anyway.
 */
const RESULT_MAX_BYTES = 512 * 1024;

/**
 * LSP numeric severity → wire severity string. E7 proved the wire field is an
 * UNCONSTRAINED string (integers are type-rejected); only `'error'` rendering
 * is qualified — the other spellings are the local convention. An absent
 * severity is displayed as information, without inventing an error classification.
 */
const SEVERITY_TO_WIRE: Record<number, string> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "hint",
};

/**
 * Build the agent→client request handler for one session's diagnostics pull.
 * `readHostDiagnostics` must be bound to the handler's owning project; the
 * shared ACP lifecycle (`sessionExtensionRequests.ts`) already owns timeout,
 * exactly-once settlement, session-identity re-checks and late-result
 * discard, so this handler only adds the method, params, source and mapping
 * contracts.
 */
export function createDevinDiagnosticsRequestHandler(
  readHostDiagnostics: (signal: AbortSignal) => Promise<HostDiagnosticsSnapshot | undefined>,
): AcpExtensionRequestHandler {
  return async (method, params, ctx): Promise<AcpExtensionRequestOutcome> => {
    if (method !== DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD) return { handled: false };
    // The native pull carries `{}` (E6/E7). Anything else is not the
    // qualified method contract: reject with a typed invalid-params error
    // WITHOUT touching the host source — never a guessed best-effort pull.
    assertEmptyRequestParams(params);
    if (ctx.sessionId === undefined) {
      throw new AcpExtensionRequestError(
        -32602,
        `${DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD} requires a current session id.`,
        { method: DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD },
      );
    }
    // Cancellation is honored before and after the host gather: an aborted
    // request was already answered (exactly once) by the shared lifecycle, so
    // no stale snapshot may surface here.
    if (ctx.signal.aborted) return { handled: false };
    const snapshot = await readHostDiagnostics(ctx.signal);
    if (ctx.signal.aborted) return { handled: false };
    // Source unavailable: decline. The shared lifecycle answers the real
    // `method not found` (E6-proven graceful); a fabricated empty success
    // would tell the agent "no diagnostics" behind the host's back.
    if (snapshot === undefined) return { handled: false };
    return { handled: true, result: mapHostSnapshotToResult(snapshot) };
  };
}

function assertEmptyRequestParams(params: unknown): void {
  if (
    typeof params !== "object" ||
    params === null ||
    Array.isArray(params) ||
    Object.keys(params).length > 0
  ) {
    throw new AcpExtensionRequestError(
      -32602,
      `${DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD} expects empty {} params.`,
      { method: DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD },
    );
  }
}

function hostFault(message: string): AcpExtensionRequestError {
  // Host-side faults are internal errors: the pull fails visibly (proven
  // graceful) and never degrades into a fabricated "no diagnostics" answer.
  return new AcpExtensionRequestError(-32603, `Host diagnostics snapshot rejected: ${message}`, {
    method: DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD,
  });
}

function assertWirePosition(value: unknown, label: string): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0xffffffff
  ) {
    throw hostFault(`${label} is not a u32 position.`);
  }
}

function assertWirePositionObj(value: unknown, label: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw hostFault(`${label} is missing.`);
  }
  const position = value as Record<string, unknown>;
  assertWirePosition(position.line, `${label}.line`);
  assertWirePosition(position.character, `${label}.character`);
}

function assertHostDocument(document: unknown): asserts document is HostDiagnosticDocument {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw hostFault("document is not an object.");
  }
  const doc = document as Record<string, unknown>;
  if (typeof doc.uri !== "string" || doc.uri.length === 0) {
    throw hostFault("document.uri is not a non-empty string.");
  }
  if (typeof doc.languageId !== "string" || doc.languageId.length === 0) {
    throw hostFault(`document.languageId is not a non-empty string (uri ${doc.uri}).`);
  }
  if (!Array.isArray(doc.diagnostics)) {
    throw hostFault(`document.diagnostics is not an array (uri ${doc.uri}).`);
  }
}

function assertHostDiagnostic(
  diagnostic: unknown,
  uri: string,
): asserts diagnostic is HostDiagnostic {
  if (typeof diagnostic !== "object" || diagnostic === null || Array.isArray(diagnostic)) {
    throw hostFault(`diagnostic is not an object (uri ${uri}).`);
  }
  const diag = diagnostic as Record<string, unknown>;
  if (typeof diag.message !== "string") {
    throw hostFault(`diagnostic.message is not a string (uri ${uri}).`);
  }
  if (typeof diag.range !== "object" || diag.range === null || Array.isArray(diag.range)) {
    throw hostFault(`diagnostic.range is missing (uri ${uri}).`);
  }
  const range = diag.range as Record<string, unknown>;
  assertWirePositionObj(range.start, `diagnostic.range.start (uri ${uri})`);
  assertWirePositionObj(range.end, `diagnostic.range.end (uri ${uri})`);
  if (
    diag.severity !== undefined &&
    (typeof diag.severity !== "number" || SEVERITY_TO_WIRE[diag.severity] === undefined)
  ) {
    throw hostFault(`diagnostic.severity is not 1|2|3|4 (uri ${uri}).`);
  }
  if (diag.source !== undefined && typeof diag.source !== "string") {
    throw hostFault(`diagnostic.source is not a string (uri ${uri}).`);
  }
  if (diag.code !== undefined && typeof diag.code !== "string" && typeof diag.code !== "number") {
    throw hostFault(`diagnostic.code is not a string|number (uri ${uri}).`);
  }
}

/**
 * Hash over the identity tuple: the same diagnostic maps to the same id on
 * every pull, so the agent can correlate re-pulled diagnostics across a turn.
 * Duplicate occurrences (identical tuple) get a deterministic `-N` suffix in
 * host order — stable while the host's snapshot ordering is stable.
 */
function stableDiagnosticId(tuple: string): string {
  return `diag-v1-${createHash("sha256").update(tuple).digest("hex")}`;
}

function diagnosticIdentityTuple(
  uri: string,
  diagnostic: HostDiagnostic,
  severity: string,
  source: string,
): string {
  const range = diagnostic.range;
  const code =
    diagnostic.code === undefined ? "" : `code:${typeof diagnostic.code}:${diagnostic.code}`;
  return JSON.stringify([
    uri,
    `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`,
    diagnostic.message,
    source,
    severity,
    code,
  ]);
}

/**
 * Translate the host snapshot into the earned E7 wire result. Read-only over
 * the (readonly, detached) snapshot — positions are copied, never rewritten —
 * and every translated item carries exactly the six required fields in
 * earned declaration order. `code` participates in the id only: it is not a
 * native wire field. Oversized or malformed host data fails visibly above.
 */
function mapHostSnapshotToResult(snapshot: HostDiagnosticsSnapshot): Record<string, unknown> {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    throw hostFault("snapshot is not an object.");
  }
  if (!Array.isArray(snapshot.documents)) {
    throw hostFault("snapshot.documents is not an array.");
  }
  if (typeof snapshot.truncated !== "boolean") {
    throw hostFault("snapshot.truncated is not a boolean.");
  }
  try {
    assertBoundedJson(snapshot, RESULT_MAX_BYTES);
  } catch {
    throw hostFault("snapshot exceeds JSON bounds.");
  }
  const items: Array<Record<string, unknown>> = [];
  const occurrences = new Map<string, number>();
  for (const document of snapshot.documents) {
    assertHostDocument(document);
    for (const diagnostic of document.diagnostics) {
      assertHostDiagnostic(diagnostic, document.uri);
      // Required wire field: host `source` when present (preserved exact),
      // otherwise the document's languageId as the bounded fallback.
      const source = diagnostic.source ?? document.languageId;
      const severity = SEVERITY_TO_WIRE[diagnostic.severity ?? 3]!;
      const baseId = stableDiagnosticId(
        diagnosticIdentityTuple(document.uri, diagnostic, severity, source),
      );
      const occurrence = (occurrences.get(baseId) ?? 0) + 1;
      occurrences.set(baseId, occurrence);
      const id = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
      const { start, end } = diagnostic.range;
      items.push({
        id,
        uri: document.uri,
        message: diagnostic.message,
        range: {
          start: { line: start.line, character: start.character },
          end: { line: end.line, character: end.character },
        },
        severity,
        source,
      });
    }
  }
  const result = { items, truncated: snapshot.truncated };
  try {
    assertBoundedJson(result, RESULT_MAX_BYTES);
  } catch {
    throw hostFault(`wire result exceeds the ${RESULT_MAX_BYTES}-byte bound.`);
  }
  return result;
}
