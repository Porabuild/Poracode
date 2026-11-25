/**
 * Antigravity ACP prompt-hold detection.
 *
 * `agy_acp_server` does not resolve `session/prompt` while background tasks
 * are alive: its prompt handler drains the SDK step stream, which only ends
 * once the trajectory reaches `STATE_FULLY_IDLE`. After the model's final
 * message the trajectory sits in `STATE_WAITING_FOR_TASKS` until every
 * background task exits - indefinitely for a task that never does (a dev
 * server, a launched app). `session/cancel` does not release the wait either;
 * it only flips the eventual stop reason to `cancelled` once the tasks end.
 * The ACP stream itself carries nothing at that boundary.
 *
 * Two detectors, because the server moved its only boundary signal:
 *
 * 1. Transcript detector (`AntigravityTurnHoldDetector`, primary). The
 *    harness writes the waiting state to the parent transcript: the latest
 *    step is a finished, text-only `PLANNER_RESPONSE` while an earlier step
 *    is still `RUNNING` (recorded on agy_acp_server 1.5.2, 2026-11-25).
 *    Across 102 real transcripts a text-only planner reply was never followed
 *    by another, so that step marks the end of the reply. The detector checks
 *    only while a tool call is open on the wire and requires the shape to
 *    persist for `settleMs`, which keeps a reply that is about to resolve
 *    normally (the trajectory goes fully idle within milliseconds) from being
 *    held.
 * 2. Stderr parser (`parseAntigravityAcpTurnSignal`). The harness WebSocket
 *    diagnostic below was `logging.info` in agy_acp_server 1.0.0 and is
 *    `logging.debug` from 1.4.1 on, while the server's default verbosity is
 *    info: at default settings the line never reaches stderr (verified live on
 *    1.5.2: 0 lines in 45 s, present with `--debug`). The parser stays because
 *    the line is exact when it does appear. `--debug` is not a fix: it logs
 *    request headers including an API key, and about 380 KB per process start.
 *
 *    I0831 14:08:16.659332 51136 local_connection.py:521] RAW WS MSG:
 *    {"trajectoryStateUpdate":{"trajectoryId":"…", "state":"STATE_WAITING_FOR_TASKS"}, …}
 *
 * Both reach the shared session's background-wait hold: the runtime turn
 * completes and the thread goes idle while the held prompt resolves later, out
 * of band. If neither fires, behavior degrades to the turn staying working
 * until the prompt resolves.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk/unstable";
import type { AcpExternalSessionUpdateSource, AcpStructuredSession } from "../acp/session";
import type { TranscriptStep } from "./acpSubagentTranscripts";

const WAITING_FOR_TASKS_RE =
  /"trajectoryStateUpdate"\s*:\s*\{[^}]*"state"\s*:\s*"STATE_WAITING_FOR_TASKS"/;

export function parseAntigravityAcpTurnSignal(line: string): "background-wait" | undefined {
  if (!line.includes("STATE_WAITING_FOR_TASKS")) return undefined;
  return WAITING_FOR_TASKS_RE.test(line) ? "background-wait" : undefined;
}

/** How often an open tool call prompts a transcript check. */
const DEFAULT_HOLD_POLL_INTERVAL_MS = 500;
/** How long the waiting shape must persist, prompt still open, before the hold. */
const DEFAULT_HOLD_SETTLE_MS = 1500;

/**
 * The parent transcript while `agy_acp_server` waits on background tasks: the
 * latest step is a finished, text-only planner reply and an earlier step is
 * still `RUNNING`. A planner step that still calls tools, or any later step
 * (a task result, a report), means the reply is not over.
 */
export function isAntigravityBackgroundWaitTranscript(steps: readonly TranscriptStep[]): boolean {
  const last = steps.at(-1);
  if (!last || last.type !== "PLANNER_RESPONSE" || last.status !== "DONE") return false;
  if (last.tool_calls && last.tool_calls.length > 0) return false;
  if (typeof last.content !== "string" || last.content.trim().length === 0) return false;
  return steps.slice(0, -1).some((step) => step.status === "RUNNING");
}

