import type { Thread } from "@/shared/contracts";

/**
 * `Thread.sessionConfigOptions` is live runtime metadata owned by a session
 * incarnation, never durable state: it arrives on `thread-state` events and
 * runtime snapshots, while the host has no storage column for it, so every row
 * served from host storage (and every row written before a host restart) can
 * only offer a stale value. Browser/PWA persistence therefore omits it on
 * write and normalizes it away on read (see "Live session control inventories"
 * in `.agents/docs/versioning.md`), exactly like the desktop's
 * preferences-only persistence already does by never storing catalog rows.
 *
 * The strip removes ONLY this key: user ThreadConfig, title, status, history
 * routing, and every other row field pass through untouched. A row without
 * the key is returned as the SAME reference, so callers never clone clean rows
 * and never clear the live store object that a real event just updated — only
 * a contaminated row is shallow-cloned with the volatile key removed.
 */
export function stripVolatileSessionConfigOptions(thread: Thread): Thread {
  if (thread.sessionConfigOptions === undefined) return thread;
  const { sessionConfigOptions: _volatile, ...rest } = thread;
  return rest;
}

/**
 * The wholesale-replacement counterpart of the strip: when a durable or
 * projected copy of a row replaces its resident row, re-attach the resident
 * live inventory instead of letting the copy's missing key erase it.
 *
 * Every page/refresh surface serves rows the host cannot vouch an inventory
 * for — root catalog pages, remote mirror projections, and thread snapshots
 * from a host whose inventory store has no entry for the thread (older
 * supervisor, failed seed, never-negotiated session). Replacing wholesale
 * would drop an inventory a live `thread-state` event just delivered, so a
 * background thread's composer controls vanished on every refresh. The pull
 * surfaces' own contract is "absence means retain" (see `enrichThreadRow` in
 * the host's `sessionConfigInventory.ts`): only an explicit page value is
 * authoritative.
 *
 * Fires only while the page still describes the SAME session incarnation the
 * resident inventory belongs to:
 * - incoming page value present — including `null` and `[]` — always wins;
 *   only a missing key (`undefined`) carries.
 * - the resident value must be live (`undefined`/`null` carry nothing, so a
 *   retired inventory is never resurrected).
 * - exact ownership: same `agentKind` and same `sessionRef`
 *   (`providerSessionId` + `executionIdentity`), the comparison idiom of the
 *   live path (`updateThreadRuntime`). A new owner or session — or an
 *   unresolvable page reference — inherits nothing.
 * - an inactive or archived page row receives nothing: retirement must not be
 *   resurrected. `error` alone is a live runtime and keeps the carry, and
 *   `done` is user workflow state, never retirement.
 *
 * Pure and identity-safe: every "no carry" outcome returns `incoming` as the
 * same reference, so callers can gate on reference equality to stay
 * churn-free, and only a carried row is a fresh object.
 */
export function carryVolatileSessionConfigOptions(existing: Thread, incoming: Thread): Thread {
  if (incoming.sessionConfigOptions !== undefined) return incoming;
  const carried = existing.sessionConfigOptions;
  if (carried === undefined || carried === null) return incoming;
  if (incoming.status === "inactive" || incoming.archived) return incoming;
  if (
    existing.agentKind !== incoming.agentKind ||
    existing.sessionRef === undefined ||
    incoming.sessionRef === undefined ||
    existing.sessionRef.providerSessionId !== incoming.sessionRef.providerSessionId ||
    existing.sessionRef.executionIdentity !== incoming.sessionRef.executionIdentity
  ) {
    return incoming;
  }
  return { ...incoming, sessionConfigOptions: carried };
}
