/**
 * Closed set of remote-audit event kinds. Host-side only: the HTTP dispatcher
 * and auth orchestrator emit these; they are not a wire-contract field.
 *
 * Additive values are backward-compatible for readers that skip unknown kinds.
 * `mutate` covers previously unaudited mutating routes (V6 A.9) until a more
 * specific kind is justified.
 */
export const REMOTE_AUDIT_EVENT_KINDS = [
  "pair",
  "token_exchange",
  "refresh_reuse",
  "revoke",
  "thread_create",
  "thread_send",
  "thread_stop",
  "file_read",
  "file_write",
  "forward_open",
  "procedure",
  "mutate",
  // Emitted by the audit sink itself — never by a routed HTTP request — when
  // the bounded write queue has to drop its oldest buffered lines (V6 A.8).
  "audit_queue_dropped",
] as const;

export type RemoteAuditEventKind = (typeof REMOTE_AUDIT_EVENT_KINDS)[number];

/** Per-route audit attribute (V6 A.9). `false` requires a justification. */
export type RemoteRouteAudit =
  | { readonly kind: RemoteAuditEventKind }
  | { readonly kind: false; readonly reason: string };

export function auditEvent(kind: RemoteAuditEventKind): RemoteRouteAudit {
  return { kind };
}

export function noAudit(reason: string): RemoteRouteAudit {
  return { kind: false, reason };
}
