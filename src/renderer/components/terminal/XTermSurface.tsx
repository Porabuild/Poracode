import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { TerminalSize } from "../../../shared/contracts";
import { isMac, readBridge } from "../../bridge";
import { ContextMenu, type ContextMenuItem } from "../common";
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
  onActivity?: () => void;
  onBell?: () => void;
  onTitleChange?: (title: string) => void;
  onTerminalResize?: (size: TerminalSize) => void;
  className?: string;
}) {
  const {
    terminalId,
    readOnly = false,
    onReset,
    onExited,
    onActivity,
    onBell,
    onTitleChange,
    onTerminalResize,
    className,
  } = props;
  const appearance = useResolvedAppearance();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onResetRef: RefObject<typeof onReset> = useRef(onReset);
  onResetRef.current = onReset;
  const onExitedRef: RefObject<typeof onExited> = useRef(onExited);
  onExitedRef.current = onExited;
  const onActivityRef: RefObject<typeof onActivity> = useRef(onActivity);
  onActivityRef.current = onActivity;
  const onBellRef: RefObject<typeof onBell> = useRef(onBell);
  onBellRef.current = onBell;
  const onTitleChangeRef: RefObject<typeof onTitleChange> = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onTerminalResizeRef: RefObject<typeof onTerminalResize> = useRef(onTerminalResize);
  onTerminalResizeRef.current = onTerminalResize;
  const [hasSelection, setHasSelection] = useState(false);

  // Terminal lifecycle: create ONCE when component mounts, destroy on unmount
  // Independent of `enabled` prop - terminals stay alive as long as the component exists
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }


    let isActive = true;
    let lastCols = -1;
    let lastRows = -1;
    let resizeFrame = 0;
    let historyLoaded = false;
    let historyLength = 0;
    const pendingEvents: Array<{ data: string; outputLength: number }> = [];

    // ── Write batching ───────────────────────────────────────────
    // Full-screen TUIs (e.g. Gemini CLI) send screen redraws as
    // multiple PTY chunks (clear + rewrite).  The chunks arrive as
    // separate IPC events (macrotasks).  If a rAF callback fires
    // between two related IPC events, the first chunk is flushed
    // alone and xterm renders a partial screen state → flicker.
    //
    // Fix: use a short setTimeout (8 ms ≈ half a frame) instead of
    // requestAnimationFrame.  This gives a consistent coalescing
    // window: all IPC events that arrive within the timeout are
    // guaranteed to be batched into a single `terminal.write()`.
    // 8 ms is imperceptible but long enough to span the gap between
    // closely-spaced PTY read events.
    let writeBuf = "";
    let writeTimer = 0;
    const flushWrites = () => {
      writeTimer = 0;
      if (writeBuf) {
        terminal.write(writeBuf);
        writeBuf = "";
      }
    };
    const queueWrite = (data: string) => {
      writeBuf += data;
      if (writeTimer === 0) {
        writeTimer = window.setTimeout(flushWrites, 8) as unknown as number;
      }
    };

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

    terminalRef.current = terminal;
    fitRef.current = fit;

    const doFit = () => {
      if (!isActive || !mount) return;

      const width = mount.clientWidth;
      const height = mount.clientHeight;

      if (width === 0 || height === 0) {
        return;
      }

      fit.fit();

      if (terminal.cols !== lastCols || terminal.rows !== lastRows) {
        lastCols = terminal.cols;
        lastRows = terminal.rows;


        if (terminal.cols >= 20 && terminal.rows >= 5) {
          onTerminalResizeRef.current?.({
            cols: terminal.cols,
            rows: terminal.rows,
          });

          void readBridge()
            .resizeTerminal({
              threadId: terminalId,
              cols: terminal.cols,
              rows: terminal.rows,
            })
            .catch(() => {
              // Ignore errors.
            });
        }
      }
    };

    const scheduleResize = () => {
      if (!isActive) return;

      if (resizeFrame !== 0) {
        cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        if (!isActive) return;
        doFit();
      });
    };

    terminal.loadAddon(fit);
    terminal.open(mount);

    terminal.onWriteParsed(() => {
      onActivityRef.current?.();
    });

    terminal.onBell(() => {
      onBellRef.current?.();
    });

    terminal.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    // ── Selection tracking ───────────────────────────────────────
    terminal.onSelectionChange(() => {
      setHasSelection(terminal.hasSelection());
    });

    // ── Copy shortcut: Ctrl+C / Cmd+C ───────────────────────────
    // Single Ctrl+C with selection → copy. Rapid Ctrl+C (within
    // 500 ms of a copy) → pass through as SIGINT so agents can
    // be interrupted with the usual double-Ctrl+C pattern.
    const mac = isMac();
    let lastCopyTime = 0;
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || event.code !== "KeyC" || event.shiftKey || event.altKey) {
        return true;
      }
      const isCopyChord = mac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      if (!isCopyChord) return true;

      if (terminal.hasSelection()) {
        const now = Date.now();
        // On non-Mac, let rapid Ctrl+C through as SIGINT
        if (!mac && now - lastCopyTime < 500) {
          return true;
        }
        void navigator.clipboard.writeText(terminal.getSelection());
        terminal.clearSelection();
        lastCopyTime = now;
        return false;
      }
      return true;
    });

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

    // Subscribe to supervisor events - this stays alive for the terminal's entire lifecycle
    const unsubscribe = readBridge().onSupervisorEvent((event) => {
      if (event.type === "thread-reset" && event.threadId === terminalId) {
        terminal.reset();
        onResetRef.current?.();
        return;
      }

      if (event.type === "thread-output" && event.threadId === terminalId) {
        if (!historyLoaded) {
          pendingEvents.push({ data: event.data, outputLength: event.outputLength });
          return;
        }
        queueWrite(event.data);
        return;
      }

      if (event.type === "thread-exited" && event.threadId === terminalId) {
        onExitedRef.current?.(event.exitCode);
      }
    });

    // Replay terminal history for warm threads, then fit
    readBridge()
      .getThreadHistory(terminalId)
      .then((snapshot) => {
        if (!isActive) return;
        if (snapshot.history) {
          terminal.write(snapshot.history);
        }
        historyLength = snapshot.length;
        historyLoaded = true;

        // Flush buffered events, dedup using outputLength
        for (const evt of pendingEvents) {
          const dataStart = evt.outputLength - evt.data.length;
          if (dataStart >= historyLength) {
            queueWrite(evt.data);
          } else if (evt.outputLength > historyLength) {
            queueWrite(evt.data.slice(historyLength - dataStart));
          }
        }
        pendingEvents.length = 0;

        // Double-rAF to ensure layout has settled before fitting
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (isActive) {
              doFit();
            }
          });
        });
      })
      .catch(() => {
        if (!isActive) return;
        historyLoaded = true;
        for (const evt of pendingEvents) {
          queueWrite(evt.data);
        }
        pendingEvents.length = 0;
        requestAnimationFrame(() => {
          if (isActive) {
            doFit();
          }
        });
      });

    return () => {
      isActive = false;
      if (resizeFrame !== 0) {
        cancelAnimationFrame(resizeFrame);
      }
      if (writeTimer !== 0) {
        clearTimeout(writeTimer);
      }
      unsubscribe();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once: terminal is created once, readOnly/terminalId/appearance are captured at init
  }, []);

  const contextMenuItems: ContextMenuItem[] = [
    { id: "copy", label: "Copy", isDisabled: !hasSelection },
    { id: "paste-in-input", label: "Paste in input", isDisabled: !hasSelection },
  ];

  function handleContextMenuAction(key: string) {
    const terminal = terminalRef.current;
    if (!terminal || !terminal.hasSelection()) return;
    const text = terminal.getSelection();
    if (key === "copy") {
      void navigator.clipboard.writeText(text);
      terminal.clearSelection();
    } else if (key === "paste-in-input") {
      window.dispatchEvent(new CustomEvent("lightcode:paste-to-composer", { detail: text }));
      terminal.clearSelection();
    }
  }

  return (
    <ContextMenu items={contextMenuItems} onAction={handleContextMenuAction}>
      <div
        ref={mountRef}
        className={`lightcode-terminal-pane h-full w-full overflow-hidden ${className ?? ""}`}
      />
    </ContextMenu>
  );
}
