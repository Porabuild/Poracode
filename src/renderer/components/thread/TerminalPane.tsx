import { useEffect, useRef, useState } from "react";
import type { TerminalSize, ThreadStatus } from "../../../shared/contracts";
import { XTermSurface, type XTermSurfaceHandle } from "../terminal/XTermSurface";

export function TerminalPane(props: {
  threadId: string;
  status: ThreadStatus;
  onTerminalResize?: (size: TerminalSize) => void;
}) {
  const { threadId, status, onTerminalResize } = props;
  const [isVisible, setIsVisible] = useState(status !== "inactive");
  const xtermRef = useRef<XTermSurfaceHandle>(null);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    // Immediately update visibility based on status - no delays
    setIsVisible(status !== "inactive");
  }, [status]);

  // Auto-focus the terminal when the agent needs user interaction (plan
  // questions, approval prompts) so arrow-key navigation works immediately.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (
      (status === "needs_reply" || status === "needs_approval") &&
      prev !== status
    ) {
      xtermRef.current?.focus();
    }
  }, [status]);

  const isTerminalActive = status !== "inactive";

  return (
    <div
      className={`h-full w-full overflow-hidden transition-opacity duration-300 ease-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <XTermSurface
        ref={xtermRef}
        terminalId={threadId}
        enabled={isTerminalActive}
        onReset={() => {
          setIsVisible(false);
        }}
        {...(onTerminalResize ? { onTerminalResize } : {})}
      />
    </div>
  );
}
