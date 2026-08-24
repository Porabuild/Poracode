import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { TerminalLinkProvider } from "./TerminalLinkProvider";
import { resolveTerminalColor } from "./terminalColors";
import { TERMINAL_FONT_FAMILY } from "./terminalPrewarm";
import { Terminal } from "@xterm/xterm";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
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
import { MAX_TERMINAL_COLS, MAX_TERMINAL_ROWS, type TerminalSize } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadOutputStore } from "@/renderer/state/threadOutputStore";
import { isMac, readBridge } from "@/renderer/bridge";
import { ContextMenu, type ContextMenuItem } from "@/renderer/components/common/ContextMenu";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { FindBar } from "@/renderer/components/find/FindBar";
import {
  clearActiveTerminalFind,
  setActiveTerminalFind,
} from "@/renderer/components/find/terminalFindBridge";
import { floatingGlassSurfaceClass } from "@/renderer/components/layout/floatingGlass";

/** Decoration colors for in-terminal find matches (kept in sync with the CSS
 * highlight colors used elsewhere: amber for matches, orange for the active). */
const TERMINAL_FIND_DECORATIONS = {
  matchBackground: "#facc1566",
  matchBorder: "#facc15",
  matchOverviewRuler: "#facc15",
  activeMatchBackground: "#f97316",
  activeMatchBorder: "#f97316",
  activeMatchColorOverviewRuler: "#f97316",
} as const;

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
// the terminal too. The raw custom-property values use modern color syntax
// (`oklch(...)`, `color-mix(...)`) that xterm's renderer cannot parse, so each is
// normalized to an xterm-safe `#hex`/`rgba()` string; we fall back to fixed
// light/dark values when a property is unset or unparseable.
function getTerminalTheme(appearance: "light" | "dark", backgroundVar = "--content-background") {
  const rootStyles =
    typeof window !== "undefined" ? window.getComputedStyle(document.documentElement) : null;
  const readVar = (name: string) =>
    resolveTerminalColor(rootStyles?.getPropertyValue(name).trim() ?? "");

  const fallback =
    appearance === "dark"
      ? { background: "#2b2a2f", foreground: "#e7edf6", cursor: "#94bfff" }
      : { background: "#f1f1ef", foreground: "#132034", cursor: "#1d4c89" };

  return {
    background: readVar(backgroundVar) || fallback.background,
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
    /** Mobile browsers are more reliable with xterm's default DOM renderer. */
    preferDomRenderer?: boolean;
    /** Whether this mounted keep-alive surface is currently visible. */
    visible?: boolean;
    /** Keep xterm's local buffer at the canonical PTY size instead of fitting. */
    fixedTerminalSize?: TerminalSize;
    /** Whether a visual fit should resize the backing PTY. */
    resizeTerminalOnFit?: boolean;
    /** Translate touch drags into xterm wheel events for mobile/PWA terminals. */
    touchScrollEnabled?: boolean;
    /** Keep touch gestures from focusing xterm's hidden textarea. */
    suppressTouchKeyboard?: boolean;
    /**
     * CSS custom property the terminal background is read from. Surfaces that
     * sit directly on the app background (the mobile terminal screen) pass
     * `--background` so the canvas blends into the page.
     */
    themeBackgroundVar?: string;
    /**
     * Pluggable output feed. When provided (the remote PWA), the surface gets
     * PTY bytes / reset / exit through this subscription instead of the local
     * supervisor IPC event stream. Returns an unsubscribe.
     */
    outputSource?: (listener: {
      onOutput: (data: string) => void;
      onReset: () => void;
      onExited: (exitCode: number | null) => void;
    }) => () => void;
    /** Override PTY input/resize for a terminal hosted on a remote Poracode server. */
    writeInput?: (data: string) => Promise<void>;
    resizeBackingTerminal?: (size: TerminalSize) => Promise<void>;
    /**
     * Initial scrollback to hydrate with, instead of reading it over the bridge
     * (the PWA already has it from the thread snapshot, or none for a fresh
     * shell). An empty string hydrates nothing but still skips the bridge read.
     */
    initialScrollback?: string;
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
    preferDomRenderer = false,
    visible = true,
    fixedTerminalSize,
    resizeTerminalOnFit = true,
    touchScrollEnabled = false,
    suppressTouchKeyboard = false,
    themeBackgroundVar = "--content-background",
    outputSource,
    initialScrollback,
    writeInput,
    resizeBackingTerminal,
  } = props;
  const { t } = useLingui();
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
  const writeInputRef: RefObject<typeof writeInput> = useRef(writeInput);
  writeInputRef.current = writeInput;
  const resizeBackingTerminalRef: RefObject<typeof resizeBackingTerminal> =
    useRef(resizeBackingTerminal);
  resizeBackingTerminalRef.current = resizeBackingTerminal;
  const baseFontSizeRef = useRef(baseFontSize);
  baseFontSizeRef.current = baseFontSize;
  const requestRefitRef = useRef<(() => void) | null>(null);
  const revealRef = useRef<(() => void) | null>(null);
  const previousVisibleRef = useRef(visible);
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
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findResult, setFindResult] = useState<{ count: number; index: number }>({
    count: 0,
    index: -1,
  });
  const [findOpenToken, setFindOpenToken] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);
  // Stable controller registered with the find bridge on focus so the global
  // Find command can open this terminal's find bar. Closure uses only stable
  // setters, so creating it once is safe.
  const findControllerRef = useRef({
    open: () => {
      setFindOpen(true);
      setFindOpenToken((token) => token + 1);
    },
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
    let scrollbackHydrationToken = 0;
    let hydratingScrollback = false;
    let bufferedOutputDuringHydration = "";
    // Fit the canvas every frame for live visual feedback, but DEBOUNCE the PTY
    // resize RPC, mirroring VS Code's TerminalResizeDebouncer. A full-height
    // repaint-in-place TUI (Claude no-flicker, codex) re-emits its whole frame
    // on every SIGWINCH, and a continuous drag firing ~40 resizes/sec piled
    // those repaints up as duplicate frames in scrollback ("artifacts on top" +
    // a growing scrollbar). While the normal buffer is still small there is
    // nothing to orphan, so resize immediately (snappy, and cheap for alt-screen
    // apps whose normal buffer stays small); past the threshold, debounce so a
    // drag coalesces to one resize/repaint. Constants from microsoft/vscode
    // terminalResizeDebouncer.ts (DebounceResizeXDelay, StartDebouncingThreshold).
    const PTY_RESIZE_DEBOUNCE_MS = 100;
    const RESIZE_DEBOUNCE_BUFFER_THRESHOLD = 200;

    // Resolve the PTY backend: a caller-provided override (a terminal hosted on
    // a remote Poracode server) or the local supervisor bridge. Each reads its
    // ref lazily so a later prop update is still honored.
    const writeInputToPty = (data: string): Promise<void> =>
      writeInputRef.current
        ? writeInputRef.current(data)
        : readBridge().writeTerminal({ threadId: terminalId, data });
    const resizeBackingPty = (size: TerminalSize): Promise<void> =>
      resizeBackingTerminalRef.current
        ? resizeBackingTerminalRef.current(size)
        : readBridge().resizeTerminal({ threadId: terminalId, cols: size.cols, rows: size.rows });
    const backingTerminalSize = (): TerminalSize => ({
      cols: Math.min(terminal.cols, MAX_TERMINAL_COLS),
      rows: Math.min(terminal.rows, MAX_TERMINAL_ROWS),
    });

    // Force the live agent to repaint a clean full frame. On reopen the PTY kept
    // running at the same winsize, so a fresh same-size fit issues a no-op
    // TIOCSWINSZ that the kernel never turns into SIGWINCH — a no-alt-screen
    // repaint-in-place agent (Claude Code's no-flicker TUI, Command Code) thus
    // never redraws and its bottom input row can be missing until the user
    // manually resizes the window. Send one deliberate winsize delta so the
    // kernel delivers SIGWINCH and the agent emits a fresh frame over the
    // (possibly stale / byte-sliced) replayed scrollback.
    const forceAgentRepaint = () => {
      if (!isActive) return;
      const { cols, rows } = backingTerminalSize();
      if (cols < 20 || rows < 5) return;
      // Pin our throttle bookkeeping to the REAL size so the next doFit doesn't
      // also fire a (now-redundant) resize for the same dimensions.
      lastCols = cols;
      lastRows = rows;
      const intermediateRows = rows > 5 ? rows - 1 : rows + 1;
      void resizeBackingPty({ cols, rows: intermediateRows }).catch(() => {});
      requestAnimationFrame(() => {
        if (!isActive) return;
        void resizeBackingPty({ cols, rows }).catch(() => {});
      });
    };

    const hydrateScrollback = () => {
      const token = ++scrollbackHydrationToken;
      hydratingScrollback = true;
      bufferedOutputDuringHydration = "";
      // Caller-supplied scrollback (the PWA) hydrates synchronously — no bridge
      // round-trip, so live output that arrives next isn't buffered/lost.
      if (initialScrollback !== undefined) {
        if (initialScrollback.length > 0) {
          terminal.reset();
          terminal.write(initialScrollback);
        }
        hydratingScrollback = false;
        if (bufferedOutputDuringHydration.length > 0) {
          terminal.write(bufferedOutputDuringHydration);
          bufferedOutputDuringHydration = "";
        }
        return;
      }
      let restoredScrollback = false;
      // Prefer the renderer-side accumulator (threadOutputStore): it keeps a
      // bounded append-only copy of this thread's PTY bytes across pane
      // switches, so re-opening a repaint-in-place agent (Claude no-flicker,
      // Command Code) restores what the terminal actually displayed. The
      // supervisor transcript read remains the fallback (e.g. when the store
      // was reset or this surface mounted before any output was fed).
      const localScrollback = useThreadOutputStore.getState().readTail(terminalId, 100_000);
      const applyScrollback = (scrollback: string) => {
        if (!isActive || token !== scrollbackHydrationToken) {
          return;
        }
        if (scrollback.length > 0) {
          terminal.reset();
          terminal.write(scrollback);
          bufferedOutputDuringHydration = "";
          restoredScrollback = true;
        }
      };
      if (localScrollback.length > 0) {
        applyScrollback(localScrollback);
        hydratingScrollback = false;
        forceAgentRepaint();
        return;
      }
      void readBridge()
        .readTerminalScrollback({ threadId: terminalId })
        .then((scrollback) => {
          // If the accumulator already hydrated (or was invalidated by a
          // thread-reset), don't replay the transcript over it.
          if (restoredScrollback || !isActive || token !== scrollbackHydrationToken) {
            return;
          }
          applyScrollback(scrollback);
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
          // Reopen of an existing session: nudge the live agent into a fresh
          // repaint over the replayed (and possibly stale) frame.
          if (restoredScrollback) {
            forceAgentRepaint();
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
      // Keep xterm's internal scrollbar gutter effectively zero; Poracode
      // renders the visible scrollbar outside the terminal content area.
      scrollbar: { width: TERMINAL_INTERNAL_SCROLLBAR_WIDTH },
      fontSize: baseFontSizeRef.current,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontWeight: "normal",
      fontWeightBold: "bold",
      letterSpacing: 0,
      lineHeight: 1,
      minimumContrastRatio: 4.5,
      rescaleOverlappingGlyphs: true,
      macOptionIsMeta: true,
      wordSeparator: " ()[]{}'\",;:",
      theme: getTerminalTheme(appearance, themeBackgroundVar),
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
      const { cols, rows } = backingTerminalSize();
      if (cols === lastCols && rows === lastRows) return;
      if (cols < 20 || rows < 5) return;

      lastCols = cols;
      lastRows = rows;

      onTerminalResizeRef.current?.({ cols, rows });

      void resizeBackingPty({ cols, rows }).catch(() => {
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

      // A no-alt-screen full-height TUI (Claude no-flicker, Command Code)
      // repaints in the main buffer, so a row change during a refit can leave
      // the viewport parked on stale scrollback instead of the live frame —
      // reading as "the window resized but the terminal scrolled instead of
      // repainting". Re-pin to the bottom after fitting, but only when the user
      // hadn't deliberately scrolled up (so we never steal an intentional
      // scroll-back). In an alternate-screen buffer baseY is 0, so this is a
      // no-op there.
      const wasPinnedToBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY;

      if (fixedTerminalSize) {
        if (terminal.cols !== fixedTerminalSize.cols || terminal.rows !== fixedTerminalSize.rows) {
          terminal.resize(fixedTerminalSize.cols, fixedTerminalSize.rows);
        }
        lastCols = fixedTerminalSize.cols;
        lastRows = fixedTerminalSize.rows;
        onTerminalResizeRef.current?.(fixedTerminalSize);
        if (wasPinnedToBottom) {
          terminal.scrollToBottom();
        }
        return;
      }

      fit.fit();

      if (wasPinnedToBottom) {
        terminal.scrollToBottom();
      }

      // Resize immediately while the normal buffer is small (nothing to orphan
      // yet); once it holds real content, debounce so a continuous drag settles
      // to one resize/repaint instead of a per-frame storm. Restart the timer on
      // every fit so only the final size reaches the agent.
      if (ptyResizeTimer !== 0) {
        clearTimeout(ptyResizeTimer);
        ptyResizeTimer = 0;
      }
      if (!resizeTerminalOnFit) {
        onTerminalResizeRef.current?.(backingTerminalSize());
      } else if (terminal.buffer.normal.length < RESIZE_DEBOUNCE_BUFFER_THRESHOLD) {
        flushPtyResize();
      } else {
        ptyResizeTimer = window.setTimeout(() => {
          flushPtyResize();
        }, PTY_RESIZE_DEBOUNCE_MS) as unknown as number;
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
    revealRef.current = () => {
      requestRefitRef.current?.();
      requestAnimationFrame(() => {
        if (!isActive) return;
        terminal.refresh(0, terminal.rows - 1);
        forceAgentRepaint();
      });
    };

    const search = new SearchAddon();
    searchRef.current = search;
    const searchResultsDisposable = search.onDidChangeResults((event) => {
      setFindResult({ count: event.resultCount, index: event.resultIndex });
    });
    const findController = findControllerRef.current;
    const onTerminalFocusIn = () => setActiveTerminalFind(findController);
    mount.addEventListener("focusin", onTerminalFocusIn);

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
    const focusTerminalOnPointerDown = (event: PointerEvent) => {
      if (suppressTouchKeyboard && event.pointerType === "touch") {
        event.stopPropagation();
        return;
      }
      terminal.focus();
    };
    mount.addEventListener("pointerdown", focusTerminalOnPointerDown, { capture: true });

    let touchScrollY: number | null = null;
    let touchScrollRemainder = 0;
    // Resolved once: xterm creates the viewport synchronously in open() and keeps
    // it for the surface's lifetime, so we skip a DOM query per touchmove.
    const touchWheelTarget =
      mount.querySelector(".xterm-viewport") ?? mount.querySelector(".xterm") ?? mount;
    const dispatchWheelFromTouch = (touch: Touch, deltaY: number) => {
      const wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: touch.clientX,
        clientY: touch.clientY,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        deltaY,
      });
      return !touchWheelTarget.dispatchEvent(wheelEvent);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (!touchScrollEnabled) return;
      event.stopPropagation();
      if (suppressTouchKeyboard) {
        event.preventDefault();
      }
      if (event.touches.length !== 1) {
        touchScrollY = null;
        touchScrollRemainder = 0;
        return;
      }
      touchScrollY = event.touches[0]?.clientY ?? null;
      touchScrollRemainder = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touchScrollEnabled) return;
      if (touchScrollY === null || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      event.stopPropagation();

      const deltaY = touchScrollY - touch.clientY;
      touchScrollY = touch.clientY;
      if (deltaY === 0) return;
      if (dispatchWheelFromTouch(touch, deltaY)) return;

      const rowHeight = terminal.rows > 0 ? mount.clientHeight / terminal.rows : 0;
      if (rowHeight <= 0) return;
      const rawLines = deltaY / rowHeight + touchScrollRemainder;
      const lines = rawLines > 0 ? Math.floor(rawLines) : Math.ceil(rawLines);
      touchScrollRemainder = rawLines - lines;
      if (lines === 0) return;

      terminal.scrollLines(lines);
      checkScrollPosition();
    };
    const onTouchEnd = () => {
      touchScrollY = null;
      touchScrollRemainder = 0;
    };
    mount.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    mount.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    mount.addEventListener("touchend", onTouchEnd, { capture: true });
    mount.addEventListener("touchcancel", onTouchEnd, { capture: true });

    // ── WebGL renderer with DOM fallback ────────────────────────
    // Match VSCode: prefer the GPU renderer, fall back to the DOM renderer
    // on context loss or initialization failure. ImageAddon is gated on
    // a healthy WebGL context (it relies on the GPU compositor).
    let webglAddon: WebglAddon | null = null;
    let webglContextLossDisposable: { dispose(): void } | null = null;
    if (!preferDomRenderer) {
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
        void writeInputToPty(data).catch(() => {
          // PTY may disappear during teardown; ignore stale writes.
        });
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });
    resizeObserver.observe(mount);

    // Terminal lifecycle feed (stays alive for the terminal's whole lifecycle).
    // Output/reset/exit handlers are shared between the local supervisor IPC
    // stream (desktop) and a caller-provided feed (the remote PWA's WebSocket).
    const handleReset = () => resetForNewPty();
    const handleOutput = (data: string) => {
      if (hydratingScrollback) {
        bufferedOutputDuringHydration += data;
        return;
      }
      terminal.write(data);
    };
    const handleExited = (exitCode: number | null) => {
      onExitedRef.current?.(exitCode);
    };

    const unsubscribe = outputSource
      ? outputSource({ onOutput: handleOutput, onReset: handleReset, onExited: handleExited })
      : readBridge().onSupervisorEvent((event) => {
          if (event.type === "thread-reset" && event.threadId === terminalId) {
            handleReset();
          } else if (event.type === "thread-output" && event.threadId === terminalId) {
            handleOutput(event.data);
          } else if (event.type === "thread-exited" && event.threadId === terminalId) {
            handleExited(event.exitCode);
          }
        });

    // Fit synchronously before hydrating: reading clientWidth forces layout, so
    // in a real browser the terminal is already at the viewport width when the
    // (async) scrollback replay writes — otherwise the raw transcript is written
    // at xterm's 80-col default and then reflowed, garbling a restored
    // full-height TUI frame. No-op when the pane has no layout yet (e.g. tests).
    doFit();
    hydrateScrollback();

    // Double-rAF backstop in case layout hadn't settled at mount.
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
      searchResultsDisposable.dispose();
      mount.removeEventListener("pointerdown", focusTerminalOnPointerDown, { capture: true });
      mount.removeEventListener("touchstart", onTouchStart, { capture: true });
      mount.removeEventListener("touchmove", onTouchMove, { capture: true });
      mount.removeEventListener("touchend", onTouchEnd, { capture: true });
      mount.removeEventListener("touchcancel", onTouchEnd, { capture: true });
      mount.removeEventListener("focusin", onTerminalFocusIn);
      clearActiveTerminalFind(findController);
      unsubscribe();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      requestRefitRef.current = null;
      revealRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once: terminal is created once, readOnly/terminalId/appearance/touch behavior are captured at init
  }, []);

  useEffect(() => {
    const wasVisible = previousVisibleRef.current;
    previousVisibleRef.current = visible;
    if (visible && !wasVisible) {
      revealRef.current?.();
    }
  }, [visible]);

  useEffect(() => {
    requestRefitRef.current?.();
  }, [baseFontSize]);

  // Re-run the search (highlighting all matches and jumping to the nearest) as
  // the query/case toggle changes; clear decorations when find closes or empties.
  useEffect(() => {
    const search = searchRef.current;
    if (!search) return;
    if (findOpen && findQuery) {
      search.findNext(findQuery, {
        caseSensitive: findCaseSensitive,
        incremental: true,
        decorations: TERMINAL_FIND_DECORATIONS,
      });
    } else {
      search.clearDecorations();
      setFindResult({ count: 0, index: -1 });
    }
  }, [findOpen, findQuery, findCaseSensitive]);

  useEffect(() => {
    if (!findOpen) return;
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [findOpen, findOpenToken]);

  function stepTerminalFind(direction: "next" | "prev") {
    const search = searchRef.current;
    if (!search || !findQuery) return;
    const options = { caseSensitive: findCaseSensitive, decorations: TERMINAL_FIND_DECORATIONS };
    if (direction === "next") search.findNext(findQuery, options);
    else search.findPrevious(findQuery, options);
  }

  function closeTerminalFind() {
    setFindOpen(false);
    searchRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }

  // The terminal is created once (mount-once effect above) and won't pick up
  // theme switches on its own. AppProvider rewrites the theme CSS vars in its
  // own effect; child effects fire before parent effects, so defer one frame to
  // read the freshly-applied values, then re-apply the palette in place.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (terminal) {
        terminal.options.theme = getTerminalTheme(appearance, themeBackgroundVar);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [appearance, themePreset, themeBackgroundVar]);

  const contextMenuItems: ContextMenuItem[] = [
    { id: "copy", label: t`Copy`, isDisabled: !hasSelection },
    ...(!readOnly ? [{ id: "paste", label: t`Paste` }] : []),
    { id: "paste-in-input", label: t`Paste in input`, isDisabled: !hasSelection },
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
        new CustomEvent("poracode:paste-to-composer", { detail: terminal.getSelection() }),
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
        className={`poracode-terminal-shell relative h-full w-full overflow-visible ${className ?? ""}`}
        style={
          {
            "--poracode-terminal-scrollbar-width": `${TERMINAL_SCROLLBAR_WIDTH}px`,
          } as CSSProperties
        }
      >
        <div
          ref={mountRef}
          className={`poracode-terminal-pane h-full ${
            fixedTerminalSize ? "min-w-max overflow-visible" : "min-w-0 overflow-hidden"
          }`}
        />
        {findOpen ? (
          <div className="pointer-events-auto absolute right-2 top-2 z-20">
            <FindBar
              ref={findInputRef}
              query={findQuery}
              onQueryChange={setFindQuery}
              caseSensitive={findCaseSensitive}
              onToggleCaseSensitive={() => setFindCaseSensitive((value) => !value)}
              matchCount={findResult.count}
              currentIndex={findResult.index}
              onNext={() => stepTerminalFind("next")}
              onPrev={() => stepTerminalFind("prev")}
              onClose={closeTerminalFind}
              placeholder={t`Find in terminal`}
            />
          </div>
        ) : null}
        <div
          ref={scrollbarTrackRef}
          className={`poracode-terminal-scrollbar absolute bottom-0 right-0 top-0 ${
            scrollbar.isVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onPointerDown={handleScrollbarPointerDown}
        >
          <div
            className="poracode-terminal-scrollbar__thumb"
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
          aria-label={t`Scroll to bottom`}
          onPress={() => terminalRef.current?.scrollToBottom()}
          /* Centered via a negative margin, matching the chat pane without
             conflicting with HeroUI's pressed-state transform. */
          className={`${floatingGlassSurfaceClass} absolute bottom-4 left-1/2 z-10 -ml-3.5 size-7 min-w-0 rounded-full transition-opacity duration-200 ease-out ${
            showScrollDown ? "opacity-80 hover:opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <ArrowDown className="size-3.5" strokeWidth={2.5} />
        </Button>
      </div>
    </ContextMenu>
  );
});
