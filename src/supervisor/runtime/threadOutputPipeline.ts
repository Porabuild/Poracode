import { setTimeout as sleep } from "node:timers/promises";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import type { ThreadAttention, ThreadStatus, ThreadStatusSource } from "@/shared/contracts";
import { extractOscEventsFromPtyStream } from "@/shared/osc";
import { TranscriptBuffer } from "@/shared/transcriptBuffer";
import { isThreadConfigEqual } from "@/shared/contracts";
import type { TerminalStatusHint } from "../agents/base";
import { BufferedLogWriter } from "./bufferedLogWriter";
import type {
  SessionRuntime,
  ShellSessionRuntime,
  ThreadOutputPipelineCallbacks,
} from "./sessionTypes";
import { writeSubmittedPrompt } from "./threadSessionManager";

const STATUS_STABILIZATION_DELAY: Partial<Record<ThreadStatus, number>> = {
  working: 150,
  idle: 300,
};

const UNCORROBORATED_EXTRA_DELAY: Partial<Record<ThreadStatus, number>> = {
  idle: 200,
};

const DEFAULT_WORKING_SILENCE_TIMEOUT = 2000;
const CLI_HOOK_FIRST_EVENT_GRACE_MS = 600;

function isPoracodeOscDebugEnabled(): boolean {
  const v = process.env.PORACODE_DEBUG_OSC;
  return v === "1" || v === "true" || v === "yes";
}

export interface ThreadOutputPipelineOptions extends ThreadOutputPipelineCallbacks {
  emit(event: import("@/shared/ipc").SupervisorEvent): void;
  isDev: boolean;
  logWriter: BufferedLogWriter;
  resolveLogPath(threadId: string): string;
  resolveHintLogPath(threadId: string): string;
  /**
   * Dev override: when true, report `terminal_parse` for terminal threads even
   * when hook env was injected, so the "Enhanced (Hooks)" badge flips back to
   * "Basic (CLI)" while the `disableCliHookPlugin` toggle is on. Returns the
   * current value on each call so flipping the switch in Settings reflects in
   * the next `thread-state` emit without restart.
   */
  readDisableCliHookPlugin(): boolean;
}

export function resolveThreadStatusSource(
  session: SessionRuntime,
  disableCliHookPlugin: boolean = false,
): ThreadStatusSource {
  const presentationMode =
    session.presentationMode ?? session.adapter.capabilities.presentationMode;
  if (presentationMode !== "terminal" || session.structuredSession) {
    return "server";
  }
  if (disableCliHookPlugin) {
    return "terminal_parse";
  }
  if (session.hasCliHookPluginActivity) {
    return "cli_hook";
  }
  if (session.cliHookTerminalFallbackActive) {
    return "terminal_parse";
  }
  if (session.cliHookEnvInjected) {
    return "cli_hook";
  }
  return "terminal_parse";
}

export class ThreadOutputPipeline {
  constructor(private readonly options: ThreadOutputPipelineOptions) {}

  private cliHookOwnsStatus(session: SessionRuntime, disableCliHookPlugin?: boolean): boolean {
    if (session.adapter.partialL1) {
      return false;
    }
    const presentationMode =
      session.presentationMode ?? session.adapter.capabilities.presentationMode;
    return (
      presentationMode === "terminal" &&
      !session.structuredSession &&
      !(disableCliHookPlugin ?? this.options.readDisableCliHookPlugin()) &&
      session.hasCliHookPluginActivity === true
    );
  }

  private shouldSuppressLaunchWorkingHint(
    session: SessionRuntime,
    hint: TerminalStatusHint,
  ): boolean {
    if (session.status !== "launching" || hint.status !== "working") {
      return false;
    }
    if (session.hasCliHookPluginActivity) {
      return false;
    }
    return (
      session.launchPrompt.trim().length === 0 &&
      !session.pendingLaunchPrompt &&
      !session.pendingTerminalPrompt
    );
  }

