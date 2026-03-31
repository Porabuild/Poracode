import { useEffect, useState } from "react";
import type { TerminalSize, ThreadStatus } from "../../../shared/contracts";
import { XTermSurface } from "../terminal/XTermSurface";

export function TerminalPane(props: {
  threadId: string;
  status: ThreadStatus;
  readOnly?: boolean;
  onTerminalResize?: (size: TerminalSize) => void;
}) {
  const { threadId, status, readOnly = false, onTerminalResize } = props;
  const [isVisible, setIsVisible] = useState(status !== "inactive");

  useEffect(() => {
    // Immediately update visibility based on status - no delays
    setIsVisible(status !== "inactive");
  }, [status]);

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
          setIsVisible(false);
        }}
        {...(onTerminalResize ? { onTerminalResize } : {})}
      />
    </div>
  );
}
