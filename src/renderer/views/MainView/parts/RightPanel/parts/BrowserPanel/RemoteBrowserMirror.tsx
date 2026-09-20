import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Loader2 } from "lucide-react";
import type { RemoteBrowserFrameMetadata, RemoteBrowserKey } from "@/shared/remote";
import {
  pauseBrowserWatch,
  resumeBrowserWatch,
  sendBrowserInput,
  startBrowserWatch,
  stopBrowserWatch,
  useBrowserMirrorStore,
} from "@/renderer/browser/browserMirror";

const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;

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

interface PointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  scrolled: boolean;
}

export function RemoteBrowserMirror(props: { activeTabId: string | null; visible: boolean }) {
  const { t } = useLingui();
  const frame = useBrowserMirrorStore((state) => state.frame);
  const status = useBrowserMirrorStore((state) => state.status);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const textProxyRef = useRef<HTMLTextAreaElement | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const composingRef = useRef(false);
  const suppressInputTextRef = useRef<string | null>(null);
  const suppressBeforeInputKeyRef = useRef<RemoteBrowserKey | null>(null);
  const activeFrame = frame?.tabId === props.activeTabId ? frame : null;

  useEffect(() => {
    if (!props.visible) {
      pauseBrowserWatch();
      return;
    }
    startBrowserWatch();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") pauseBrowserWatch();
      else resumeBrowserWatch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopBrowserWatch();
    };
  }, [props.visible]);

  function pagePoint(clientX: number, clientY: number) {
    if (!activeFrame) return null;
    return mapPagePoint(imageRef.current, activeFrame.metadata, clientX, clientY);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      startedAt: performance.now(),
      scrolled: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    if (!gesture.scrolled) {
      const travel = Math.hypot(point.x - gesture.startX, point.y - gesture.startY);
      if (travel < TAP_SLOP_PX) return;
      gesture.scrolled = true;
    }
    const deltaX = gesture.lastX - point.x;
    const deltaY = gesture.lastY - point.y;
    gesture.lastX = point.x;
    gesture.lastY = point.y;
    if (deltaX === 0 && deltaY === 0) return;
    sendBrowserInput({
      kind: "scroll",
      x: gesture.startX,
      y: gesture.startY,
      deltaX,
      deltaY,
    });
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.type !== "pointerup" || gesture.scrolled) return;
    if (performance.now() - gesture.startedAt > TAP_MAX_MS) return;
    const point = pagePoint(event.clientX, event.clientY);
    if (point) {
      sendBrowserInput({ kind: "tap", x: point.x, y: point.y });
      textProxyRef.current?.focus({ preventScroll: true });
    }
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    sendBrowserInput({
      kind: "scroll",
      x: point.x,
      y: point.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = FORWARDED_KEYS[event.key];
    if (key) {
      event.preventDefault();
      forwardControlKey(key);
    } else if (event.target !== textProxyRef.current && event.key.length === 1) {
      event.preventDefault();
      sendBrowserInput({ kind: "insert-text", text: event.key });
    }
  }

  function onTextInput(event: React.FormEvent<HTMLTextAreaElement>) {
    const input = event.nativeEvent as InputEvent;
    if (forwardInputControl(input.inputType)) {
      event.currentTarget.value = "";
      return;
    }
    if (composingRef.current || input.isComposing) return;
    const text = event.currentTarget.value || input.data || "";
    event.currentTarget.value = "";
    if (suppressInputTextRef.current === text) {
      suppressInputTextRef.current = null;
      return;
    }
    suppressInputTextRef.current = null;
    if (text) sendBrowserInput({ kind: "insert-text", text });
  }

  function onTextBeforeInput(event: React.FormEvent<HTMLTextAreaElement>) {
    const inputType = (event.nativeEvent as InputEvent).inputType;
    if (forwardInputControl(inputType)) event.preventDefault();
  }

  function forwardInputControl(inputType: string): boolean {
    const key: RemoteBrowserKey | null =
      inputType === "deleteContentBackward"
        ? "backspace"
        : inputType === "insertLineBreak" || inputType === "insertParagraph"
          ? "enter"
          : null;
    if (!key) return false;
    forwardControlKey(key);
    return true;
  }

  function forwardControlKey(key: RemoteBrowserKey) {
    if (suppressBeforeInputKeyRef.current === key) return;
    sendBrowserInput({ kind: "key", key });
    suppressBeforeInputKeyRef.current = key;
    queueMicrotask(() => {
      if (suppressBeforeInputKeyRef.current === key) suppressBeforeInputKeyRef.current = null;
    });
  }

  function onCompositionEnd(event: React.CompositionEvent<HTMLTextAreaElement>) {
    composingRef.current = false;
    const text = event.data || event.currentTarget.value;
    event.currentTarget.value = "";
    suppressInputTextRef.current = text || null;
    queueMicrotask(() => {
      if (suppressInputTextRef.current === text) suppressInputTextRef.current = null;
    });
    if (text) sendBrowserInput({ kind: "insert-text", text });
  }

  const unavailable = status?.status === "unavailable";
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the mirrored remote viewport receives pointer, wheel, and keyboard input like a native webview
    <div
      role="application"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard focus forwards input to the focused control in the mirrored page
      tabIndex={0}
      aria-label={t`Browser`}
      className="absolute inset-0 overflow-hidden outline-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <textarea
        ref={textProxyRef}
        tabIndex={-1}
        aria-label={t`Browser`}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="pointer-events-none absolute size-px opacity-0"
        onBeforeInput={onTextBeforeInput}
        onInput={onTextInput}
        onCompositionStart={() => {
          composingRef.current = true;
          suppressInputTextRef.current = null;
        }}
        onCompositionEnd={onCompositionEnd}
      />
      {activeFrame ? (
        <img
          ref={imageRef}
          src={activeFrame.dataUrl}
          alt=""
          draggable={false}
          className="size-full select-none object-contain"
        />
      ) : null}
      {unavailable ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 px-6 text-center text-xs text-muted">
          {status.reason ? <p>{status.reason}</p> : null}
          <Button size="sm" variant="secondary" onPress={startBrowserWatch}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : !activeFrame && props.activeTabId ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted">
          <Loader2 className="size-4 animate-spin" aria-label={t`Loading`} />
        </div>
      ) : null}
    </div>
  );
}

function mapPagePoint(
  image: HTMLImageElement | null,
  metadata: RemoteBrowserFrameMetadata,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!image || metadata.deviceWidth <= 0 || metadata.deviceHeight <= 0) return null;
  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / metadata.deviceWidth, rect.height / metadata.deviceHeight);
  const contentLeft = rect.left + (rect.width - metadata.deviceWidth * scale) / 2;
  const contentTop = rect.top + (rect.height - metadata.deviceHeight * scale) / 2;
  const x = (clientX - contentLeft) / scale;
  const y = (clientY - contentTop) / scale;
  if (x < 0 || y < 0 || x > metadata.deviceWidth || y > metadata.deviceHeight) return null;
  return { x, y };
}