  clearSessionTimers(
    session: SessionRuntime,
    options: { preserveCliHookTerminalFallback?: boolean } = {},
  ): void {
    if (session.pendingStatusHint) {
      clearTimeout(session.pendingStatusHint.timer);
      session.pendingStatusHint = undefined;
    }
    if (!options.preserveCliHookTerminalFallback) {
      this.clearPendingCliHookTerminalFallback(session);
      session.cliHookTerminalFallbackActive = false;
    }
    if (session.workingSilenceTimer) {
      clearTimeout(session.workingSilenceTimer);
      session.workingSilenceTimer = undefined;
    }
    if (session.userInterruptRecoveryTimer) {
      clearTimeout(session.userInterruptRecoveryTimer);
      session.userInterruptRecoveryTimer = undefined;
    }
    if (session.structuredInterruptWatchdog) {
      clearTimeout(session.structuredInterruptWatchdog);
      session.structuredInterruptWatchdog = undefined;
    }
  }

  getLatestTerminalStatusHint(session: SessionRuntime): TerminalStatusHint | null {
    const presentationMode =
      session.presentationMode ?? session.adapter.capabilities.presentationMode;
    if (
      this.cliHookOwnsStatus(session) ||
      presentationMode !== "terminal" ||
      !session.adapter.detectTerminalStatus ||
      session.lastStrippedPtyChunk.length === 0
    ) {
      return null;
    }
    return session.adapter.detectTerminalStatus(session.lastStrippedPtyChunk);
  }

  readTerminalScrollback(session: SessionRuntime | ShellSessionRuntime | undefined): string {
    if (!session?.outputTranscript) {
      return "";
    }
    return session.outputTranscript.readTail(100_000);
  }

  emitState(
    session: SessionRuntime,
    errorMessage?: string,
    options: { forceCloseActiveTurn?: boolean } = {},
  ): void {
    this.options.emit({
      type: "thread-state",
      threadId: session.threadId,
      status: session.status,
      attention: session.attention,
      config: session.config,
      ...(session.launchConfig ? { launchConfig: session.launchConfig } : {}),
      ...(session.sessionRef ? { sessionRef: session.sessionRef } : {}),
      ...(session.slashCommands ? { slashCommands: session.slashCommands } : {}),
      canResumeWithConfig: session.canResumeWithConfig,
      threadStatusSource: resolveThreadStatusSource(
        session,
        this.options.readDisableCliHookPlugin(),
      ),
      ...(errorMessage ? { errorMessage } : {}),
      ...(options.forceCloseActiveTurn ? { forceCloseActiveTurn: true } : {}),
    });
  }

  /**
   * A routed hook event, including bookkeeping-only events, means L1 is real.
   * Cancel the pre-first-hook L2 fallback probe and restore the source badge if
   * this session had already demoted itself to terminal parsing.
   */
  noteCliHookPluginActivity(session: SessionRuntime): void {
    const wasTerminalFallbackActive = session.cliHookTerminalFallbackActive === true;
    this.clearPendingCliHookTerminalFallback(session);
    session.cliHookTerminalFallbackActive = false;
    if (wasTerminalFallbackActive) {
      this.emitState(session);
    }
  }

  updateState(
    session: SessionRuntime,
    status: ThreadStatus,
    attention: ThreadAttention,
    errorMessage?: string,
    options: { forceCloseActiveTurn?: boolean } = {},
  ): void {
    if (
      session.status === status &&
      session.attention === attention &&
      errorMessage === undefined
    ) {
      return;
    }

    this.clearSessionTimers(session, { preserveCliHookTerminalFallback: true });
    if (session.workingSilenceTimer && status !== "working") {
      clearTimeout(session.workingSilenceTimer);
      session.workingSilenceTimer = undefined;
    }

    session.status = status;
    session.attention = attention;
    session.lastStatusChangeAt = Date.now();
    this.emitState(session, errorMessage, options);
  }

