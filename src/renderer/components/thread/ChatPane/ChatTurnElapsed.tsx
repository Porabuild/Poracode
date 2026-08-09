import { useEffect, useRef } from "react";
import { Surface } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useShimmerRef } from "@/renderer/thinkingAnimator";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { chatMessageSurfaceClass } from "./parts/items/chatMessageSurface";

export interface TurnTiming {
  startedAt: number;
  endedAt: number | null;
}

export function ChatTurnElapsedFooter({
  turn,
  isPaused = false,
}: {
  turn: TurnTiming;
  isPaused?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <div className="inline-flex items-center gap-1.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          <WorkingFor turn={turn} isPaused={isPaused} />
        </div>
      </Surface>
    </div>
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
  const pauseStateRef = useRef<{ accumulatedPauseMs: number; pausedSinceMs: number | null }>({
    accumulatedPauseMs: 0,
    pausedSinceMs: null,
  });

  useEffect(() => {
    pauseStateRef.current = { accumulatedPauseMs: 0, pausedSinceMs: null };
  }, [startedAt]);

  useEffect(() => {
    const update = () => {
      const node = textRef.current;
      if (!node) return;
      const pauseState = pauseStateRef.current;
      const now = Date.now();
      const currentPauseMs =
        pauseState.pausedSinceMs !== null ? Math.max(0, now - pauseState.pausedSinceMs) : 0;
      const elapsedMs = now - startedAt - pauseState.accumulatedPauseMs - currentPauseMs;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const elapsed = formatElapsed(elapsedSeconds);
      const text = elapsedSeconds < 1 ? "" : t`Working for ${elapsed}`;
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
  return <span ref={textRef} className={className} aria-live="polite" />;
}
