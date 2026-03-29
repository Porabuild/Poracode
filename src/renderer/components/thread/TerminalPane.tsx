import { useEffect, useRef, useState } from "react";
import type { TerminalSize, ThreadStatus } from "../../../shared/contracts";
import { XTermSurface } from "../terminal/XTermSurface";

const POST_MOUNT_REVEAL_DELAY_MS = 50;

export function TerminalPane(props: {
  threadId: string;
  status: ThreadStatus;
  readOnly?: boolean;
  onTerminalResize?: (size: TerminalSize) => void;
}) {
  const { threadId, status, readOnly = false, onTerminalResize } = props;
  const timerRef = useRef<number | null>(null);
  const [isVisible, setIsVisible] = useState(status !== "inactive");

  function clearTimer(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Keep xterm mounted as soon as the thread becomes active so launch-time
  // resize information is available before the PTY starts.
  useEffect(() => {
    if (status === "inactive") {
      setIsVisible(false);
      return;
    }

    if (isVisible || timerRef.current !== null) {
      return;
    }

    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setIsVisible(true);
    }, POST_MOUNT_REVEAL_DELAY_MS);

    return () => {
      clearTimer();
    };
  }, [status, isVisible]);

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
        enabled={isTerminalActive}
        onReset={() => {
          clearTimer();
          setIsVisible(false);
        }}
        {...(onTerminalResize ? { onTerminalResize } : {})}
      />
    </div>
  );
}