  /**
   * Apply a CLI hook plugin state transition. Hook events are treated as 100%
   * authoritative — we bypass L2 stabilization timers and emit immediately.
   * Once a routed hook has posted, L2 does not run, so idle-gated terminal
   * writes are flushed here on hook idle.
   */
  applyCliHookPluginState(
    session: SessionRuntime,
    change: { status: ThreadStatus; attention: ThreadAttention },
  ): void {
    if (isPoracodeOscDebugEnabled()) {
      console.log(
        `[poracode-osc] L1 hook thread=${session.threadId} kind=${session.agentKind} ` +
          `-> status=${change.status} attention=${change.attention} (Hooks own status; not OSC)`,
      );
    }
    // A real hook event beat the user-interrupt fallback — cancel it.
    if (session.userInterruptRecoveryTimer) {
      clearTimeout(session.userInterruptRecoveryTimer);
      session.userInterruptRecoveryTimer = undefined;
    }
    const wasTerminalFallbackActive = session.cliHookTerminalFallbackActive === true;
    this.clearPendingCliHookTerminalFallback(session);
    session.cliHookTerminalFallbackActive = false;
    const statusChanged =
      session.status !== change.status || session.attention !== change.attention;
    this.updateState(session, change.status, change.attention);
    if (wasTerminalFallbackActive && !statusChanged) {
      this.emitState(session);
    }
    if (change.status === "idle") {
      this.flushPendingTerminalWritesIfIdle(session);
    }
    if (
      statusChanged &&
      session.adapter.discoverSessionRef &&
      !session.sessionRef &&
      !session.sessionRefDiscoveryStarted &&
      !session.pendingTerminalPrompt
    ) {
      session.sessionRefDiscoveryStarted = true;
      this.options.onStartSessionRefDiscovery(session);
    }
  }

  private flushPendingTerminalWritesIfIdle(session: SessionRuntime): void {
    if (!session.pty) {
      return;
    }
    const pty = session.pty;
    if (session.pendingTerminalPreInputs?.length && !session.pendingTerminalWriteInFlight) {
      const chunks = session.pendingTerminalPreInputs.shift()!;
      if (!session.pendingTerminalPreInputs.length) {
        session.pendingTerminalPreInputs = undefined;
      }
      session.pendingTerminalWriteInFlight = true;
      void sleep(500)
        .then(() => writeSubmittedPrompt(pty, chunks, session.projectLocation))
        .then(() => {
          session.pendingTerminalWriteInFlight = false;
        });
      return;
    }
    if (session.pendingTerminalPrompt && !session.pendingTerminalWriteInFlight) {
      const prompt = session.pendingTerminalPrompt;
      const segments = session.pendingTerminalSegments;
      session.pendingTerminalPrompt = undefined;
      session.pendingTerminalSegments = undefined;
      void sleep(500).then(() =>
        writeSubmittedPrompt(
          pty,
          session.adapter.buildDirectInput?.(
            prompt,
            segments,
            session.config,
            session.projectLocation,
          ) ?? [prompt, "\r"],
          session.projectLocation,
        ),
      );
    }
  }