/** Reads the parent transcript for the detector; the subagent bridge implements it. */
export interface AntigravityParentTranscriptReader {
  /** Parsed parent transcript, or undefined while it cannot be read. */
  readSteps(): Promise<TranscriptStep[] | undefined>;
}

export interface AntigravityTurnHoldOptions {
  pollIntervalMs?: number;
  /** See {@link DEFAULT_HOLD_SETTLE_MS}. */
  settleMs?: number;
}

function isOpenToolCallStatus(status: string | null | undefined): boolean {
  return status == null || status === "pending" || status === "in_progress";
}

/**
 * Watches the wire and the parent transcript for the background wait.
 *
 * It never claims a notification. While a prompt turn is active and at least
 * one tool call is open on the wire, it checks the parent transcript every
 * `pollIntervalMs` and holds the turn once the waiting shape has persisted for
 * `settleMs`. At most one hold attempt per turn.
 */
export class AntigravityTurnHoldDetector implements AcpExternalSessionUpdateSource {
  private readonly pollIntervalMs: number;
  private readonly settleMs: number;
  private readonly openToolCalls = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private turnActive = false;
  private held = false;
  private waitingSince: number | undefined;
  private checkInFlight = false;
  /** Bumped whenever the detector stops, so an in-flight check cannot fire late. */
  private generation = 0;

  constructor(
    private readonly hold: () => void,
    private readonly reader: AntigravityParentTranscriptReader,
    options: AntigravityTurnHoldOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_HOLD_POLL_INTERVAL_MS;
    this.settleMs = options.settleMs ?? DEFAULT_HOLD_SETTLE_MS;
  }

  onSessionUpdate(notification: SessionNotification): void {
    const { update } = notification;
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      const toolCallId = update.toolCallId;
      if (isOpenToolCallStatus(update.status)) {
        this.openToolCalls.add(toolCallId);
      } else {
        this.openToolCalls.delete(toolCallId);
        // A closed last tool must not inherit the previous tool's settle clock.
        this.waitingSince = undefined;
      }
    }
    this.syncPolling();
  }

  onTurnStart(): void {
    this.stop();
    this.turnActive = true;
  }

  onTurnEnd(): void {
    this.stop();
  }

  dispose(): void {
    this.stop();
  }

  private stop(): void {
    this.generation += 1;
    this.turnActive = false;
    this.held = false;
    this.waitingSince = undefined;
    this.openToolCalls.clear();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private syncPolling(): void {
    if (
      this.timer ||
      this.checkInFlight ||
      !this.turnActive ||
      this.held ||
      this.openToolCalls.size === 0
    )
      return;
    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (generation !== this.generation || !this.turnActive || this.held) return;
      void this.check(generation);
    }, this.pollIntervalMs);
  }

  private async check(generation: number): Promise<void> {
    if (this.checkInFlight) return;
    this.checkInFlight = true;
    let waiting = false;
    try {
      const steps = await this.reader.readSteps();
      waiting = steps ? isAntigravityBackgroundWaitTranscript(steps) : false;
    } catch {
      waiting = false;
    }
    this.checkInFlight = false;
    if (generation !== this.generation) {
      // A new turn opened while the old read was in flight; re-arm the timer
      // for the current generation instead of waiting for another wire event.
      this.syncPolling();
      return;
    }
    if (!this.turnActive || this.held) return;
    // The tool that prompted the read may have closed while it was in flight.
    if (this.openToolCalls.size === 0) {
      this.waitingSince = undefined;
      return;
    }
    if (!waiting) {
      this.waitingSince = undefined;
      this.syncPolling();
      return;
    }
    const now = Date.now();
    this.waitingSince ??= now;
    if (now - this.waitingSince < this.settleMs) {
      this.syncPolling();
      return;
    }
    this.held = true;
    this.hold();
  }
}

/** Attach the transcript detector to a session; the hold is the shared seam. */
export function attachAntigravityTurnHold(
  session: AcpStructuredSession,
  reader: AntigravityParentTranscriptReader,
  options?: AntigravityTurnHoldOptions,
): AntigravityTurnHoldDetector {
  const detector = new AntigravityTurnHoldDetector(
    () => session.holdTurnForBackgroundWork(),
    reader,
    options,
  );
  session.attachExternalSessionUpdateSource(detector);
  return detector;
}
