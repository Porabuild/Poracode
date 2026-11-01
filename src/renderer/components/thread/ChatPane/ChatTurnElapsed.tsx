import { useEffect, useRef, type ReactNode } from "react";
import { Surface } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useShimmerRef } from "@/renderer/thinkingAnimator";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { chatMessageSurfaceClass } from "./parts/items/chatMessageSurface";

export interface TurnTiming {
  startedAt: number;
  endedAt: number | null;
}

/** The transcript-tail surface every closing status line renders inside. */
export function ChatTailStatus({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <div className="inline-flex items-center gap-1.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          {children}
        </div>
      </Surface>
    </div>
  );
}

interface ChatTurnStatusProps {
  turn: TurnTiming;
  isPaused?: boolean;
  isWaitingForBackground?: boolean;
}

export function ChatTurnStatus({
  turn,
  isPaused = false,
  isWaitingForBackground = false,
}: ChatTurnStatusProps) {
  const { t } = useLingui();
  return isWaitingForBackground ? (
    <span className="text-muted" aria-live="polite">{t`Waiting for background tasks`}</span>
  ) : (
    <WorkingFor turn={turn} isPaused={isPaused} />
  );
}

export function ChatShimmerStatus({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useShimmerRef(textRef, true);
  return (
    <span
      ref={textRef}
      className="poracode-thinking-text"
      data-poracode-shimmer-text={text}
      aria-live="polite"
    >
      {text}
    </span>
  );
}

export function ChatTailStatusPlaceholder() {
  // Holds the tail row's exact height while the status shows in the bubble
  // row, so the transcript end stays clear of the pill and the later swap to
  // "Worked for" does not move the pinned tail.
  return (
    <ChatTailStatus>
      <span aria-hidden="true" className="invisible" data-chat-status-placeholder="">
        {"\u00a0"}
      </span>
    </ChatTailStatus>
  );
}

export function ChatTurnElapsedFooter(props: ChatTurnStatusProps) {
  return (
    <ChatTailStatus>
      <ChatTurnStatus {...props} />
    </ChatTailStatus>
  );
}

export function ChatStatusFooter({ text }: { text: string }) {
  return (
    <ChatTailStatus>
      <ChatShimmerStatus text={text} />
    </ChatTailStatus>
  );
}

function WorkingFor({ turn, isPaused }: { turn: TurnTiming; isPaused: boolean }) {
  if (turn.endedAt !== null) {
    return <WorkedFor startedAt={turn.startedAt} endedAt={turn.endedAt} />;
  }
  return <LiveWorkingFor startedAt={turn.startedAt} isPaused={isPaused} />;
}

function WorkedFor({ startedAt, endedAt }: { startedAt: number; endedAt: number }) {
  const { t } = useLingui();
  const elapsedSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  const elapsed = formatElapsed(elapsedSeconds);
  const text = elapsedSeconds < 1 ? "" : t`Worked for ${elapsed}`;
  return (
    <span className="text-muted" aria-live="polite">
      {text}
    </span>
  );
}

/**
 * Self-ticking elapsed-time label. When `isPaused` is true (e.g. the runtime
 * is blocked on a user-input prompt), the counter freezes at its current value
 * and the paused interval is excluded from the elapsed total once it resumes.
 * Mutates `textContent` directly via a ref instead of calling `setState` so the
 * per-second tick produces zero React commits while chat is streaming.
 */
function LiveWorkingFor({ startedAt, isPaused }: { startedAt: number; isPaused: boolean }) {
  const { t } = useLingui();
  const textRef = useRef<HTMLSpanElement>(null);
  const pauseStateRef = useRef<{
    startedAt: number;
    accumulatedPauseMs: number;
    pausedSinceMs: number | null;
  }>({
    startedAt,
    accumulatedPauseMs: 0,
    pausedSinceMs: null,
  });

  useEffect(() => {
    // A new turn re-arms the pause baseline stored above; pause/locale-only
    // runs keep the accumulated tracking. The stored start is what the
    // elapsed math below measures against, so `startedAt` is read here —
    // not just a re-run trigger.
    if (pauseStateRef.current.startedAt !== startedAt) {
      pauseStateRef.current = { startedAt, accumulatedPauseMs: 0, pausedSinceMs: null };
    }
    const update = () => {
      const node = textRef.current;
      if (!node) return;
      const pauseState = pauseStateRef.current;
      const now = Date.now();
      const currentPauseMs =
        pauseState.pausedSinceMs !== null ? Math.max(0, now - pauseState.pausedSinceMs) : 0;
      const elapsedMs = now - pauseState.startedAt - pauseState.accumulatedPauseMs - currentPauseMs;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const elapsed = formatElapsed(elapsedSeconds);
      const text = elapsedSeconds < 1 ? t`Working…` : t`Working for ${elapsed}`;
      node.textContent = text;
      node.dataset.poracodeShimmerText = text;
    };

    if (isPaused) {
      if (pauseStateRef.current.pausedSinceMs === null) {
        pauseStateRef.current.pausedSinceMs = Date.now();
      }
      update();
      return;
    }

    if (pauseStateRef.current.pausedSinceMs !== null) {
      pauseStateRef.current.accumulatedPauseMs += Math.max(
        0,
        Date.now() - pauseStateRef.current.pausedSinceMs,
      );
      pauseStateRef.current.pausedSinceMs = null;
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt, isPaused, t]);

  const isThinking = !isPaused;
  useShimmerRef(textRef, isThinking);
  const className = isThinking ? "poracode-thinking-text" : "text-muted";
  return (
    <span ref={textRef} className={className} aria-live="polite">
      {t`Working…`}
    </span>
  );
}
