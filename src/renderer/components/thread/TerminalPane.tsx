import { useEffect, useRef } from "react";
import type { TerminalSize, ThreadStatus } from "../../../shared/contracts";
import { XTermSurface, type XTermSurfaceHandle } from "../terminal/XTermSurface";

export function TerminalPane(props: {
  threadId: string;
  status: ThreadStatus;
  onTerminalResize?: (size: TerminalSize) => void;
}) {
  const { threadId, status, onTerminalResize } = props;
  const xtermRef = useRef<XTermSurfaceHandle>(null);
  const prevStatusRef = useRef(status);

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
        status === "inactive" ? "opacity-0" : "opacity-100"
      }`}
    >
      <XTermSurface
        ref={xtermRef}
        terminalId={threadId}
        enabled={isTerminalActive}
        {...(onTerminalResize ? { onTerminalResize } : {})}
      />
    </div>
  );
}
