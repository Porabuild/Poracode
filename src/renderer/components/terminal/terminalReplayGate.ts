import type { Terminal } from "@xterm/xterm";
import { installQueryReplySuppression } from "./terminalQuerySuppression";

/**
 * Gate between historical replay writes and live PTY traffic.
 *
 * `terminal.write()` parsing is asynchronous (the write buffer runs chunk by
 * chunk, time-sliced across macrotasks), so a flag "around" a replay write
 * cannot say which bytes the parser is currently inside. This gate makes the
 * phase explicit with two public-API mechanisms:
 *
 * 1. Reply scope — `installQueryReplySuppression` registers pass-through
 *    parser handlers that mark when the parser is inside a sequence family
 *    whose built-in can emit a PTY reply (DA1, DSR, XTVERSION, OSC color and
 *    clipboard, DECSET 1004 on a focused terminal, …). Built-ins still run,
 *    so state-setting sequences keep applying during replay.
 * 2. Barrier — a session starts with an empty write whose callback fires once
 *    every chunk queued *before* the replay (i.e. live output) has fully
 *    parsed with replies still enabled. Replay bytes queue behind it, and the
 *    replay chunk's own write callback ends the session and completes it, so
 *    buffered live output is only flushed after the replay has fully parsed.
 *
 * The surface's onData listener drops emissions only while BOTH hold: a
 * replay session owns the parser AND a reply scope is pending. Live queries
 * queued ahead of the replay parse before the barrier with the session
 * unowned; live output flushed after completion parses with the session
 * ended — both stay allowed. User keyboard/paste reach onData from their own
 * macrotasks while no scope can be pending, and stdin is never disabled.
 */

interface ReplaySession {
  /** Superseded by a newer session or cancelled by a PTY reset. */
  cancelled: boolean;
  /** The replay chunk has been queued for parsing (or the replay is empty). */
  replayHandled: boolean;
  /** Runs after a cancelled session's queued replay has fully parsed. */
  cleanupAfterParse?: () => void;
}

export interface ReplaySessionOptions {
  /** Runs inside the barrier, before the replay bytes are queued (e.g. reset). */
  before?: (() => void) | undefined;
  /** Runs once the replay has fully parsed; stale sessions never run it. */
  complete: () => void;
}

export class TerminalReplayGate {
  private readonly terminal: Terminal;
  private readonly suppression: {
    dispose(): void;
    hasPendingReplyScope(): boolean;
  };
  /** Session allowed to proceed past its barrier. */
  private current: ReplaySession | null = null;
  /** Session whose replay bytes the parser is (or is about to be) inside of. */
  private suppressOwner: ReplaySession | null = null;

  constructor(terminal: Terminal) {
    this.terminal = terminal;
    this.suppression = installQueryReplySuppression(terminal, () => this.suppressing);
  }

  /** True while replay bytes are being parsed; consulted by the suppression handlers. */
  get suppressing(): boolean {
    return this.suppressOwner !== null;
  }

  /**
   * True when an onData emission must not reach the PTY: a reply-capable
   * sequence is being parsed inside an owned replay session. The session ends
   * before the buffered live output is flushed, so those bytes always pass.
   */
  get isDroppingReplies(): boolean {
    return this.suppressing && this.suppression.hasPendingReplyScope();
  }

  /**
   * Queue `bytes` (possibly empty) as historical replay: live chunks queued
   * beforehand drain with replies enabled, `bytes` parse with reply scopes
   * marked (their report emissions are dropped at onData), and `complete`
   * runs once the replay has fully parsed — before anything queued afterwards
   * (the buffered live output).
   */
  begin(bytes: string, opts: ReplaySessionOptions): void {
    const session: ReplaySession = { cancelled: false, replayHandled: false };
    if (this.current) {
      // Superseded by a newer hydration. Its replay text (if already queued)
      // is wiped by the new session's `before`, and its completion never runs.
      this.current.cancelled = true;
    }
    this.current = session;
    // Empty-write barrier: xterm's write buffer is FIFO and fires this
    // callback once every previously queued chunk has fully parsed.
    this.terminal.write("", () => {
      if (this.current !== session) {
        return;
      }
      this.suppressOwner = session;
      opts.before?.();
      session.replayHandled = true;
      if (bytes.length > 0) {
        this.terminal.write(bytes, () => this.finish(session, opts.complete));
      } else {
        this.finish(session, opts.complete);
      }
    });
  }

  /**
   * Drop the in-flight replay (PTY reset). `cleanupAfterParse` runs after an
   * already-queued replay chunk has fully parsed — e.g. to wipe its now-stale
   * bytes from the fresh buffer — and sits ahead of anything queued later.
   */
  cancel(cleanupAfterParse?: () => void): void {
    const session = this.current;
    if (!session) {
      return;
    }
    this.current = null;
    session.cancelled = true;
    if (session.replayHandled && cleanupAfterParse) {
      session.cleanupAfterParse = cleanupAfterParse;
    }
  }

  private finish(session: ReplaySession, complete: () => void): void {
    // Release suppression even on stale finishes: a newer session re-arms it
    // from its own barrier, which parses strictly later (FIFO), so nothing in
    // between can leak a reply.
    if (this.suppressOwner === session) {
      this.suppressOwner = null;
    }
    if (session.cancelled) {
      session.cleanupAfterParse?.();
      return;
    }
    if (this.current === session) {
      this.current = null;
      complete();
    }
  }

  dispose(): void {
    this.suppression.dispose();
  }
}
