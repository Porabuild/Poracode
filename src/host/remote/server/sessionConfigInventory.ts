import type { SessionConfigOptions, Thread, ThreadRuntimeSnapshot } from "@/shared/contracts";

/**
 * One thread's latest observed live session-control inventory.
 */
export interface SessionConfigInventoryEntry {
  /**
   * Runtime owner that reported the inventory. `undefined` means the reporter
   * did not identify itself. Unowned entries cannot enrich a current row.
   */
  readonly agentKind: string | undefined;
  /**
   * Latest observed inventory. `null` is a retirement and must stay visible on
   * pulls so wholesale-replacing clients clear instead of retaining.
   */
  readonly options: SessionConfigOptions | null;
}

/**
 * Volatile, in-memory latest inventory of per-thread `sessionConfigOptions`
 * (live composer controls), projected from supervisor `thread-state` events.
 *
 * The host db deliberately has no column for the field (it is runtime-volatile
 * state, never persisted), so every remote HTTP pull surface — shell snapshot,
 * thread-list page, thread snapshot — serves pure db rows with the key absent.
 * Row-replacing clients read that absence as "clear", which drops live
 * inventory on every reconnect, page install, pin, and thread open. This store
 * lets the pull surfaces overlay the latest event-observed inventory back onto
 * served rows, fenced against the row's current owner.
 *
 * Same retention shape as `backgroundTasksByThread`: latest-event-wins, cleared
 * on exit/reset/shutdown, never persisted. The extra machinery over a plain
 * map is the {@link SessionConfigInventory.epoch} seed guard: the opened-thread
 * snapshot seeds this store from the supervisor's internal
 * `getThreadSnapshots` (never a remote RPC), and a seed that completes after
 * any newer inventory mutation must not overwrite it.
 */
export class SessionConfigInventory {
  private readonly entries = new Map<string, SessionConfigInventoryEntry>();

  /**
   * Monotonic mutation clock over the inventory domain (inventory events,
   * retirements, prunes, seed applications). A seed token captured before an
   * await no longer matches after ANY mutation, so a late seed can never
   * overwrite a newer event, provider switch, or exit. One scalar — no
   * per-thread tombstones are retained.
   */
  private epoch = 0;

  /** Latest entry for a thread, for read-side helpers and tests. */
  entryFor(threadId: string): SessionConfigInventoryEntry | undefined {
    return this.entries.get(threadId);
  }

  /**
   * Folds one `thread-state` event in. Tri-state: an absent
   * `sessionConfigOptions` (older supervisor) preserves what we already know;
   * an array installs it; `null` installs the retirement so pulls carry it.
   * An event without `agentKind` keeps the previous entry's owner, so a later
   * db-row owner change can still fence the entry out.
   */
  observeThreadState(input: {
    readonly threadId: string;
    readonly agentKind?: string;
    readonly sessionConfigOptions?: SessionConfigOptions | null;
  }): void {
    if (input.sessionConfigOptions === undefined) return;
    this.epoch++;
    this.entries.set(input.threadId, {
      agentKind: input.agentKind ?? this.entries.get(input.threadId)?.agentKind,
      options: input.sessionConfigOptions,
    });
  }

  /**
   * Retires a thread's inventory (session exit or thread reset). Always
   * advances the clock — even when nothing is stored — so a seed issued before
   * the exit cannot resurrect the departed session's inventory.
   */
  retireThread(threadId: string): void {
    this.epoch++;
    this.entries.delete(threadId);
  }

  /**
   * Drops entries for threads that no longer exist in the catalog (deletions
   * have no dedicated event). Call only from a read that observed the FULL
   * thread list (the legacy unbounded shell snapshot); a bounded page cannot
   * vouch for absence.
   */
  retainThreads(knownThreadIds: ReadonlySet<string>): void {
    if (this.entries.size === 0) return;
    let removed = false;
    for (const threadId of this.entries.keys()) {
      if (!knownThreadIds.has(threadId)) {
        this.entries.delete(threadId);
        removed = true;
      }
    }
    if (removed) this.epoch++;
  }

  /**
   * Captures the seed precondition. Call synchronously BEFORE issuing the
   * supervisor `getThreadSnapshots` read whose await boundary the seed spans.
   */
  beginSeed(): number {
    return this.epoch;
  }

  /**
   * Applies a completed `getThreadSnapshots` pull unless anything mutated the
   * inventory since {@link beginSeed} — a newer event, an exit, a prune, or
   * another seed application all reject it. Snapshots without the field (older
   * supervisor, or a session that never negotiated) store nothing. Consumes
   * the token even on success so a duplicate or out-of-order apply of the same
   * pull generation cannot rewrite entries.
   */
  applySeed(token: number, snapshots: readonly ThreadRuntimeSnapshot[]): void {
    if (token !== this.epoch) return;
    if (Array.isArray(snapshots)) {
      for (const snapshot of snapshots) {
        if (snapshot?.sessionConfigOptions === undefined) continue;
        if (typeof snapshot.threadId !== "string" || typeof snapshot.agentKind !== "string")
          continue;
        this.entries.set(snapshot.threadId, {
          agentKind: snapshot.agentKind,
          options: snapshot.sessionConfigOptions,
        });
      }
    }
    this.epoch++;
  }

  /**
   * Overlays the latest known inventory onto one served db row. Rows without
   * an entry are returned UNCHANGED (older-host shape: the key stays absent and
   * absence-means-retain consumers keep whatever they have). An entry observed
   * from a different runtime owner than the row's current owner is stale —
   * the row is served untouched and the entry is retired so later reads cannot
   * resurrect it either.
   */
  enrichThreadRow(thread: Thread): Thread {
    const entry = this.entries.get(thread.id);
    if (!entry) return thread;
    if (entry.agentKind !== thread.agentKind) {
      this.epoch++;
      this.entries.delete(thread.id);
      return thread;
    }
    return { ...thread, sessionConfigOptions: entry.options };
  }

  /**
   * Drops everything. The supervisor incarnation that reported the inventory
   * is gone; its fresh sessions republish their own state. Always advances the
   * clock: a seed issued against the departing incarnation must never land
   * after the restart, even when the store happened to be empty.
   */
  clear(): void {
    this.epoch++;
    this.entries.clear();
  }
}
