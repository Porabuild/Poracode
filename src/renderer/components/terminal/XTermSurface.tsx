import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, type RefObject } from "react";
import { readBridge } from "../../bridge";
import { useResolvedAppearance } from "../ui/provider";

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

export function XTermSurface(props: {
  terminalId: string;
  readOnly?: boolean;
  enabled?: boolean;
  onReset?: () => void;
  onExited?: (exitCode: number | null) => void;
  className?: string;
}) {
  const { terminalId, readOnly = false, enabled = true, onReset, onExited, className } = props;
  const appearance = useResolvedAppearance();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onResetRef: RefObject<typeof onReset> = useRef(onReset);
  onResetRef.current = onReset;
  const onExitedRef: RefObject<typeof onExited> = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !enabled) {
      return;
    }

    let isActive = true;
    let resizeFrame = 0;
    let lastCols = -1;
    let lastRows = -1;

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

    let retryTimer = 0;

    const scheduleResize = () => {
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

        // Guard against zero-width/zero-height container — retry shortly.
        if (mount.clientWidth === 0 || mount.clientHeight === 0) {
          if (retryTimer === 0) {
            retryTimer = window.setTimeout(() => {
              retryTimer = 0;
              scheduleResize();
            }, 200);
          }
          return;
        }

        fit.fit();

        if (terminal.cols === lastCols && terminal.rows === lastRows) {
          return;
        }

        // The supervisor schema enforces cols >= 20 and rows >= 5.
        // Skip the IPC call when the container is too small to avoid
        // validation errors that spam the console.
        if (terminal.cols < 20 || terminal.rows < 5) {
          return;
        }

        lastCols = terminal.cols;
        lastRows = terminal.rows;

        void readBridge()
          .resizeTerminal({
            threadId: terminalId,
            cols: terminal.cols,
            rows: terminal.rows,
          })
          .catch(() => {
            // Resize events can race with shutdown; ignore stale updates.
          });
      });
    };

    terminal.loadAddon(fit);
    terminal.open(mount);

    if (!readOnly) {
      terminal.onData((data) => {
        void readBridge()
          .writeTerminal({ threadId: terminalId, data })
          .catch(() => {
            // PTY may disappear during teardown; ignore stale writes.
          });
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });
    resizeObserver.observe(mount);

    const unsubscribe = readBridge().onSupervisorEvent((event) => {
      if (event.type === "thread-reset" && event.threadId === terminalId) {
        terminal.reset();
        onResetRef.current?.();
        return;
      }

      if (event.type === "thread-output" && event.threadId === terminalId) {
        terminal.write(event.data);
        return;
      }

      if (event.type === "thread-exited" && event.threadId === terminalId) {
        onExitedRef.current?.(event.exitCode);
      }
    });

    // Initial fit after mount.
    scheduleResize();

    return () => {
      isActive = false;
      if (resizeFrame !== 0) {
        cancelAnimationFrame(resizeFrame);
      }
      if (retryTimer !== 0) {
        window.clearTimeout(retryTimer);
      }
      unsubscribe();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [appearance, readOnly, enabled, terminalId]);

  return (
    <div
      ref={mountRef}
      className={`lightcode-terminal-pane h-full w-full overflow-hidden ${className ?? ""}`}
    />
  );
}
