import { useEffect, useRef, useState } from "react";
import type { ThreadStatus } from "../../../shared/contracts";
import { XTermSurface } from "../terminal/XTermSurface";

const INITIAL_REVEAL_DELAY_MS = 150;
const POST_MOUNT_REVEAL_DELAY_MS = 50;

export function TerminalPane(props: {
  threadId: string;
  status: ThreadStatus;
  readOnly?: boolean;
}) {
  const { threadId, status, readOnly = false } = props;
  const timerRef = useRef<number | null>(null);
  const [isVisible, setIsVisible] = useState(status !== "inactive");
  const [surfaceEnabled, setSurfaceEnabled] = useState(status !== "inactive");

  function clearTimer(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // When the terminal becomes active, delay enabling the surface so the
  // container can settle its layout first. Once the surface is enabled
  // (and xterm mounts + resizes), reveal it with a short additional delay.
  useEffect(() => {
    if (status === "inactive") {
      setIsVisible(false);
      setSurfaceEnabled(false);
      return;
    }

    if (isVisible) {
      return;
    }

    clearTimer();

    if (!surfaceEnabled) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setSurfaceEnabled(true);
      }, INITIAL_REVEAL_DELAY_MS);
    } else {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setIsVisible(true);
      }, POST_MOUNT_REVEAL_DELAY_MS);
    }

    return () => {
      clearTimer();
    };
  }, [status, isVisible, surfaceEnabled]);

  const isTerminalActive = status !== "inactive";

  return (
    <div
      className={`h-full w-full overflow-hidden transition-opacity duration-300 ease-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <XTermSurface
        terminalId={threadId}
        readOnly={readOnly}
        enabled={isTerminalActive && surfaceEnabled}
        onReset={() => {
          clearTimer();
          setIsVisible(false);
        }}
      />
    </div>
  );
}