  handlePtyData(session: SessionRuntime, data: string): void {
    session.outputLength += data.length;
    session.outputTranscript ??= new TranscriptBuffer(200_000);
    session.outputTranscript.append(data);

    if (this.options.isDev) {
      this.options.logWriter.append(this.options.resolveLogPath(session.threadId), data);
    }

    this.options.emit({
      type: "thread-output",
      threadId: session.threadId,
      data,
      outputLength: session.outputLength,
    });

    const ptyCarryIn = session.ptyOscCarry;
    const {
      carryOut,
      notifications,
      titles,
      shell,
      cleaned: dataAfterOsc,
    } = extractOscEventsFromPtyStream(ptyCarryIn, data);
    session.ptyOscCarry = carryOut;

    const disableCliHookPlugin = this.options.readDisableCliHookPlugin();
    const hookOwnsStatus = this.cliHookOwnsStatus(session, disableCliHookPlugin);

    const applyOscHint = (hint: TerminalStatusHint): void => {
      if (this.shouldSuppressLaunchWorkingHint(session, hint)) {
        return;
      }
      this.armCliHookTerminalFallback(session);
      if (hookOwnsStatus) {
        return;
      }
      this.updateState(session, hint.status, hint.attention);
    };

    for (const notification of notifications) {
      this.options.emit({
        type: "thread-osc-notification",
        threadId: session.threadId,
        title: notification.title,
        body: notification.body,
      });

      const oscHint = session.adapter.handleOscNotification?.(notification);
      if (isPoracodeOscDebugEnabled()) {
        const j = (s: string, max: number) =>
          s.length <= max ? JSON.stringify(s) : `${JSON.stringify(s.slice(0, max))}…`;
        const hintText = oscHint
          ? `hint=${oscHint.status}/${oscHint.attention} corroborated=${String(oscHint.corroborated)}`
          : "hint=(null — event not mapped to Poracode status)";
        console.log(
          `[poracode-osc] PTY thread=${session.threadId} kind=${session.agentKind} ` +
            `code=${notification.code} title=${j(notification.title, 64)} body=${j(notification.body, 200)} ` +
            `${hintText}`,
        );
      }
      if (oscHint) {
        applyOscHint(oscHint);
      }
    }

    for (const title of titles) {
      const titleHint = session.adapter.handleOscTitle?.(title);
      if (isPoracodeOscDebugEnabled()) {
        const j = (s: string, max: number) =>
          s.length <= max ? JSON.stringify(s) : `${JSON.stringify(s.slice(0, max))}…`;
        const hintText = titleHint
          ? `hint=${titleHint.status}/${titleHint.attention}`
          : "hint=(null — title not mapped)";
        console.log(
          `[poracode-osc] PTY thread=${session.threadId} kind=${session.agentKind} ` +
            `titleCode=${title.code} text=${j(title.text, 160)} ${hintText}`,
        );
      }
      if (titleHint) {
        applyOscHint(titleHint);
      }
    }

    for (const shellEvent of shell) {
      this.options.emit({
        type: "thread-osc-shell",
        threadId: session.threadId,
        event: shellEvent,
      });

      const shellHint = session.adapter.handleOscShellEvent?.(shellEvent);
      if (isPoracodeOscDebugEnabled()) {
        const summary =
          shellEvent.kind === "command-finished"
            ? `${shellEvent.kind} exit=${shellEvent.exitCode ?? "?"}`
            : shellEvent.kind === "command-line"
              ? `${shellEvent.kind} cmd=${JSON.stringify(shellEvent.command.slice(0, 160))}`
              : shellEvent.kind === "property"
                ? `${shellEvent.kind} ${shellEvent.key}=${JSON.stringify(shellEvent.value.slice(0, 160))}`
                : shellEvent.kind;
        const hintText = shellHint
          ? `hint=${shellHint.status}/${shellHint.attention}`
          : "hint=(null — shell event not mapped)";
        console.log(
          `[poracode-osc] PTY thread=${session.threadId} kind=${session.agentKind} ` +
            `osc=633 ${summary} ${hintText}`,
        );
      }
      if (shellHint) {
        applyOscHint(shellHint);
      }
    }

    if (isPoracodeOscDebugEnabled()) {
      if ((ptyCarryIn && ptyCarryIn.length > 0) || (carryOut && carryOut.length > 0)) {
        console.log(
          `[poracode-osc] PTY thread=${session.threadId} kind=${session.agentKind} ` +
            `oscCarryInBytes=${(ptyCarryIn ?? "").length} oscCarryOutBytes=${carryOut.length} (split OSC reassembly)`,
        );
      }
    }

    // Invalid-session-ref detection must run BEFORE the launching→idle flip
    // below: both are gated on `launching`, and `updateState` mutates status
    // synchronously, so a check placed after the flip can never match.
    if (this.detectsInvalidSessionRefOnLaunch(session, dataAfterOsc)) {
      this.options.onRecoverInvalidSessionRef(session);
      return;
    }

    if (session.status === "launching") {
      this.updateState(session, "idle", "none");
    }

    const strippedData = stripAnsiPreservingLayout(dataAfterOsc);
    session.lastStrippedPtyChunk = strippedData;
    const usesTerminalPresentation = session.adapter.capabilities.presentationMode === "terminal";

    if (
      usesTerminalPresentation &&
      session.adapter.detectAutoResponse &&
      !session.autoResponseEmitted
    ) {
      const key = session.adapter.detectAutoResponse(strippedData);
      if (key) {
        session.autoResponseEmitted = true;
        session.pty?.write(key);
      }
    }

    if (
      usesTerminalPresentation &&
      (session.adapter.isReadyForInitialPrompt || session.adapter.detectTerminalStatus)
    ) {
      // Hook-owned fast path: keep streaming + launch-queue + invalid session
      // ref recovery only — skip general status parsing / timers once a real
      // hook event has landed for this spawn.
      if (hookOwnsStatus) {
        if (session.workingSilenceTimer) {
          clearTimeout(session.workingSilenceTimer);
          session.workingSilenceTimer = undefined;
        }
        if (session.pendingStatusHint) {
          clearTimeout(session.pendingStatusHint.timer);
          session.pendingStatusHint = undefined;
        }
        if (
          session.pendingLaunchPrompt &&
          session.adapter.isReadyForInitialPrompt?.(strippedData)
        ) {
          this.options.onStartQueuedLaunchPrompt(session);
        }
        // Without this the deferred-to-terminal initial prompt (text +
        // attachments path) sits unsent on posix: L2 idle detection is skipped
        // and L1 hooks don't emit until the user does something.
        if (
          session.pendingTerminalPrompt &&
          session.adapter.isReadyForInitialPrompt?.(strippedData)
        ) {
          this.flushPendingTerminalWritesIfIdle(session);
        }
        const shouldApplyHookFallback = session.adapter.shouldApplyTerminalStatusWhileHookActive;
        const rawHint =
          shouldApplyHookFallback && session.adapter.detectTerminalStatus
            ? session.adapter.detectTerminalStatus(strippedData)
            : null;
        const hookFallbackHint =
          rawHint &&
          shouldApplyHookFallback &&
          !this.shouldSuppressLaunchWorkingHint(session, rawHint) &&
          shouldApplyHookFallback(rawHint)
            ? rawHint
            : null;
        if (hookFallbackHint) {
          const nextConfig = session.adapter.syncConfigFromTerminalState?.({
            config: session.config,
            previousStatus: session.status,
            previousAttention: session.attention,
            hint: hookFallbackHint,
          });
          const configChanged =
            nextConfig !== undefined && !isThreadConfigEqual(nextConfig, session.config);
          if (configChanged) {
            session.config = nextConfig!;
          }
          if (
            session.status !== hookFallbackHint.status ||
            session.attention !== hookFallbackHint.attention
          ) {
            this.updateState(session, hookFallbackHint.status, hookFallbackHint.attention);
          } else if (configChanged) {
            this.emitState(session);
          }
          this.writeHintLog(session, strippedData, hookFallbackHint);
        }
        return;
      }

      const lastHome = Math.max(
        dataAfterOsc.lastIndexOf("\x1b[H"),
        dataAfterOsc.lastIndexOf("\x1b[1;1H"),
      );
      const combined =
        lastHome >= 0 ? dataAfterOsc.slice(lastHome) : session.prevChunk + dataAfterOsc;
      session.prevChunk = combined.length > 8192 ? combined.slice(-8192) : combined;

      // L2 `detectTerminalStatus` must see only this `data` chunk — not
      // `stripped` from merged `prevChunk` + chunk, or old "Working" rows in
      // scrollback re-flip `working` after idle.
      const rawHint = session.adapter.detectTerminalStatus?.(strippedData) ?? null;
      const hint =
        rawHint && this.shouldSuppressLaunchWorkingHint(session, rawHint) ? null : rawHint;

      if (hint) {
        this.armCliHookTerminalFallback(session);

        const nextConfig = session.adapter.syncConfigFromTerminalState?.({
          config: session.config,
          previousStatus: session.status,
          previousAttention: session.attention,
          hint,
        });
        const configChanged =
          nextConfig !== undefined && !isThreadConfigEqual(nextConfig, session.config);

        if (configChanged) {
          session.config = nextConfig!;
        }

        const suppressHint = session.pendingTerminalPrompt && hint.status !== "idle";
        if (
          !suppressHint &&
          (session.status !== hint.status || session.attention !== hint.attention)
        ) {
          const baseDelay = STATUS_STABILIZATION_DELAY[hint.status] ?? 0;
          const extraDelay =
            !hint.corroborated && baseDelay > 0
              ? (UNCORROBORATED_EXTRA_DELAY[hint.status] ?? 0)
              : 0;

          const recentlyBecameIdle =
            session.status === "idle" &&
            hint.status === "working" &&
            session.lastStatusChangeAt !== undefined &&
            Date.now() - session.lastStatusChangeAt < 2000;
          const delay = recentlyBecameIdle
            ? Math.max(baseDelay + extraDelay, 800)
            : baseDelay + extraDelay;

          if (delay === 0) {
            if (session.pendingStatusHint) {
              clearTimeout(session.pendingStatusHint.timer);
              session.pendingStatusHint = undefined;
            }
            this.updateState(session, hint.status, hint.attention);
          } else if (
            session.pendingStatusHint &&
            session.pendingStatusHint.status === hint.status &&
            session.pendingStatusHint.attention === hint.attention
          ) {
            // keep timer
          } else if (
            session.pendingStatusHint &&
            session.pendingStatusHint.status !== session.status &&
            hint.status === session.status
          ) {
            // keep pending transition
          } else {
            if (session.pendingStatusHint) {
              clearTimeout(session.pendingStatusHint.timer);
            }
            session.pendingStatusHint = {
              status: hint.status,
              attention: hint.attention,
              timer: setTimeout(() => {
                session.pendingStatusHint = undefined;
                if (session.status !== hint.status || session.attention !== hint.attention) {
                  this.updateState(session, hint.status, hint.attention);
                }
              }, delay),
            };
          }

          if (
            session.adapter.discoverSessionRef &&
            !session.sessionRef &&
            !session.sessionRefDiscoveryStarted &&
            !session.pendingTerminalPrompt
          ) {
            session.sessionRefDiscoveryStarted = true;
            this.options.onStartSessionRefDiscovery(session);
          }
        } else {
          if (session.pendingStatusHint && session.pendingStatusHint.status !== hint.status) {
            clearTimeout(session.pendingStatusHint.timer);
            session.pendingStatusHint = undefined;
          }
          if (configChanged) {
            this.emitState(session);
          }
        }

        this.writeHintLog(session, strippedData, hint);
      }

      if (session.workingSilenceTimer) {
        clearTimeout(session.workingSilenceTimer);
        session.workingSilenceTimer = undefined;
      }
      const workingSilenceTimeoutMs =
        session.adapter.workingSilenceTimeoutMs === undefined
          ? DEFAULT_WORKING_SILENCE_TIMEOUT
          : session.adapter.workingSilenceTimeoutMs;
      if (
        session.status === "working" &&
        workingSilenceTimeoutMs !== null &&
        workingSilenceTimeoutMs > 0
      ) {
        session.workingSilenceTimer = setTimeout(() => {
          session.workingSilenceTimer = undefined;
          if (session.status === "working") {
            const latestHint = this.getLatestTerminalStatusHint(session);
            if (latestHint && latestHint.status !== "idle" && latestHint.corroborated !== false) {
              return;
            }
            this.updateState(session, "idle", "none");
          }
        }, workingSilenceTimeoutMs);
      }

      if (session.pendingLaunchPrompt && session.adapter.isReadyForInitialPrompt?.(strippedData)) {
        this.options.onStartQueuedLaunchPrompt(session);
      }

      // Mirror the hook-owned fallback (lines 461-466): adapters without
      // `detectTerminalStatus` (e.g. grok) rely on `isReadyForInitialPrompt`
      // to flush the deferred initial prompt, otherwise it sits unsent.
      if (
        session.pendingTerminalPrompt &&
        session.adapter.isReadyForInitialPrompt?.(strippedData)
      ) {
        this.flushPendingTerminalWritesIfIdle(session);
      }

      if (hint?.status === "idle") {
        this.flushPendingTerminalWritesIfIdle(session);
      }
    }
  }

