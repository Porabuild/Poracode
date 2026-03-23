import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import type { ThreadStatus } from "../../../shared/contracts";
import { readBridge } from "../../bridge";
import { useResolvedAppearance } from "../ui/provider";

const INITIAL_REVEAL_DELAY_MS = 150;
const POST_RESIZE_REVEAL_DELAY_MS = 50;

function getTerminalTheme(appearance: "light" | "dark") {
  const rootStyles =
    typeof window !== "undefined" ? window.getComputedStyle(document.documentElement) : null;
  const background =
    rootStyles?.getPropertyValue("--content-background").trim() ||
    (appearance === "dark" ? "#2b2a2f" : "#f1f1ef");

  if (appearance === "dark") {
    return {
      background,
      foreground: "#e7edf6",
      cursor: "#94bfff",
      selectionBackground: "rgba(148, 191, 255, 0.24)",
    };
  }

  return {
    background,
    foreground: "#132034",
    cursor: "#1d4c89",
    selectionBackground: "rgba(29, 76, 137, 0.16)",
  };
}

export function TerminalPane(props: {
  threadId: string;
  status: ThreadStatus;
  readOnly?: boolean;
}) {
  const { threadId, status, readOnly = false } = props;
  const appearance = useResolvedAppearance();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const initialDelayTimerRef = useRef<number | null>(null);
  const scheduleResizeRef = useRef<((revealAfterResize?: boolean) => void) | null>(null);
  const canResizeRef = useRef(false);
  const [isVisible, setIsVisible] = useState(status !== "inactive");

  function clearTimer(timerRef: React.MutableRefObject<number | null>): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleVisibleAfterResize(): void {
    clearTimer(revealTimerRef);
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      setIsVisible(true);
    }, POST_RESIZE_REVEAL_DELAY_MS);
  }

  useEffect(() => {
    if (status === "inactive") {
      setIsVisible(false);
      canResizeRef.current = false;
      return;
    }

    if (isVisible) {
      return;
    }

    clearTimer(initialDelayTimerRef);
    initialDelayTimerRef.current = window.setTimeout(() => {
      initialDelayTimerRef.current = null;
      canResizeRef.current = true;
      scheduleResizeRef.current?.(true);
    }, INITIAL_REVEAL_DELAY_MS);

    return () => {
      clearTimer(initialDelayTimerRef);
    };
  }, [isVisible, status]);

  useEffect(() => {
    let isActive = true;
    let resizeFrame = 0;
    let lastCols = -1;
    let lastRows = -1;
    const mount = mountRef.current;
    if (!mount || status === "inactive") {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: !readOnly,
      cursorStyle: "bar",
      convertEol: true,
      scrollback: 5_000,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      theme: getTerminalTheme(appearance),
    });
    const fit = new FitAddon();

    const scheduleResize = (revealAfterResize = false) => {
      if (!canResizeRef.current) {
        return;
      }

      if (!isActive) {
        return;
      }

      if (resizeFrame !== 0) {
        cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        if (!isActive) {
          return;
        }

        fit.fit();

        if (terminal.cols === lastCols && terminal.rows === lastRows) {
          if (revealAfterResize) {
            scheduleVisibleAfterResize();
          }
          return;
        }

        lastCols = terminal.cols;
        lastRows = terminal.rows;

        void readBridge()
          .resizeTerminal({
            threadId,
            cols: terminal.cols,
            rows: terminal.rows,
          })
          .finally(() => {
            if (revealAfterResize) {
              scheduleVisibleAfterResize();
            }
          })
          .catch(() => {
            // Resize events can race with thread shutdown; ignore stale updates.
          });
      });
    };

    terminal.loadAddon(fit);
    terminal.open(mount);
    scheduleResizeRef.current = scheduleResize;
    canResizeRef.current = true;

    if (!readOnly) {
      terminal.onData((data) => {
        void readBridge()
          .writeTerminal({ threadId, data })
          .catch(() => {
            // The live PTY may disappear during teardown; ignore stale writes from xterm.
          });
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });
    resizeObserver.observe(mount);

    const unsubscribe = readBridge().onSupervisorEvent((event) => {
      if (event.type === "thread-reset" && event.threadId === threadId) {
        clearTimer(initialDelayTimerRef);
        clearTimer(revealTimerRef);
        canResizeRef.current = false;
        setIsVisible(false);
        terminal.reset();
        return;
      }

      if (event.type === "thread-output" && event.threadId === threadId) {
        terminal.write(event.data);
      }
    });

    return () => {
      isActive = false;
      clearTimer(initialDelayTimerRef);
      clearTimer(revealTimerRef);
      if (resizeFrame !== 0) {
        cancelAnimationFrame(resizeFrame);
      }
      unsubscribe();
      resizeObserver.disconnect();
      canResizeRef.current = false;
      scheduleResizeRef.current = null;
      terminal.dispose();
    };
  }, [appearance, readOnly, status, threadId]);

  return (
    <div
      ref={mountRef}
      className={`lightcode-terminal-pane h-full w-full overflow-hidden transition-opacity duration-300 ease-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
