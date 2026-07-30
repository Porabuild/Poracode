import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import type { BrowserDeviceEmulation } from "@/shared/ipc";

export function BrowserTabWebview(props: {
  tabId: string;
  initialSrc: string;
  visible: boolean;
  emulation?: BrowserDeviceEmulation;
}) {
  const { t } = useLingui();
  const ref = useRef<HTMLWebViewElement | null>(null);
  const initialSrcRef = useRef(props.initialSrc);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const onDomReady = () => {
      if (cancelled) return;
      let webContentsId: number;
      try {
        webContentsId = el.getWebContentsId();
      } catch {
        return;
      }
      readBridge()
        .browserAttachWebContents({ tabId: props.tabId, webContentsId })
        .catch(() => {});
    };
    el.addEventListener("dom-ready", onDomReady);
    return () => {
      cancelled = true;
      el.removeEventListener("dom-ready", onDomReady);
    };
  }, [props.tabId]);

  useEffect(() => {
    if (!props.visible) return;
    const el = ref.current;
    if (!el) return;
    let webContentsId: number;
    try {
      webContentsId = el.getWebContentsId();
    } catch {
      return;
    }
    readBridge()
      .browserAttachWebContents({ tabId: props.tabId, webContentsId })
      .catch(() => {});
  }, [props.tabId, props.visible]);

  const viewportWidth = resizeDraft?.width ?? props.emulation?.width;
  const viewportHeight = resizeDraft?.height ?? props.emulation?.height;

  function startResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    dimensions: { width: boolean; height: boolean },
  ) {
    const emulation = props.emulation;
    if (!emulation) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = emulation.width;
    const startHeight = emulation.height;
    const scale = emulation.scale;
    let nextWidth = startWidth;
    let nextHeight = startHeight;
    let resizeFrame = 0;
    const applyResize = () => {
      readBridge()
        .browserSetDeviceEmulation({
          tabId: props.tabId,
          emulation: {
            ...emulation,
            width: nextWidth,
            height: nextHeight,
            preset: "Responsive",
          },
        })
        .catch(() => {});
    };
    const onMove = (moveEvent: PointerEvent) => {
      nextWidth = dimensions.width
        ? Math.max(
            240,
            Math.min(7680, Math.round(startWidth + (moveEvent.clientX - startX) / scale)),
          )
        : startWidth;
      nextHeight = dimensions.height
        ? Math.max(
            240,
            Math.min(7680, Math.round(startHeight + (moveEvent.clientY - startY) / scale)),
          )
        : startHeight;
      if (!resizeFrame) {
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          setResizeDraft({ width: nextWidth, height: nextHeight });
          applyResize();
        });
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeCleanupRef.current = null;
    };
    const onUp = () => {
      cleanup();
      setResizeDraft(null);
      applyResize();
    };
    const onCancel = () => {
      cleanup();
      setResizeDraft(null);
    };
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
  }

  const viewportStyle = props.emulation
    ? {
        width: String((viewportWidth ?? props.emulation.width) * props.emulation.scale) + "px",
        height: String((viewportHeight ?? props.emulation.height) * props.emulation.scale) + "px",
        margin: "24px auto",
      }
    : { width: "100%", height: "100%" };

  return (
    <div
      className={
        "absolute inset-0 overflow-auto " +
        (props.emulation ? "bg-[var(--surface-secondary)]" : "bg-[var(--content-background)]")
      }
      style={{ display: props.visible ? "block" : "none" }}
    >
      <div
        className={"relative shrink-0 " + (props.emulation ? "border border-border shadow-xl" : "")}
        style={viewportStyle}
      >
        <webview
          ref={ref}
          data-tab-id={props.tabId}
          partition="persist:lightcode-browser"
          src={initialSrcRef.current || "about:blank"}
          // Electron's React type says boolean, but React warns unless this custom
          // element attribute is serialized as a string.
          allowpopups={"true" as unknown as boolean}
          className="absolute inset-0 size-full"
        />
        {props.emulation ? (
          <>
            <button
              type="button"
              aria-label={t`Resize viewport width`}
              className="absolute -right-2 top-0 z-10 h-full w-3 cursor-ew-resize"
              onPointerDown={(event) => startResize(event, { width: true, height: false })}
            />
            <button
              type="button"
              aria-label={t`Resize viewport height`}
              className="absolute -bottom-2 left-0 z-10 h-3 w-full cursor-ns-resize"
              onPointerDown={(event) => startResize(event, { width: false, height: true })}
            />
            <button
              type="button"
              aria-label={t`Resize viewport`}
              className="absolute -right-2 -bottom-2 z-20 size-4 cursor-nwse-resize rounded-full border border-border bg-[var(--content-background)]"
              onPointerDown={(event) => startResize(event, { width: true, height: true })}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
