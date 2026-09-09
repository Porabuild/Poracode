import type { RemoteTerminalWatchBaselineChunk, RemoteTerminalWatchResultReady } from "./protocol";
import {
  CLIENT_UNAVAILABLE_RETRYABLE,
  TerminalWatchSession,
  type TerminalWatchDeps,
  type TerminalWatchHost,
} from "./terminalFeedWatch";

/**
 * Cursor-sync v2 watch session (chunked baseline + resume + ACK credit
 * window). Extends the v1 {@link TerminalWatchSession} so every lifecycle,
 * reentrancy, buffering, and bounded-recovery rule is reused verbatim —
 * v2 changes only how the baseline *travels* and what the attempt requests:
 *
 * - **Resume**: at `begin()` time the retained active cache position (when it
 *   has a durable generation) is presented as `resume`; the server serves the
 *   uncovered suffix, an "up to date" empty completion chunk, or a full
 *   window when it cannot honor the position.
 * - **Chunk assembly**: `terminal-watch-baseline-chunk` messages assemble
 *   into exactly one authoritative snapshot at completion — one `onSnapshot`,
 *   identical to v1's listener contract. Duplicate chunk indices are ignored;
 *   contiguity violations, mid-stream generation changes, or assembly
 *   overflow discard the assembly and run the existing bounded resync.
 * - **Idle-based deadline**: `baselineTimeoutMs` (same value as v1) becomes a
 *   per-stream inactivity budget — every chunk for the current watchId resets
 *   it — so a slow-but-progressing baseline is never retired mid-transfer.
 * - **ACKs**: every chunk is acknowledged (cumulative `throughCursor`),
 *   releasing the server's credit window.
 * - **Explicit downgrade**: a non-retryable `unavailable` with
 *   `reason: "unsupported-version"` stops this session; the feed swaps in a
 *   v1 session on the same connection (no persisted state).
 */

interface BaselineAssembly {
  readonly generation: string | null;
  /** Absolute cursor where the assembled range starts. */
  readonly fromCursor: number;
  readonly resumeServed: boolean;
  /** Index the next chunk must carry (strictly ordered, no gaps). */
  expectedIndex: number;
  toCursor: number;
  parts: string[];
  units: number;
}

export const TERMINAL_FEED_V2_CHUNK_BYTES = 4096;
export const TERMINAL_FEED_V2_WINDOW_BYTES = 8192;

/** v2 request options carried alongside the watch, per RESUME-V2-DESIGN §4.1. */
export interface TerminalWatchV2RequestOptions {
  readonly maxChunkBytes: number;
  readonly maxWindowBytes: number;
  readonly resume?: { readonly generation: string; readonly cursor: number };
}

export interface TerminalWatchV2Host extends TerminalWatchHost {
  /** Send `terminal-watch` with cursorSync v2 framing for this attempt. */
  readonly sendWatchV2: (watchId: string, options: TerminalWatchV2RequestOptions) => void;
}

export interface TerminalWatchV2Deps extends Omit<TerminalWatchDeps, "host"> {
  readonly host: TerminalWatchV2Host;
  /** Send `terminal-watch-baseline-ack` for the current v2 watch. */
  readonly sendAck: (watchId: string, throughCursor: number) => void;
}

export class TerminalWatchSessionV2 extends TerminalWatchSession {
  private readonly sendAck: TerminalWatchV2Deps["sendAck"];
  /** Narrowed host: v2 sessions always run with a v2-capable wire sender. */
  protected override readonly host: TerminalWatchV2Host;
  private assembly: BaselineAssembly | null = null;

  constructor(deps: TerminalWatchV2Deps) {
    super(deps);
    this.host = deps.host;
    this.sendAck = deps.sendAck;
  }

