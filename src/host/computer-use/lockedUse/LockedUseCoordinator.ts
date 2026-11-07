import type {
  ComputerUseLockedUseBeginResult,
  ComputerUseLockedUseEndReason,
  ComputerUseLockedUseStatus,
} from "@/shared/contracts/computerUse";
import type { ComputerUseDriver } from "../mcp/types";
import type { LockedUseAuditWriter } from "./lockedUseAudit";

/** Tools that never need the desktop, so they never start an unlock. */
const EXEMPT_TOOLS: ReadonlySet<string> = new Set(["api", "disable"]);

/** End a session after this long without a tool call from its owner. */
export const LOCKED_USE_IDLE_MS = 5 * 60_000;
/** Shutdown waits this long for the relock answer; helper exit relocks anyway. */
const SHUTDOWN_END_TIMEOUT_MS = 3_000;

/**
 * The helper and the unlock plug-in only accept this thread id shape (it is
 * echoed on the plug-in socket line); anything else is refused host-side.
 */
const HELPER_THREAD_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/u;

function errorCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[a-z_]{1,32}$/u.test(code) ? code : undefined;
}

export const LOCKED_USE_OVERLAY_TITLE = "Poracode is using this Mac";
export const LOCKED_USE_OVERLAY_SUBTITLE = "Press any key to stop and lock it again";

export type LockedUseDriver = Pick<
  ComputerUseDriver,
  "lockedUseBegin" | "lockedUseEnd" | "lockedUseStatus"
>;

