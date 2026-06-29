import { useEffect, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight, Globe, Keyboard, Loader2, Plus, RotateCw, X } from "lucide-react";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { RemoteBrowserKey, RemoteBrowserTab } from "@/shared/remote";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import { BrowserEmptyState } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/parts/BrowserEmptyState";
import { BrowserTabStrip } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/parts/BrowserTabStrip";
import { getRemoteBridgeClient } from "../bridge";
import { BottomSheet, useSheet } from "../components";
import { useMediaQuery, WIDE_SHELL_QUERY } from "../useMediaQuery";
import {
  pauseBrowserWatch,
  resumeBrowserWatch,
  sendBrowserInput,
  startBrowserWatch,
  stopBrowserWatch,
  useBrowserMirrorStore,
  type BrowserMirrorFrame,
} from "../browserMirror";

const DEFAULT_HOME = "https://www.google.com";

function runBrowserAction(action: Promise<unknown>): void {
  void action.catch((error: unknown) => {
    toast.danger(friendlyError(error));
  });
}

const LOCALHOST_PATTERN =
  /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[(?:[0-9a-f:]+)\])(?::\d+)?(?:[/?#]|$)/i;

/** Same address heuristics as the desktop toolbar. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("about:")) {
    return trimmed;
  }
  if (LOCALHOST_PATTERN.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/\s/.test(trimmed) || !/\./.test(trimmed)) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  return `https://${trimmed}`;
}

/** Compact address shown in the pill, like mobile browsers show the host. */
function hostOf(url: string): string {
  if (!url || url === "about:blank") return "";
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Drags shorter than this (page CSS px) still count as a tap. */
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
const MAX_ZOOM = 4;

const FORWARDED_KEYS: Record<string, RemoteBrowserKey> = {
  Enter: "enter",
  Backspace: "backspace",
  Tab: "tab",
  Escape: "escape",
  ArrowUp: "arrow-up",
  ArrowDown: "arrow-down",
  ArrowLeft: "arrow-left",
  ArrowRight: "arrow-right",
};

interface TouchGesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  scrolled: boolean;
  cancelled: boolean;
}

interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * The mirrored page. One finger is remote input — taps and pans go to the
 * page itself (pans as wheel deltas). Two fingers zoom/pan the mirror image
 * locally, like a VNC viewer; coordinates keep mapping correctly because they
 * are derived from the transformed image's bounding box.
 */
function MirrorSurface(props: { readonly frame: BrowserMirrorFrame }) {
  const { t } = useLingui();
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<TouchGesture | null>(null);
  const viewRef = useRef<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const metadata = props.frame.metadata;

  function applyView() {
    const view = viewRef.current;
    const zoom = zoomRef.current;
    if (zoom) {
      zoom.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
    }
  }

  /** Maps a client point into the page's CSS pixel space. The image rect
   * already reflects the local zoom transform, so the same letterbox math
   * holds at every zoom level. */
  function pagePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const img = imgRef.current;
    if (!img || metadata.deviceWidth <= 0 || metadata.deviceHeight <= 0) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scale = Math.min(rect.width / metadata.deviceWidth, rect.height / metadata.deviceHeight);
    if (scale <= 0) return null;
    const contentLeft = rect.left + (rect.width - metadata.deviceWidth * scale) / 2;
    const contentTop = rect.top + (rect.height - metadata.deviceHeight * scale) / 2;
    const x = (clientX - contentLeft) / scale;
    const y = (clientY - contentTop) / scale;
    if (x < 0 || y < 0 || x > metadata.deviceWidth || y > metadata.deviceHeight) return null;
    return { x, y };
  }

  function hostRect(): DOMRect | null {
    return zoomRef.current?.parentElement?.getBoundingClientRect() ?? null;
  }

  function pinchStateFrom(): { dist: number; cx: number; cy: number } | null {
    const points = [...pointersRef.current.values()];
    const [a, b] = points;
    if (!a || !b) return null;
    return {
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }

  function applyPinch(next: { dist: number; cx: number; cy: number }): void {
    const prev = pinchRef.current;
    const rect = hostRect();
    if (!prev || !rect) return;
    const view = viewRef.current;
    const nextScale = Math.min(MAX_ZOOM, Math.max(1, view.scale * (next.dist / prev.dist)));
    const factor = nextScale / view.scale;
    // Keep the pinch centroid anchored, then pan by the centroid travel.
    const cx = next.cx - rect.left;
    const cy = next.cy - rect.top;
    let tx = cx - factor * (cx - view.tx) + (next.cx - prev.cx);
    let ty = cy - factor * (cy - view.ty) + (next.cy - prev.cy);
    if (nextScale === 1) {
      tx = 0;
      ty = 0;
    } else {
      tx = Math.min(0, Math.max(rect.width * (1 - nextScale), tx));
      ty = Math.min(0, Math.max(rect.height * (1 - nextScale), ty));
    }
    viewRef.current = { scale: nextScale, tx, ty };
    pinchRef.current = next;
    applyView();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size === 2) {
      // Second finger: stop forwarding to the page, start the local pinch.
      if (gestureRef.current) gestureRef.current.cancelled = true;
      pinchRef.current = pinchStateFrom();
      return;
    }
    if (pointersRef.current.size > 2) return;
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      startedAt: performance.now(),
      scrolled: false,
      cancelled: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const next = pinchStateFrom();
      if (next) applyPinch(next);
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.cancelled || gesture.pointerId !== event.pointerId) return;
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    const deltaX = gesture.lastX - point.x;
    const deltaY = gesture.lastY - point.y;
    if (!gesture.scrolled) {
      const travel = Math.hypot(point.x - gesture.startX, point.y - gesture.startY);
      if (travel < TAP_SLOP_PX) return;
      gesture.scrolled = true;
    }
    gesture.lastX = point.x;
    gesture.lastY = point.y;
    if (deltaX === 0 && deltaY === 0) return;
    // Finger-drag pans the page: dragging up scrolls down, i.e. wheel deltas.
    sendBrowserInput({
      kind: "scroll",
      x: gesture.startX,
      y: gesture.startY,
      deltaX,
      deltaY,
    });
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (gesture.cancelled || gesture.scrolled) return;
    if (event.type !== "pointerup") return;
    if (performance.now() - gesture.startedAt > TAP_MAX_MS) return;
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    sendBrowserInput({ kind: "tap", x: point.x, y: point.y });
  }

  return (
    <div
      className="m-browser__surface"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div ref={zoomRef} className="m-browser__zoom">
        <img
          ref={imgRef}
          alt={t`Mirrored desktop browser tab`}
          draggable={false}
          src={props.frame.dataUrl}
        />
      </div>
    </div>
  );
}