  /**
   * The authoritative assembly completion — installed through the inherited
   * v1 result path (snapshot install, buffered-frame flush, progress
   * accounting), so listeners observe exactly the same contract as v1.
   */
  handleChunk(watchId: string, chunk: RemoteTerminalWatchBaselineChunk): void {
    if (this.stopped || watchId !== this.currentWatchId) return;
    // Chunks only ever arrive after the attempt began; reset the deadline on
    // every one of them — "10 s without progress", not "whole transfer in 10 s".
    this.resetBaselineDeadline(watchId);

    const assembly = this.assembly;
    if (!assembly) {
      this.assembly = {
        generation: chunk.generation,
        fromCursor: chunk.fromCursor,
        resumeServed: chunk.resumeServed,
        expectedIndex: 1,
        toCursor: chunk.toCursor,
        parts: chunk.data === "" ? [] : [chunk.data],
        units: chunk.data.length,
      };
    } else if (
      chunk.chunkIndex !== assembly.expectedIndex ||
      chunk.generation !== assembly.generation ||
      chunk.fromCursor !== assembly.toCursor ||
      chunk.resumeServed !== assembly.resumeServed
    ) {
      // Duplicate index ⇒ ignore (an already-counted index); anything else —
      // gap, overlap, mid-stream generation change — discards the assembly.
      if (chunk.chunkIndex <= assembly.expectedIndex - 1) return;
      this.assembly = null;
      this.resync();
      return;
    } else {
      assembly.expectedIndex += 1;
      assembly.toCursor = chunk.toCursor;
      if (chunk.data !== "") assembly.parts.push(chunk.data);
      assembly.units += chunk.data.length;
    }

    this.sendAck(watchId, chunk.toCursor);

    if (chunk.chunkIndex < chunk.chunkCount - 1) {
      if (this.assembly && this.assembly.units > this.limits.cacheUnits) {
        // Live production outran the client cache while the baseline was in
        // flight — the bounded resnapshot converges on the newest window.
        this.assembly = null;
        this.resync();
      }
      return;
    }
    const done = this.assembly;
    this.assembly = null;
    if (!done) return;
    const ready: RemoteTerminalWatchResultReady = {
      status: "ready",
      generation: done.generation,
      fromCursor: done.fromCursor,
      toCursor: done.toCursor,
      data: done.parts.join(""),
      processState: chunk.processState,
      terminalSize: chunk.terminalSize,
    };
    this.handleResult(watchId, ready);
  }

  /** Assembly state lives only for the current attempt. */
  protected override clearPending(): void {
    super.clearPending();
    this.assembly = null;
  }

  /**
   * v2 request framing: version 2, the negotiated chunk/window bounds, and
   * the retained cache position (only when it carries a durable generation —
   * a null-generation cache is replace-only and can never resume).
   */
  protected override sendCurrentWatch(watchId: string): void {
    const snapshot = this.currentSnapshot();
    const resume =
      snapshot && snapshot.generation !== null
        ? { generation: snapshot.generation, cursor: snapshot.toCursor }
        : undefined;
    this.host.sendWatchV2(watchId, {
      maxChunkBytes: TERMINAL_FEED_V2_CHUNK_BYTES,
      maxWindowBytes: TERMINAL_FEED_V2_WINDOW_BYTES,
      ...(resume ? { resume } : {}),
    });
  }

  /** Every chunk resets the attempt deadline (idle-based, not whole-transfer). */
  private resetBaselineDeadline(watchId: string): void {
    if (this.currentWatchId !== watchId || !this.cancelBaselineTimer) return;
    this.cancelBaselineTimer?.();
    this.cancelBaselineTimer = this.schedule(this.retry.baselineTimeoutMs, () => {
      if (this.currentWatchId !== watchId || !this.cancelBaselineTimer) return;
      this.cancelBaselineTimer = null;
      this.currentWatchId = null; // retire before the callback sees the error
      this.assembly = null;
      // Client-side synthesized error: only ever "unavailable".
      this.host.deliverWatchError(CLIENT_UNAVAILABLE_RETRYABLE);
      if (this.canScheduleRetry()) this.scheduleRetry();
    });
  }
}
