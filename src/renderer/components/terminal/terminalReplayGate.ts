import type { Terminal } from "@xterm/xterm";
import { installQueryReplySuppression } from "./terminalQuerySuppression";

// eslint-disable-next-line no-control-regex -- Kitty response frames contain protocol control bytes.
const KITTY_GRAPHICS_REPLY = /^\x1b_Gi=\d+(?:,p=\d+)?;(?:OK|E[A-Z]+:[^\x1b]*)\x1b\\$/;

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

/**
 * One chronological span of historical output and the PTY width it was
 * emitted at. `columns` is the recorded width; when omitted the span parses
 * at the viewport width captured when the session's barrier fired, even when
 * it follows a span with a known width.
 */
export interface TerminalReplaySegment {
  /** Raw output bytes emitted while the PTY was `columns` columns wide. */
  data: string;
  /** Recorded PTY width for this span, when known. */
  columns?: number;
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
  /** True while a geometry replay has the terminal resized to recorded widths. */
  private geometryReplay = false;

  constructor(terminal: Terminal) {
    this.terminal = terminal;
    this.suppression = installQueryReplySuppression(terminal, () => this.suppressing);
  }

  /** True while replay bytes are being parsed; consulted by the suppression handlers. */
  get suppressing(): boolean {
    return this.suppressOwner !== null;
  }

  /**
   * True while a `beginSegments` replay is writing spans at their recorded
   * PTY widths — the terminal is temporarily resized away from the viewport.
   * Surfaces should defer fit and backing-PTY resize callbacks until it
   * clears; the viewport width is always restored before it does.
   */
  get replayingAtRecordedColumns(): boolean {
    return this.geometryReplay;
  }

  /**
   * True when an onData emission must not reach the PTY: a reply-capable
   * sequence is being parsed inside an owned replay session. The session ends
   * before the buffered live output is flushed, so those bytes always pass.
   */
  shouldDropReply(data: string): boolean {
    // Kitty image placement can reply after async decoding, beyond the parser
    // handler's synchronous reply scope. Keyboard input remains enabled.
    return (
      this.suppressing &&
      (this.suppression.hasPendingReplyScope() || KITTY_GRAPHICS_REPLY.test(data))
    );
  }

  /**
   * Queue `bytes` (possibly empty) as historical replay: live chunks queued
   * beforehand drain with replies enabled, `bytes` parse with reply scopes
   * marked (their report emissions are dropped at onData), and `complete`
   * runs once the replay has fully parsed — before anything queued afterwards
   * (the buffered live output).
   */
  begin(bytes: string, opts: ReplaySessionOptions): void {
    const session = this.armSession();
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
   * Queue chronological replay spans, each parsed at its recorded PTY width.
   * Same barrier and suppression semantics as `begin`, but after `before`
   * runs the viewport width is captured and every non-empty span is written
   * sequentially — resizing to `columns` (or the captured width when
   * omitted) only when it differs — using each raw write's parse callback to
   * advance. Once the last span has parsed, the initial columns are restored
   * with the current rows before `complete` or queued cleanup runs, and
   * `replayingAtRecordedColumns` clears. A superseded or cancelled session
   * stops before its next span, restores the width, and never completes.
   */
  beginSegments(segments: readonly TerminalReplaySegment[], opts: ReplaySessionOptions): void {
    const session = this.armSession();
    this.terminal.write("", () => {
      if (this.current !== session) {
        return;
      }
      this.suppressOwner = session;
      opts.before?.();
      session.replayHandled = true;
      const pending = segments.filter((segment) => segment.data.length > 0);
      if (pending.length === 0) {
        this.finish(session, opts.complete);
        return;
      }
      // Capture the viewport width only after the barrier and `before`, so
      // spans without a recorded width replay at the width live output saw.
      const initialCols = this.terminal.cols;
      this.geometryReplay = true;
      let index = 0;
      const advance = () => {
        if (this.current === session && index < pending.length) {
          const segment = pending[index++]!;
          const columns = segment.columns ?? initialCols;
          if (this.terminal.cols !== columns) {
            this.terminal.resize(columns, this.terminal.rows);
          }
          this.terminal.write(segment.data, advance);
          return;
        }
        // Done or superseded/cancelled mid-flight: pending spans are never
        // written, and the viewport width is restored before the still-current
        // completion or the cancelled session's queued cleanup runs.
        if (this.terminal.cols !== initialCols) {
          this.terminal.resize(initialCols, this.terminal.rows);
        }
        this.geometryReplay = false;
        this.finish(session, opts.complete);
      };
      advance();
    });
  }

  /**
   * Install `session` as the replay allowed past its barrier, superseding
   * any in-flight session (whose queued replay still parses, suppressed, but
   * never completes).
   */
  private armSession(): ReplaySession {
    const session: ReplaySession = { cancelled: false, replayHandled: false };
    if (this.current) {
      // Superseded by a newer hydration. Its replay text (if already queued)
      // is wiped by the new session's `before`, and its completion never runs.
      this.current.cancelled = true;
    }
    this.current = session;
    return session;
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