/**
 * Live keyboard relay. Keystrokes are forwarded to the page's focused element
 * as they happen (text via Input.insertText, control keys as key events) and
 * never accumulate locally — the mirrored page is the echo.
 */
function TypingBar(props: { readonly onClose: () => void }) {
  const { t } = useLingui();
  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const mapped = FORWARDED_KEYS[event.key];
    if (!mapped) return;
    event.preventDefault();
    sendBrowserInput({ kind: "key", key: mapped });
  }

  function onBeforeInput(event: FormEvent<HTMLInputElement>) {
    const native = event.nativeEvent as InputEvent;
    const inputType = native.inputType ?? "";
    if (inputType.startsWith("insert") && native.data) {
      event.preventDefault();
      sendBrowserInput({ kind: "insert-text", text: native.data });
      return;
    }
    if (inputType === "deleteContentBackward") {
      event.preventDefault();
      sendBrowserInput({ kind: "key", key: "backspace" });
    }
  }

  return (
    <div className="m-browser__typing">
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the bar exists to summon the phone keyboard
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={t`Type into the page (tap a field first)`}
        value=""
        onBeforeInput={onBeforeInput}
        onChange={() => {}}
        onKeyDown={onKeyDown}
      />
      <Button
        isIconOnly
        aria-label={t`Hide keyboard`}
        size="sm"
        variant="tertiary"
        onPress={props.onClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Mobile-browser style address pill: shows the host centered while idle,
 * expands to the full editable URL on tap, with reload on the trailing edge.
 */
function AddressPill(props: { readonly activeTab: RemoteBrowserTab | null }) {
  const { activeTab } = props;
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  function startEditing() {
    setValue(activeTab?.url === "about:blank" ? "" : (activeTab?.url ?? ""));
    setEditing(true);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setEditing(false);
    const url = normalizeUrl(value);
    if (!url) return;
    const bridge = readBridge();
    if (activeTab) {
      runBrowserAction(bridge.browserNavigate({ tabId: activeTab.tabId, url }));
    } else {
      runBrowserAction(bridge.browserCreateTab({ url, activate: true }));
    }
  }

  if (editing) {
    return (
      <form className="m-browser__address" onSubmit={onSubmit}>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- entered via an explicit tap on the pill
          autoFocus
          className="m-browser__address-input"
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={t`Search or enter address`}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => setEditing(false)}
        />
      </form>
    );
  }

  const host = hostOf(activeTab?.url ?? "");
  return (
    <div className="m-browser__address">
      <button
        type="button"
        className="m-browser__address-main"
        title={activeTab?.url}
        onClick={startEditing}
      >
        {activeTab?.loading ? <Loader2 className="m-spin size-3.5 shrink-0" /> : null}
        <span data-placeholder={host ? undefined : "true"}>
          {host || t`Search or enter address`}
        </span>
      </button>
      <button
        type="button"
        className="m-browser__address-action"
        aria-label={t`Reload`}
        disabled={!activeTab}
        onClick={() =>
          activeTab && runBrowserAction(readBridge().browserReload({ tabId: activeTab.tabId }))
        }
      >
        <RotateCw className="size-3.5" />
      </button>
    </div>
  );
}

function TabFavicon(props: { readonly tab: RemoteBrowserTab }) {
  if (props.tab.loading) {
    return <Loader2 className="m-spin size-4 shrink-0" />;
  }
  if (props.tab.faviconUrl) {
    return (
      <img
        src={props.tab.faviconUrl}
        alt=""
        className="size-4 shrink-0 rounded-[2px]"
        loading="lazy"
        draggable={false}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return <Globe className="size-4 shrink-0" />;
}

/** Bottom-sheet tab switcher behind the tab-count button. */
function TabSheet(props: {
  readonly tabs: readonly RemoteBrowserTab[];
  readonly activeTabId: string | null;
  readonly closing?: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  function createTab() {
    runBrowserAction(readBridge().browserCreateTab({ url: DEFAULT_HOME, activate: true }));
    props.onClose();
  }

  return (
    <BottomSheet
      label={t`Browser tabs`}
      closeLabel={t`Close tab switcher`}
      closing={props.closing}
      onClose={props.onClose}
    >
      <div className="m-sheet-head">
        <span>
          <Trans>Tabs</Trans>
        </span>
        <Button isIconOnly aria-label={t`New tab`} size="sm" variant="tertiary" onPress={createTab}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="m-sheet-list">
        {props.tabs.map((tab) => {
          const title = tab.title || tab.url || t`New tab`;
          const closeTarget = tab.title || t`tab`;
          const closeLabel = t`Close ${closeTarget}`;
          return (
            <div
              key={tab.tabId}
              className="m-thread-row m-tab-row"
              data-active={tab.tabId === props.activeTabId || undefined}
            >
              <button
                type="button"
                className="m-tab-row__main"
                onClick={() => {
                  runBrowserAction(readBridge().browserActivateTab({ tabId: tab.tabId }));
                  props.onClose();
                }}
              >
                <TabFavicon tab={tab} />
                <span className="m-thread-row__body">
                  <span className="m-thread-row__title">{title}</span>
                  <span className="m-thread-row__meta">
                    <span className="m-thread-row__meta-text">
                      {hostOf(tab.url) || "about:blank"}
                    </span>
                  </span>
                </span>
              </button>
              <Button
                isIconOnly
                aria-label={closeLabel}
                size="sm"
                variant="tertiary"
                onPress={() => runBrowserAction(readBridge().browserCloseTab({ tabId: tab.tabId }))}
              >
                <X className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

const desktopToolbarButtonClass = `${panelHeaderIconButtonClass} disabled:pointer-events-none disabled:opacity-35`;

/** Wide-shell chrome: the desktop BrowserToolbar's layout, minus desktop-only
 * tools (element picker, devtools, clear-data menu) and plus the keyboard
 * relay toggle. Tabs render through the reused desktop BrowserTabStrip. */
function DesktopBrowserToolbar(props: {
  readonly activeTab: RemoteBrowserTab | null;
  readonly typing: boolean;
  readonly typingEnabled: boolean;
  readonly onToggleTyping: () => void;
}) {
  const { activeTab } = props;
  const { t } = useLingui();
  const [urlInput, setUrlInput] = useState("");
  const [focused, setFocused] = useState(false);

  const activeUrl = activeTab?.url ?? "";
  useEffect(() => {
    if (!focused) {
      setUrlInput(activeUrl === "about:blank" ? "" : activeUrl);
    }
  }, [activeUrl, focused]);

  const disabled = !activeTab;
  const keyboardButtonClass = `${desktopToolbarButtonClass} ${
    props.typing ? "text-accent hover:text-accent" : ""
  }`;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const url = normalizeUrl(urlInput);
    if (!url) return;
    const bridge = readBridge();
    if (activeTab) {
      runBrowserAction(bridge.browserNavigate({ tabId: activeTab.tabId, url }));
    } else {
      runBrowserAction(bridge.browserCreateTab({ url, activate: true }));
    }
  };

  return (
    <div className="flex items-center gap-1 border-b border-border bg-[var(--surface)] px-1.5 py-1">
      <button
        type="button"
        className={desktopToolbarButtonClass}
        title={t`Back`}
        disabled={disabled || !activeTab?.canGoBack}
        onClick={() =>
          activeTab && runBrowserAction(readBridge().browserBack({ tabId: activeTab.tabId }))
        }
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <button
        type="button"
        className={desktopToolbarButtonClass}
        title={t`Forward`}
        disabled={disabled || !activeTab?.canGoForward}
        onClick={() =>
          activeTab && runBrowserAction(readBridge().browserForward({ tabId: activeTab.tabId }))
        }
      >
        <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        className={desktopToolbarButtonClass}
        title={t`Reload`}
        disabled={disabled}
        onClick={() =>
          activeTab && runBrowserAction(readBridge().browserReload({ tabId: activeTab.tabId }))
        }
      >
        <RotateCw className="size-3.5" />
      </button>
      <form className="flex-1" onSubmit={onSubmit}>
        <input
          type="text"
          className="h-7 w-full rounded border border-border bg-[var(--field-background)] px-2 text-[12px] text-foreground outline-none placeholder:text-[color:var(--field-placeholder)] focus:border-[color:var(--accent)]"
          placeholder={t`Search or enter address`}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            setUrlInput(activeTab?.url ?? "");
          }}
        />
      </form>
      <button
        type="button"
        className={keyboardButtonClass}
        title={t`Type into the page`}
        disabled={!props.typingEnabled}
        onClick={props.onToggleTyping}
      >
        <Keyboard className="size-3.5" />
      </button>
      <button
        type="button"
        className={desktopToolbarButtonClass}
        title={t`New tab`}
        onClick={() =>
          runBrowserAction(readBridge().browserCreateTab({ url: DEFAULT_HOME, activate: true }))
        }
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function BrowserView() {
  const { t } = useLingui();
  const state = useBrowserMirrorStore((s) => s.state);
  const frame = useBrowserMirrorStore((s) => s.frame);
  const status = useBrowserMirrorStore((s) => s.status);
  const [typing, setTyping] = useState(false);
  const tabSheet = useSheet<boolean>();
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);

  const activeTab = state?.tabs.find((tab) => tab.tabId === state.activeTabId) ?? null;

  // Watch over the WS; the HTTP fetch backfills tab state for the first paint
  // (and when the socket is still reconnecting).
  useEffect(() => {
    startBrowserWatch();
    getRemoteBridgeClient()
      ?.browserState()
      .then((next) => useBrowserMirrorStore.getState().setState(next))
      .catch(() => {});
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pauseBrowserWatch();
      else resumeBrowserWatch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopBrowserWatch();
    };
  }, []);

  function createTab() {
    runBrowserAction(readBridge().browserCreateTab({ url: DEFAULT_HOME, activate: true }));
  }

  const mirrorActive = status?.status === "active" && frame !== null;

  return (
    <section className="m-browser">
      {isWide ? (
        <>
          <DesktopBrowserToolbar
            activeTab={activeTab}
            typing={typing}
            typingEnabled={mirrorActive}
            onToggleTyping={() => setTyping((current) => !current)}
          />
          <BrowserTabStrip onCreateTab={createTab} />
        </>
      ) : null}
      <div className="m-browser__stage">
        {frame ? <MirrorSurface frame={frame} /> : null}
        {!state ? (
          <div className="m-browser__status">
            <p>
              <Loader2 className="m-spin size-4" />{" "}
              <Trans>Connecting to the desktop browser…</Trans>
            </p>
          </div>
        ) : state.tabs.length === 0 ? (
          <div className="absolute inset-0">
            <BrowserEmptyState onCreateTab={createTab} />
          </div>
        ) : !mirrorActive ? (
          <div className="m-browser__status" data-dim={frame ? "true" : undefined}>
            {status?.status === "unavailable" ? (
              <>
                <p>{status.reason ?? t`Mirroring is unavailable.`}</p>
                <Button size="sm" variant="secondary" onPress={() => startBrowserWatch()}>
                  <Trans>Retry</Trans>
                </Button>
              </>
            ) : (
              <p>
                <Loader2 className="m-spin size-4" /> <Trans>Starting mirror…</Trans>
              </p>
            )}
          </div>
        ) : null}
      </div>
      {typing && mirrorActive ? (
        <TypingBar onClose={() => setTyping(false)} />
      ) : isWide ? null : (
        <div className="m-browser__bottom">
          <AddressPill activeTab={activeTab} />
          <div className="m-browser__nav">
            <button
              type="button"
              className="m-browser__nav-btn"
              aria-label={t`Back`}
              disabled={!activeTab?.canGoBack}
              onClick={() =>
                activeTab && runBrowserAction(readBridge().browserBack({ tabId: activeTab.tabId }))
              }
            >
              <ArrowLeft className="size-5" />
            </button>
            <button
              type="button"
              className="m-browser__nav-btn"
              aria-label={t`Forward`}
              disabled={!activeTab?.canGoForward}
              onClick={() =>
                activeTab &&
                runBrowserAction(readBridge().browserForward({ tabId: activeTab.tabId }))
              }
            >
              <ArrowRight className="size-5" />
            </button>
            <button
              type="button"
              className="m-browser__nav-btn"
              aria-label={t`New tab`}
              onClick={createTab}
            >
              <span className="m-browser__nav-plus">
                <Plus className="size-4" />
              </span>
            </button>
            <button
              type="button"
              className="m-browser__nav-btn"
              aria-label={t`Tabs (${state?.tabs.length ?? 0})`}
              disabled={!state}
              onClick={() => tabSheet.open(true)}
            >
              <span className="m-browser__tabs-count">{state?.tabs.length ?? 0}</span>
            </button>
            <button
              type="button"
              className="m-browser__nav-btn"
              aria-label={t`Type into the page`}
              data-active={typing || undefined}
              disabled={!mirrorActive}
              onClick={() => setTyping(true)}
            >
              <Keyboard className="size-5" />
            </button>
          </div>
        </div>
      )}
      {tabSheet.target && !isWide && state ? (
        <TabSheet
          tabs={state.tabs}
          activeTabId={state.activeTabId}
          closing={tabSheet.closing}
          onClose={tabSheet.close}
        />
      ) : null}
    </section>
  );
}