  /**
   * A resume spawn whose session ref the provider no longer recognizes prints
   * an error banner instead of a TUI. Detect that banner while the thread is
   * still `launching` so the manager can respawn without the stale ref.
   * `prevChunk` is intentionally NOT persisted here — the terminal-observer
   * block later in `handlePtyData` owns that write.
   */
  private detectsInvalidSessionRefOnLaunch(session: SessionRuntime, dataAfterOsc: string): boolean {
    if (
      session.status !== "launching" ||
      !session.sessionRef ||
      !session.adapter.detectInvalidSessionRef ||
      session.adapter.capabilities.presentationMode !== "terminal"
    ) {
      return false;
    }
    const lastHome = Math.max(
      dataAfterOsc.lastIndexOf("\x1b[H"),
      dataAfterOsc.lastIndexOf("\x1b[1;1H"),
    );
    const combined =
      lastHome >= 0 ? dataAfterOsc.slice(lastHome) : session.prevChunk + dataAfterOsc;
    return session.adapter.detectInvalidSessionRef(stripAnsiPreservingLayout(combined));
  }

  private writeHintLog(
    session: SessionRuntime,
    stripped: string,
    hint: { status: string; attention: string } | null,
  ): void {
    if (!this.options.isDev) {
      return;
    }
    const tail = stripped.slice(-300);
    const timestamp = new Date().toISOString();
    const entry = [
      `--- ${timestamp} status=${session.status} hint=${hint?.status ?? "null"} ---`,
      tail,
      "",
    ].join("\n");
    this.options.logWriter.append(this.options.resolveHintLogPath(session.threadId), entry);
  }

  private clearPendingCliHookTerminalFallback(session: SessionRuntime): void {
    if (!session.cliHookTerminalFallbackTimer) {
      return;
    }
    clearTimeout(session.cliHookTerminalFallbackTimer);
    session.cliHookTerminalFallbackTimer = undefined;
  }

  private armCliHookTerminalFallback(session: SessionRuntime): void {
    if (
      !session.cliHookEnvInjected ||
      session.hasCliHookPluginActivity ||
      session.cliHookTerminalFallbackActive ||
      session.cliHookTerminalFallbackTimer ||
      this.options.readDisableCliHookPlugin()
    ) {
      return;
    }

    const timer = setTimeout(() => {
      session.cliHookTerminalFallbackTimer = undefined;

      if (
        !session.cliHookEnvInjected ||
        session.hasCliHookPluginActivity ||
        this.options.readDisableCliHookPlugin()
      ) {
        return;
      }

      session.cliHookTerminalFallbackActive = true;
      this.emitState(session);
    }, CLI_HOOK_FIRST_EVENT_GRACE_MS);
    (timer as { unref?: () => void }).unref?.();

    session.cliHookTerminalFallbackTimer = timer;
  }
}
