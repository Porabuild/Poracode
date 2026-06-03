import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { TerminalLinkProvider } from "./TerminalLinkProvider";
import { Terminal } from "@xterm/xterm";
import { Button } from "@heroui/react";
import { ArrowDown } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { TerminalSize } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isMac, readBridge } from "@/renderer/bridge";
import { ContextMenu, type ContextMenuItem } from "@/renderer/components/common";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";

export interface XTermSurfaceHandle {
  focus(): void;
  refit(): void;
  findNext(query: string): boolean;
  findPrevious(query: string): boolean;
  clearSearch(): void;
}

const TERMINAL_SCROLLBAR_WIDTH = 9;
const TERMINAL_INTERNAL_SCROLLBAR_WIDTH = 0.01;

// Terminal colors track the active theme by reading the same CSS custom
// properties the rest of the app uses, so presets (Dracula, Nord, ...) apply to
// the terminal too. Falls back to fixed light/dark values when a property is
// unset or unparseable.
function getTerminalTheme(appearance: "light" | "dark") {
  const rootStyles =
    typeof window !== "undefined" ? window.getComputedStyle(document.documentElement) : null;
  const readVar = (name: string) => rootStyles?.getPropertyValue(name).trim() || "";

  const fallback =
    appearance === "dark"
      ? { background: "#2b2a2f", foreground: "#e7edf6", cursor: "#94bfff" }
      : { background: "#f1f1ef", foreground: "#132034", cursor: "#1d4c89" };

  return {
    background: readVar("--content-background") || fallback.background,
    foreground: readVar("--foreground") || fallback.foreground,
    cursor: readVar("--accent") || fallback.cursor,
    selectionBackground:
      appearance === "dark" ? "rgba(148, 191, 255, 0.24)" : "rgba(29, 76, 137, 0.16)",
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
    baseFontSize?: number;
    openLinksInNativeBrowser?: boolean;
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
    baseFontSize = 12,
    openLinksInNativeBrowser = false,
  } = props;
  const appearance = useResolvedAppearance();
  const themePreset = useSharedSettings((state) => state.themePreset);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null);
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
  const baseFontSizeRef = useRef(baseFontSize);
  baseFontSizeRef.current = baseFontSize;
  const requestRefitRef = useRef<(() => void) | null>(null);
  const openLink = (uri: string) => {
    const bridge = readBridge();
    void (openLinksInNativeBrowser ? bridge.openExternalNative(uri) : bridge.openExternal(uri));
  };
  const [hasSelection, setHasSelection] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [scrollbar, setScrollbar] = useState({
    isVisible: false,
    thumbTopPercent: 0,
    thumbHeightPercent: 100,
  });

  useImperativeHandle(ref, () => ({
    focus() {
      terminalRef.current?.focus();
    },
    refit() {
      requestRefitRef.current?.();
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

    const mac = isMac();
    let isActive = true;
    let lastCols = -1;
    let lastRows = -1;
    let lastFitWidth = -1;
    let lastFitHeight = -1;
    let resizeFrame = 0;
    let ptyResizeTimer = 0;
    let lastPtyResizeAt = 0;
    let scrollbackHydrationToken = 0;
    let hydratingScrollback = false;
    let bufferedOutputDuringHydration = "";
    // Fit the canvas immediately; throttle (leading + trailing) the PTY resize
    // RPC so the agent sees cols updates ~40×/s during a drag — not only after
    // the user releases — while still coalescing rapid mount-time transitions.
    const PTY_RESIZE_THROTTLE_MS = 25;

    const hydrateScrollback = () => {
      const token = ++scrollbackHydrationToken;
      hydratingScrollback = true;
      bufferedOutputDuringHydration = "";
      void readBridge()
        .readTerminalScrollback({ threadId: terminalId })
        .then((scrollback) => {
          if (!isActive || token !== scrollbackHydrationToken) {
            return;
          }
          if (scrollback.length > 0) {
            terminal.reset();
            terminal.write(scrollback);
            bufferedOutputDuringHydration = "";
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!isActive || token !== scrollbackHydrationToken) {
            return;
          }
          hydratingScrollback = false;
          if (bufferedOutputDuringHydration.length > 0) {
            terminal.write(bufferedOutputDuringHydration);
            bufferedOutputDuringHydration = "";
          }
        });
    };
    const resetForNewPty = () => {
      scrollbackHydrationToken++;
      hydratingScrollback = false;
      bufferedOutputDuringHydration = "";
      terminal.reset();
      onResetRef.current?.();
    };

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: false,
      cursorStyle: "bar",
      cursorInactiveStyle: "outline",
      scrollback: 5_000,
      scrollSensitivity: useSharedSettings.getState().scrollSpeed,
      fastScrollSensitivity: 10,
      // Keep xterm's internal scrollbar gutter effectively zero; Lightcode
      // renders the visible scrollbar outside the terminal content area.
      scrollbar: { width: TERMINAL_INTERNAL_SCROLLBAR_WIDTH },
      fontSize: baseFontSizeRef.current,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontWeight: "normal",
      fontWeightBold: "bold",
      letterSpacing: 0,
      lineHeight: 1,
      minimumContrastRatio: 4.5,
      rescaleOverlappingGlyphs: true,
      macOptionIsMeta: true,
      wordSeparator: " ()[]{}'\",;:",
      theme: getTerminalTheme(appearance),
      vtExtensions: {
        kittyKeyboard: true,
        win32InputMode: true,
        colorSchemeQuery: true,
        kittySgrBoldFaintControl: true,
      },
      // OSC 8 hyperlinks (e.g. Next.js' "Local: http://localhost:3000" in WSL
      // emits \x1b]8;;URL\x07...\x1b]8;;\x07). Without a handler, xterm falls
      // back to a browser confirm() dialog; we route to the default browser.
      linkHandler: {
        activate: (_event, uri) => {
          openLink(uri);
        },
      },
    });
    const fit = new FitAddon();

    terminalRef.current = terminal;
    fitRef.current = fit;

    const flushPtyResize = () => {
      ptyResizeTimer = 0;
      if (!isActive) return;
      const cols = terminal.cols;
      const rows = terminal.rows;
      if (cols === lastCols && rows === lastRows) return;
      if (cols < 20 || rows < 5) return;

      lastCols = cols;
      lastRows = rows;

      onTerminalResizeRef.current?.({ cols, rows });

      void readBridge()
        .resizeTerminal({ threadId: terminalId, cols, rows })
        .catch(() => {
          // Ignore errors.
        });
    };

    const doFit = () => {
      if (!isActive || !mount) return;

      const width = mount.clientWidth;
      const height = mount.clientHeight;

      if (width === 0 || height === 0) {
        return;
      }

      if (width === lastFitWidth && height === lastFitHeight) {
        return;
      }
      lastFitWidth = width;
      lastFitHeight = height;

      // Shrink font in narrow/short panes (split panes, side panel, etc.) so
      // more columns fit before the agent's TUI starts hard-wrapping.
      const base = baseFontSizeRef.current;
      const desiredFontSize =
        width < 360 || height < 240 ? base - 2 : width < 540 || height < 360 ? base - 1 : base;
      if (terminal.options.fontSize !== desiredFontSize) {
        terminal.options.fontSize = desiredFontSize;
      }

      fit.fit();

      const now = performance.now();
      const elapsed = now - lastPtyResizeAt;
      if (elapsed >= PTY_RESIZE_THROTTLE_MS) {
        lastPtyResizeAt = now;
        flushPtyResize();
      } else if (ptyResizeTimer === 0) {
        ptyResizeTimer = window.setTimeout(() => {
          lastPtyResizeAt = performance.now();
          flushPtyResize();
        }, PTY_RESIZE_THROTTLE_MS - elapsed) as unknown as number;
      }
    };

    const scheduleResize = () => {
      if (!isActive || resizeFrame !== 0) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        if (!isActive) return;
        doFit();
      });
    };

    requestRefitRef.current = () => {
      lastFitWidth = -1;
      lastFitHeight = -1;
      scheduleResize();
    };

    const search = new SearchAddon();
    searchRef.current = search;

    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    const linkDisposable = terminal.registerLinkProvider(
      new TerminalLinkProvider(terminal, (_event, uri) => {
        openLink(uri);
      }),
    );

    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = "11";

    terminal.loadAddon(new ClipboardAddon());

    terminal.open(mount);

    // ── WebGL renderer with DOM fallback ────────────────────────
    // Match VSCode: prefer the GPU renderer, fall back to the DOM renderer
    // on context loss or initialization failure. ImageAddon is gated on
    // a healthy WebGL context (it relies on the GPU compositor).
    let webglAddon: WebglAddon | null = null;
    let webglContextLossDisposable: { dispose(): void } | null = null;
    try {
      webglAddon = new WebglAddon();
      webglContextLossDisposable = webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddon = null;
      });
      terminal.loadAddon(webglAddon);
      terminal.loadAddon(new ImageAddon());
    } catch {
      webglAddon?.dispose();
      webglAddon = null;
    }

    terminal.onBell(() => {
      onBellRef.current?.();
    });

    terminal.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    // ── Coalesced onWriteParsed handler ─────────────────────────
    // Both activity reporting and scroll-position tracking key off
    // parsed-write events; coalesce into one rAF-gated callback so we
    // do at most one setState per frame regardless of chunk frequency.
    const SCROLL_THRESHOLD = 15;
    let wasScrolledUp = false;
    let scrollCheckPending = false;
    const checkScrollPosition = () => {
      const scrolledUp =
        terminal.buffer.active.baseY - terminal.buffer.active.viewportY > SCROLL_THRESHOLD;
      if (scrolledUp !== wasScrolledUp) {
        wasScrolledUp = scrolledUp;
        setShowScrollDown(scrolledUp);
      }

      const maxScroll = terminal.buffer.active.baseY;
      if (maxScroll <= 0) {
        setScrollbar((previous) =>
          previous.isVisible
            ? { isVisible: false, thumbTopPercent: 0, thumbHeightPercent: 100 }
            : previous,
        );
        return;
      }

      const totalRows = terminal.buffer.active.baseY + terminal.rows;
      const thumbHeightPercent = Math.max(8, Math.min(100, (terminal.rows / totalRows) * 100));
      const thumbTopPercent = Math.min(
        100 - thumbHeightPercent,
        (terminal.buffer.active.viewportY / maxScroll) * (100 - thumbHeightPercent),
      );
      setScrollbar((previous) =>
        previous.isVisible &&
        Math.abs(previous.thumbTopPercent - thumbTopPercent) < 0.1 &&
        Math.abs(previous.thumbHeightPercent - thumbHeightPercent) < 0.1
          ? previous
          : { isVisible: true, thumbTopPercent, thumbHeightPercent },
      );
    };
    const scheduleParsedFlush = () => {
      if (scrollCheckPending) return;
      scrollCheckPending = true;
      requestAnimationFrame(() => {
        scrollCheckPending = false;
        onActivityRef.current?.();
        checkScrollPosition();
      });
    };
    terminal.onWriteParsed(scheduleParsedFlush);
    terminal.onScroll(scheduleParsedFlush);

    // ── Selection tracking ───────────────────────────────────────
    terminal.onSelectionChange(() => {
      setHasSelection(terminal.hasSelection());
    });

    // ── Copy shortcut: Ctrl+C / Cmd+C ───────────────────────────
    // Single Ctrl+C with selection → copy. Rapid Ctrl+C (within
    // 500 ms of a copy) → pass through as SIGINT so agents can
    // be interrupted with the usual double-Ctrl+C pattern.
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
        navigator.clipboard.readText().then(
          (text) => {
            if (text) {
              terminal.paste(text);
            }
          },
          // Swallow NotAllowedError (e.g. window not focused) — paste is a
          // best-effort UX action; failure must not crash the renderer.
          () => {},
        );
        return false;
      }

      // ── Close pane: Ctrl+W / Cmd+W ─────────────────────────────
      // Let the event bubble to the window handler instead of
      // being consumed as terminal word-erase.
      if (event.code === "KeyW") {
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
        resetForNewPty();
        return;
      }

      if (event.type === "thread-output" && event.threadId === terminalId) {
        if (hydratingScrollback) {
          bufferedOutputDuringHydration += event.data;
          return;
        }
        terminal.write(event.data);
        return;
      }

      if (event.type === "thread-exited" && event.threadId === terminalId) {
        onExitedRef.current?.(event.exitCode);
      }
    });

    hydrateScrollback();

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
      if (ptyResizeTimer !== 0) {
        clearTimeout(ptyResizeTimer);
      }
      webglContextLossDisposable?.dispose();
      webglAddon?.dispose();
      linkDisposable.dispose();
      unsubscribe();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      requestRefitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once: terminal is created once, readOnly/terminalId/appearance are captured at init
  }, []);

  useEffect(() => {
    requestRefitRef.current?.();
  }, [baseFontSize]);

  // The terminal is created once (mount-once effect above) and won't pick up
  // theme switches on its own. AppProvider rewrites the theme CSS vars in its
  // own effect; child effects fire before parent effects, so defer one frame to
  // read the freshly-applied values, then re-apply the palette in place.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (terminal) {
        terminal.options.theme = getTerminalTheme(appearance);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [appearance, themePreset]);

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
      navigator.clipboard.readText().then(
        (text) => {
          if (text) {
            terminal.paste(text);
          }
        },
        // See keydown handler above — silent failure is intentional.
        () => {},
      );
    } else if (key === "paste-in-input") {
      if (!terminal.hasSelection()) return;
      window.dispatchEvent(
        new CustomEvent("lightcode:paste-to-composer", { detail: terminal.getSelection() }),
      );
      terminal.clearSelection();
    }
  }

  function scrollTerminalFromTrackPointer(clientY: number) {
    const terminal = terminalRef.current;
    const track = scrollbarTrackRef.current;
    if (!terminal || !track) return;

    const maxScroll = terminal.buffer.active.baseY;
    if (maxScroll <= 0) return;

    const rect = track.getBoundingClientRect();
    const thumbHeight = (scrollbar.thumbHeightPercent / 100) * rect.height;
    const travel = rect.height - thumbHeight;
    if (travel <= 0) return;

    const top = Math.max(0, Math.min(travel, clientY - rect.top - thumbHeight / 2));
    terminal.scrollToLine(Math.round((top / travel) * maxScroll));
  }

  function handleScrollbarPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    scrollTerminalFromTrackPointer(event.clientY);

    const onPointerMove = (moveEvent: PointerEvent) => {
      scrollTerminalFromTrackPointer(moveEvent.clientY);
    };
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  }

  return (
    <ContextMenu items={contextMenuItems} onAction={handleContextMenuAction}>
      <div
        className={`lightcode-terminal-shell relative h-full w-full overflow-visible ${className ?? ""}`}
        style={
          {
            "--lightcode-terminal-scrollbar-width": `${TERMINAL_SCROLLBAR_WIDTH}px`,
          } as CSSProperties
        }
      >
        <div ref={mountRef} className="lightcode-terminal-pane h-full min-w-0 overflow-hidden" />
        <div
          ref={scrollbarTrackRef}
          className={`lightcode-terminal-scrollbar absolute bottom-0 right-0 top-0 ${
            scrollbar.isVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onPointerDown={handleScrollbarPointerDown}
        >
          <div
            className="lightcode-terminal-scrollbar__thumb"
            style={{
              height: `${scrollbar.thumbHeightPercent}%`,
              top: `${scrollbar.thumbTopPercent}%`,
            }}
          />
        </div>
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
