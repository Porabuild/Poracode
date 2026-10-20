import { useEffectEvent, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { PanelRight } from "lucide-react";
import {
  panelHeaderIconButtonClass,
  panelHeaderRowClass,
} from "@/renderer/components/layout/sidebarChrome";

export function DeviceDetachedWindow({
  window: child,
  children,
  title,
  actions,
  onDock,
}: {
  window: Window;
  children: ReactNode;
  title: ReactNode;
  actions: ReactNode;
  onDock: () => void;
}) {
  const { t } = useLingui();
  const frame = useRef<HTMLDivElement>(null);
  const dock = useEffectEvent(onDock);
  useLayoutEffect(() => {
    const head = child.document.head;
    const base = child.document.createElement("base");
    base.href = document.baseURI;
    head.append(base);
    const styles = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')].map(
      (node) => node.cloneNode(true) as HTMLElement,
    );
    // React Aria measures the opener's viewport even when its overlay is
    // portalled here. Keep both kinds of dialog within this window instead.
    const viewportStyle = child.document.createElement("style");
    viewportStyle.textContent =
      ".modal__backdrop, .alert-dialog__backdrop { --visual-viewport-height: 100dvh !important; }";
    styles.push(viewportStyle);
    head.append(...styles);
    const syncTheme = () => {
      for (const attribute of document.documentElement.attributes)
        child.document.documentElement.setAttribute(attribute.name, attribute.value);
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true });
    const closed = () => {
      dock();
      window.focus();
    };
    child.addEventListener("beforeunload", closed);
    frame.current?.focus();
    child.focus();
    return () => {
      observer.disconnect();
      child.removeEventListener("beforeunload", closed);
      styles.forEach((node) => node.remove());
      base.remove();
      child.close();
    };
  }, [child]);
  useLayoutEffect(() => {
    if (frame.current) frame.current.ownerDocument.title = t`Devices`;
  }, [t]);
  return createPortal(
    <div
      ref={frame}
      data-testid="device-detached-window"
      tabIndex={-1}
      className="flex h-dvh w-full min-w-0 flex-col overflow-hidden bg-[var(--content-background)] text-foreground"
    >
      <div className={`${panelHeaderRowClass} shrink-0 gap-1`}>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">{title}</div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <Tooltip>
            <Tooltip.Trigger tabIndex={-1} role="none">
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className={panelHeaderIconButtonClass}
                aria-label={t`Move device back to main window`}
                onPress={onDock}
              >
                <PanelRight className="size-3.5" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{t`Move device back to main window`}</Tooltip.Content>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>,
    child.document.body,
  );
}
