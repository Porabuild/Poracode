import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { Button } from "@heroui/react";
import { ArrowDown } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { TerminalSize } from "../../../shared/contracts";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { isMac, readBridge } from "../../bridge";
import { ContextMenu, type ContextMenuItem } from "../common";
import { useResolvedAppearance } from "../ui/provider";

export interface XTermSurfaceHandle {
  focus(): void;
  findNext(query: string): boolean;
  findPrevious(query: string): boolean;
  clearSearch(): void;
}

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

export const XTermSurface = forwardRef<
  XTermSurfaceHandle,
  {
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
  }
>(function XTermSurface(props, ref) {
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
  const searchRef = useRef<SearchAddon | null>(null);
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
  const [showScrollDown, setShowScrollDown] = useState(false);

  useImperativeHandle(ref, () => ({
    focus() {
      terminalRef.current?.focus();
    },
    findNext(query: string) {
      return searchRef.current?.findNext(query) ?? false;
    },
    findPrevious(query: string) {
      return searchRef.current?.findPrevious(query) ?? false;
    },
    clearSearch() {
      searchRef.current?.clearDecorations();
    },
  }));

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
    //
    // Each flush is wrapped in DEC synchronized output (mode 2026)
    // so xterm buffers all rendering until the end marker.  This
    // prevents the cursor from being visible at intermediate
    // positions during TUI screen redraws.
    const SYNC_START = "\x1b[?2026h";
    const SYNC_END = "\x1b[?2026l";
    let writeBuf = "";
    let writeTimer = 0;
    const flushWrites = () => {
      writeTimer = 0;
      if (writeBuf) {
        try {
          terminal.write(SYNC_START + writeBuf + SYNC_END);
        } catch {
          // Terminal may be disposed between timer set and fire.
        }
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
      allowProposedApi: true,
      cursorBlink: false,
      cursorStyle: "bar",
      scrollback: 5_000,
      scrollSensitivity: useSharedSettings.getState().scrollSpeed,
      fastScrollSensitivity: 10,
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

    const search = new SearchAddon();
    searchRef.current = search;

    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        void readBridge().openExternal(uri);
      }),
    );

    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = "11";

    terminal.loadAddon(new ImageAddon());
    terminal.loadAddon(new ClipboardAddon());

    terminal.open(mount);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      // WebGL unavailable — falls back to canvas renderer.
    }

    terminal.onWriteParsed(() => {
      onActivityRef.current?.();
    });

    terminal.onBell(() => {
      onBellRef.current?.();
    });

    terminal.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    // ── Scroll-to-bottom tracking ──────────────────────────────
    const SCROLL_THRESHOLD = 15; // lines from bottom before showing button
    const checkScrollPosition = () => {
      const buf = terminal.buffer.active;
      const distanceFromBottom = buf.baseY - buf.viewportY;
      setShowScrollDown(distanceFromBottom > SCROLL_THRESHOLD);
    };
    terminal.onScroll(checkScrollPosition);
    // Also recheck after new content is written (buffer may grow while
    // the user is scrolled up).
    terminal.onWriteParsed(checkScrollPosition);

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
      if (event.type !== "keydown" || event.shiftKey || event.altKey) {
        return true;
      }

      const modKey = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!modKey) return true;

      // ── Paste: Ctrl+V / Cmd+V ───────────────────────────────────
      if (event.code === "KeyV" && !readOnly) {
        event.preventDefault();
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            terminal.paste(text);
          }
        });
        return false;
      }

      // ── Copy: Ctrl+C / Cmd+C ───────────────────────────────────
      if (event.code === "KeyC") {
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
        queueWrite(event.data);
        return;
      }

      if (event.type === "thread-exited" && event.threadId === terminalId) {
        onExitedRef.current?.(event.exitCode);
      }
    });

    // Double-rAF to ensure layout has settled before fitting
    requestAnimationFrame(() => {
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
      searchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once: terminal is created once, readOnly/terminalId/appearance are captured at init
  }, []);

  const contextMenuItems: ContextMenuItem[] = [
    { id: "copy", label: "Copy", isDisabled: !hasSelection },
    ...(!readOnly ? [{ id: "paste", label: "Paste" }] : []),
    { id: "paste-in-input", label: "Paste in input", isDisabled: !hasSelection },
  ];

  function handleContextMenuAction(key: string) {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (key === "copy") {
      if (!terminal.hasSelection()) return;
      void navigator.clipboard.writeText(terminal.getSelection());
      terminal.clearSelection();
    } else if (key === "paste") {
      void navigator.clipboard.readText().then((text) => {
        if (text) {
          terminal.paste(text);
        }
      });
    } else if (key === "paste-in-input") {
      if (!terminal.hasSelection()) return;
      window.dispatchEvent(
        new CustomEvent("lightcode:paste-to-composer", { detail: terminal.getSelection() }),
      );
      terminal.clearSelection();
    }
  }

  return (
    <ContextMenu items={contextMenuItems} onAction={handleContextMenuAction}>
      <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
        <div ref={mountRef} className="lightcode-terminal-pane h-full w-full overflow-hidden" />
        <Button
          isIconOnly
          variant="tertiary"
          size="sm"
          aria-label="Scroll to bottom"
          onPress={() => terminalRef.current?.scrollToBottom()}
          className={`absolute bottom-4 right-4 z-10 transition-opacity duration-200 ease-out ${
            showScrollDown ? "opacity-80 hover:opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <ArrowDown className="size-3.5" strokeWidth={2.5} />
        </Button>
      </div>
    </ContextMenu>
  );
});