export interface LockedUseCoordinatorOptions {
  driver: LockedUseDriver;
  /** The user's `computerUseLockedUse` intent. */
  isSettingEnabled: () => boolean;
  shouldDimDisplay?: () => boolean;
  /** Plug-in, login rule, and state file are in place (cached by the service). */
  isInstalled: () => Promise<boolean>;
  audit: LockedUseAuditWriter;
  platform?: NodeJS.Platform;
  now?: () => Date;
  idleMs?: number;
  setTimer?: (run: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

function defaultSetTimer(run: () => void, delayMs: number): unknown {
  const timer = setTimeout(run, delayMs);
  timer.unref?.();
  return timer;
}

function defaultClearTimer(handle: unknown): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

/**
 * Result notes the agent sees when a locked Mac could not be unlocked for it.
 * The token before the colon is stable; the prose tells the agent what to do.
 */
export function lockedUseNote(result: ComputerUseLockedUseBeginResult): string | null {
  switch (result.outcome) {
    case "paused":
      return "locked_use_paused: Locked Computer Use is paused because someone used this Mac's keyboard or pointer. Stop and ask the user to unlock the Mac.";
    case "unavailable":
      return `locked_use_unavailable:${result.stage ?? "unknown"}: Poracode cannot unlock this Mac. Stop and ask the user to unlock it.`;
    case "failed":
      return `locked_use_failed:${result.stage ?? "unknown"}: Poracode could not unlock this Mac. Stop and ask the user to unlock it.`;
    default:
      return null;
  }
}

/**
 * Decides when the host unlocks a locked Mac for a Computer Use turn and when
 * it relocks it. One thread owns the session at a time. A session begins only
 * when the screen is locked, the user turned the setting on, the plug-in is
 * installed, the thread's turn is running, and Computer Use is enabled for the
 * thread; it ends on `disable`, turn end (including stop and interrupt), the
 * user ending Computer Use, idle, and host shutdown. The helper enforces the
 * rest (guard, local-input relock, session cap), so this class only gates and
 * audits.
 */
export class LockedUseCoordinator {
  private readonly runningTurns = new Set<string>();
  private readonly enabledThreads = new Set<string>();
  /** Per-turn result of a begin that did not unlock: not retried this turn. */
  private readonly turnNotes = new Map<string, string>();
  private owner: string | null = null;
  private pending: { threadId: string; revoked: boolean } | null = null;
  private revision = 0;
  private readonly threadRevisions = new Map<string, number>();
  private idleTimer: unknown = null;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private readonly platform: NodeJS.Platform;
  private readonly now: () => Date;
  private readonly idleMs: number;
  private readonly setTimer: (run: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: LockedUseCoordinatorOptions) {
    this.platform = options.platform ?? process.platform;
    this.now = options.now ?? (() => new Date());
    this.idleMs = options.idleMs ?? LOCKED_USE_IDLE_MS;
    this.setTimer = options.setTimer ?? defaultSetTimer;
    this.clearTimer = options.clearTimer ?? defaultClearTimer;
  }

  /** Thread that currently owns the unlocked session, if any. */
  get ownerThreadId(): string | null {
    return this.owner;
  }

  /** Turn start/end from supervisor thread state (stop and interrupt end a turn too). */
  setTurnActive(threadId: string, active: boolean): void {
    if (active) {
      this.runningTurns.add(threadId);
      return;
    }
    this.revokeRevision(threadId);
    this.runningTurns.delete(threadId);
    this.turnNotes.delete(threadId);
    void this.end(threadId, "turn_end");
  }

  /** Supervisor restart: no turn survives it. */
  resetTurns(): void {
    const owner = this.owner ?? this.pending?.threadId;
    this.revision += 1;
    this.runningTurns.clear();
    this.turnNotes.clear();
    if (owner) void this.end(owner, "turn_end");
  }

  /** `computer_use.enable` / `disable` for a thread. */
  setSessionEnabled(threadId: string, enabled: boolean): void {
    if (enabled) this.enabledThreads.add(threadId);
    else {
      this.enabledThreads.delete(threadId);
      this.revokeRevision(threadId);
      void this.end(threadId, "disabled");
    }
  }

  /**
   * The user ended Computer Use (Escape or the badge's exit). The ingress
   * kills the helper right after this, and the helper relocks on stdin EOF,
   * so this records the end without asking the helper to do it.
   */
  revokeThreads(threadIds: readonly string[]): void {
    for (const threadId of threadIds) {
      this.enabledThreads.delete(threadId);
      this.revokeRevision(threadId);
      if (this.pending?.threadId === threadId) this.pending.revoked = true;
      this.turnNotes.delete(threadId);
      if (this.owner !== threadId) continue;
      this.releaseOwner();
      this.audit({ threadId, event: "end", outcome: "helper_stopped", reason: "disabled" });
    }
  }

  /**
   * Runs before every tool call. Returns a result note when the Mac stays
   * locked for a reason the agent should report, otherwise null.
   */
  prepare(threadId: string, toolName: string): Promise<string | null> {
    if (
      this.disposed ||
      this.platform !== "darwin" ||
      EXEMPT_TOOLS.has(toolName) ||
      !this.isEligible(threadId)
    ) {
      return Promise.resolve(null);
    }
    return this.serialize(() => this.prepareSerialized(threadId));
  }

  /** Ends the session if `threadId` owns it. */
  end(threadId: string, reason: ComputerUseLockedUseEndReason): Promise<void> {
    if (this.pending?.threadId === threadId) {
      this.pending.revoked = true;
      // The native end action runs concurrently and cancels a begin waiting
      // inside loginwindow; serializing here would wait for the unlock first.
      return this.callEnd(reason).then(() => undefined);
    }
    if (this.owner !== threadId) return Promise.resolve();
    return this.serialize(() => this.endSerialized(threadId, reason));
  }

  /** A settings update disables the installed capability immediately. */
  async settingChanged(enabled: boolean): Promise<void> {
    if (enabled) return;
    this.revision += 1;
    const threadId = this.owner ?? this.pending?.threadId;
    if (threadId) await this.end(threadId, "disabled");
  }

  /** Host shutdown: relock now, without waiting behind queued work. */
  async shutdown(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const owner = this.owner ?? this.pending?.threadId;
    if (this.pending) this.pending.revoked = true;
    if (!owner) return;
    this.releaseOwner();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      this.callEnd("shutdown"),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("timeout"), SHUTDOWN_END_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    this.audit({ threadId: owner, event: "end", outcome, reason: "shutdown" });
  }

  private revokeRevision(threadId: string): void {
    this.threadRevisions.set(threadId, (this.threadRevisions.get(threadId) ?? 0) + 1);
  }

  private isEligible(threadId: string): boolean {
    return this.runningTurns.has(threadId) && this.enabledThreads.has(threadId);
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async prepareSerialized(threadId: string): Promise<string | null> {
    if (this.disposed || !this.isEligible(threadId)) return null;
    const revision = this.revision;
    const threadRevision = this.threadRevisions.get(threadId);
    const cachedNote = this.turnNotes.get(threadId);
    if (cachedNote) return cachedNote;
    if (this.owner !== null && this.owner !== threadId) {
      // Another thread's session may have ended on the helper's side (local
      // input, session cap); confirm before refusing this thread.
      const status = await this.readStatus();
      if (status?.active !== false) return null;
      this.recordHelperEnded(status);
    }
    if (!this.options.isSettingEnabled()) return null;
    if (!(await this.options.isInstalled())) return null;
    const status = await this.readStatus();
    if (!status) return null;
    if (this.owner === threadId) {
      if (status.active) {
        this.touchIdle();
        return null;
      }
      this.recordHelperEnded(status);
    }
    if (!status.screenLocked || status.active) return null;
    if (
      this.disposed ||
      revision !== this.revision ||
      threadRevision !== this.threadRevisions.get(threadId) ||
      !this.isEligible(threadId) ||
      !this.options.isSettingEnabled()
    )
      return null;
    return await this.begin(threadId);
  }

  private async begin(threadId: string): Promise<string | null> {
    const pending = { threadId, revoked: false };
    this.pending = pending;
    let result: ComputerUseLockedUseBeginResult;
    if (!HELPER_THREAD_ID_PATTERN.test(threadId)) {
      result = { outcome: "unavailable", stage: "invalid_thread_id" };
    } else {
      try {
        result = this.options.driver.lockedUseBegin
          ? await this.options.driver.lockedUseBegin({
              threadId,
              overlayTitle: LOCKED_USE_OVERLAY_TITLE,
              overlaySubtitle: LOCKED_USE_OVERLAY_SUBTITLE,
              dimDisplay: this.options.shouldDimDisplay?.() === true,
            })
          : { outcome: "unavailable", stage: "helper_unavailable" };
      } catch (error) {
        // A begin cut short by end/shutdown reports transport code `cancelled`.
        result = { outcome: "failed", stage: errorCode(error) ?? "host_error" };
      }
    }
    if (this.pending === pending) this.pending = null;
    this.audit({
      threadId,
      event: "begin",
      outcome: result.outcome,
      ...(result.stage ? { stage: result.stage } : {}),
    });
    if (result.outcome === "unlocked" || result.outcome === "already_active") {
      this.owner = threadId;
      if (
        pending.revoked ||
        this.disposed ||
        !this.isEligible(threadId) ||
        !this.options.isSettingEnabled()
      ) {
        // The turn ended or Computer Use was turned off while the helper was
        // unlocking: relock right away instead of leaving the Mac open.
        await this.endSerialized(threadId, this.disposed ? "shutdown" : "turn_end");
        return null;
      }
      this.touchIdle();
      return null;
    }
    const note = lockedUseNote(result);
    if (note && !pending.revoked && this.isEligible(threadId)) this.turnNotes.set(threadId, note);
    return note;
  }

  private async endSerialized(
    threadId: string,
    reason: ComputerUseLockedUseEndReason,
  ): Promise<void> {
    if (this.owner !== threadId) return;
    this.releaseOwner();
    const outcome = await this.callEnd(reason);
    this.audit({ threadId, event: "end", outcome, reason });
  }

  private async callEnd(reason: ComputerUseLockedUseEndReason): Promise<string> {
    try {
      if (!this.options.driver.lockedUseEnd) return "inactive";
      return (await this.options.driver.lockedUseEnd({ reason })).outcome;
    } catch (error) {
      // The helper answers `internal` when the relock itself failed.
      return errorCode(error) === "internal" ? "relock_failed" : "error";
    }
  }

  private async readStatus(): Promise<ComputerUseLockedUseStatus | null> {
    try {
      return (await this.options.driver.lockedUseStatus?.()) ?? null;
    } catch {
      return null;
    }
  }

  /** The helper already relocked (local input, session cap, helper restart). */
  private recordHelperEnded(status: ComputerUseLockedUseStatus): void {
    const owner = this.owner;
    if (!owner) return;
    this.releaseOwner();
    this.audit({
      threadId: owner,
      event: "end",
      outcome: "inactive",
      reason: status.lastEnd?.reason ?? "helper_ended",
    });
  }

  private touchIdle(): void {
    if (this.idleTimer !== null) this.clearTimer(this.idleTimer);
    const owner = this.owner;
    if (!owner) return;
    this.idleTimer = this.setTimer(() => {
      this.idleTimer = null;
      void this.end(owner, "idle");
    }, this.idleMs);
  }

  private releaseOwner(): void {
    this.owner = null;
    if (this.idleTimer !== null) this.clearTimer(this.idleTimer);
    this.idleTimer = null;
  }

  private audit(entry: Omit<Parameters<LockedUseAuditWriter>[0], "at">): void {
    this.options.audit({ at: this.now().toISOString(), ...entry });
  }
}
