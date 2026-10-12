import type { Thread, ThreadPresentationMode } from "@/shared/contracts";

/**
 * Admission guard for async session-action work in a long-lived control
 * component.
 *
 * The live controls component stays mounted while the app reuses it across
 * threads, provider switches, and session relaunches, so a pending rename,
 * revise, or listing callback can otherwise resolve against a thread it no
 * longer belongs to and write the new thread's state. Every async step is
 * therefore fenced by the ownership snapshot taken when the step started:
 * before the invoke (acquiring the pending slot) and again after every await,
 * before any callback or state write is applied.
 *
 * The tag captures every field that distinguishes "the same live session this
 * thread was showing": the thread row id, the provider instance, the remote
 * server projection, and the supervisor's `SessionRef` (provider session id +
 * execution identity). `thread.status` is deliberately absent — working→idle
 * is the same session and must not invalidate an invocation it accepted.
 * A bridge proxy object alone proves nothing about which endpoint backs it,
 * so the thread's own identity fields are the evidence.
 */
export function sessionOwnershipTag(
  thread: Pick<Thread, "id" | "agentKind" | "remoteServerId" | "remoteId" | "sessionRef">,
  presentationMode: ThreadPresentationMode | undefined,
): string {
  return JSON.stringify([
    thread.id,
    thread.agentKind,
    thread.remoteServerId ?? null,
    thread.remoteId ?? null,
    thread.sessionRef?.providerSessionId ?? null,
    thread.sessionRef?.executionIdentity ?? null,
    presentationMode ?? null,
  ]);
}

/**
 * One async session-action execution. `tag`/`epoch` are captured when the
 * action begins; the caller re-checks them against the live component refs
 * after every await (`admits(ticket)`).
 */
export interface SessionActionTicket {
  readonly tag: string;
  readonly epoch: number;
}

/** Result of a guarded invoke: the result plus the ticket it was fetched under. */
export interface GuardedActionResult {
  readonly ticket: SessionActionTicket;
  readonly result: Record<string, unknown>;
}

/**
 * Admission check for one ticket against the live owner mirrors. Module-level
 * so effects can call it without taking a per-render closure dependency; the
 * refs carry the liveness.
 */
export function ticketAdmits(
  ticket: SessionActionTicket,
  epochRef: { readonly current: number },
  tagRef: { readonly current: string },
): boolean {
  return ticket.epoch === epochRef.current && ticket.tag === tagRef.current;
}
