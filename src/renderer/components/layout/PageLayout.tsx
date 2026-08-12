import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { ChevronLeft, House } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { isMac, isWindows } from "@/renderer/bridge";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { macosTrafficLightGutterClass } from "@/renderer/components/layout/sidebarChrome";
import {
  AppShell,
  SidebarContext,
  useSidebar,
} from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { expandSidebar } from "@/renderer/state/sidebarOverlayStore";

const alwaysExpandedSidebar = {
  isCollapsed: false,
  isOverlay: false,
  closingOverlay: false,
  collapse: () => {},
  expand: () => {},
};

function SidebarHeaderWordmark(props: {
  title: string;
  titleNode?: ReactNode | undefined;
  onTitleClick?: () => void;
  hideWordmark: boolean;
}) {
  const { title, titleNode, onTitleClick, hideWordmark } = props;

  if (hideWordmark) {
    return <p className="sr-only">{title}</p>;
  }

  // The main window passes the Pora·code brand wordmark; overlays (Settings,
  // Git Review, …) fall back to their uppercase section title.
  const content = titleNode ?? (
    <span className="text-xs font-semibold uppercase tracking-[0.12em]">{title}</span>
  );

  if (onTitleClick) {
    return (
      <button
        type="button"
        aria-label={title}
        className="poracode-sidebar-wordmark poracode-overlay-header__controls shrink-0 leading-none text-muted transition-colors hover:text-foreground"
        onClick={onTitleClick}
      >
        {content}
      </button>
    );
  }

  return <p className="shrink-0 leading-none text-muted">{content}</p>;
}

function SidebarHeaderRow(props: {
  title: string;
  titleNode?: ReactNode | undefined;
  onTitleClick?: () => void;
  children?: ReactNode;
}) {
  const { isCollapsed, closingOverlay } = useSidebar();
  const ref = useRef<HTMLDivElement>(null);
  const fullContentRef = useRef<HTMLDivElement>(null);
  const [hideWordmark, setHideWordmark] = useState(false);
  const showHeaderActions = !isCollapsed || closingOverlay;

  useLayoutEffect(() => {
    const el = ref.current;
    const fullContentEl = fullContentRef.current;
    if (!el || !fullContentEl) return;

    const update = () => {
      setHideWordmark(el.clientWidth < fullContentEl.scrollWidth);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    const ro2 = new ResizeObserver(() => update());
    ro2.observe(fullContentEl);

    return () => {
      ro.disconnect();
      ro2.disconnect();
    };
  }, [props.title]);

  return (
    <>
      {/* Ghost container to measure uncollapsed width. `invisible` (not
          `opacity-0`) so the no-drag children inside don't contribute to
          Electron's draggable-region map and steal drag from the visible
          spacer in the actual header row. */}
      <div
        ref={fullContentRef}
        className={`pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-1.5${
          isWindows() ? " pl-1" : ""
        }`}
        aria-hidden="true"
      >
        {isMac() && <div className={macosTrafficLightGutterClass} />}
        {showHeaderActions && (
          <SidebarHeaderWordmark
            title={props.title}
            titleNode={props.titleNode}
            hideWordmark={false}
          />
        )}
        {showHeaderActions ? props.children : null}
      </div>

      <div
        ref={ref}
        className={`flex min-h-0 min-w-0 flex-1 items-center gap-1.5${isWindows() ? " pl-1" : ""}`}
      >
        {isMac() && <div className={macosTrafficLightGutterClass} />}
        {showHeaderActions ? (
          hideWordmark && props.onTitleClick ? (
            <Tooltip delay={150}>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={props.title}
                  className="poracode-overlay-header__controls size-6 min-w-0 shrink-0 text-muted hover:text-foreground"
                  onPress={props.onTitleClick}
                >
                  <House className="size-3.5" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content placement="bottom">{props.title}</Tooltip.Content>
            </Tooltip>
          ) : (
            <SidebarHeaderWordmark
              title={props.title}
              titleNode={props.titleNode}
              {...(props.onTitleClick != null ? { onTitleClick: props.onTitleClick } : {})}
              hideWordmark={hideWordmark}
            />
          )
        ) : null}
        {showHeaderActions ? props.children : null}
        <div className="flex-1" />
      </div>
    </>
  );
}

function CompactContentHeader(props: {
  title: string;
  titleNode?: ReactNode | undefined;
  children?: ReactNode;
  onTitleClick?: () => void;
  onBack?: (() => void) | undefined;
}) {
  const { t } = useLingui();
  return (
    <div className="poracode-compact-content-header flex min-w-0 flex-1 items-center">
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={props.onBack ? t`Return to app` : t`Back`}
        className="m-back min-w-0 shrink-0"
        onPress={props.onBack ?? expandSidebar}
      >
        <ChevronLeft className="size-5" />
      </Button>
      {props.children ? (
        props.children
      ) : props.onTitleClick ? (
        <button
          type="button"
          className="min-w-0 truncate text-left text-sm font-semibold"
          onClick={props.onTitleClick}
        >
          {props.titleNode ?? props.title}
        </button>
      ) : (
        <div className="min-w-0 truncate text-sm font-semibold">
          {props.titleNode ?? props.title}
        </div>
      )}
    </div>
  );
}

/**
 * Shared page layout: split header (sidebar + content) + AppShell body.
 * Used by the main app, git review overlay, settings overlay, and file editor.
 */
export function PageLayout(props: {
  title: string;
  titleNode?: ReactNode | undefined;
  onTitleClick?: () => void;
  sidebarHeaderChildren?: ReactNode;
  contentHeaderChildren?: ReactNode;
  sidebar: ReactNode;
  content: ReactNode;
  rightPanel?: ReactNode;
  gitPanel?: ReactNode;
  rightPanelOpen?: boolean;
  rightPanelPlacement?: "right" | "bottom";
  rightPanelResizeLabel?: string;
  forceSidebarExpanded?: boolean;
  onRequestClosePanels?: () => void;
  onDismissRightOverlay?: () => void;
  compactHome?: boolean;
  compactTitle?: string;
  compactHeaderChildren?: ReactNode;
  onCompactBack?: () => void;
  mobileNavigation?: boolean;
}) {
  const compactLayout = useCompactLayout();
  const {
    title,
    titleNode,
    onTitleClick,
    sidebarHeaderChildren,
    contentHeaderChildren,
    sidebar,
    content,
    rightPanel,
    gitPanel,
    rightPanelOpen,
    rightPanelPlacement,
    rightPanelResizeLabel,
    forceSidebarExpanded,
    onRequestClosePanels,
    onDismissRightOverlay,
    compactHome = false,
    compactTitle,
    compactHeaderChildren,
    onCompactBack,
    mobileNavigation = false,
  } = props;

  const sidebarHeader = (
    <SidebarHeaderRow
      title={title}
      titleNode={titleNode}
      {...(onTitleClick != null ? { onTitleClick } : {})}
    >
      {sidebarHeaderChildren}
    </SidebarHeaderRow>
  );

  // macOS and desktop browser: drop the empty center `poracode-overlay-header` when there is no
  // content so main + the right column reclaim the titlebar row. Other native platforms keep the
  // empty row for their titleBarOverlay controls (signalled by the empty fragment, since `null`
  // would suppress it everywhere). Compact browser layouts retain their explicit mobile header.
  const contentHeader =
    compactLayout && !compactHome ? (
      <CompactContentHeader
        title={compactTitle ?? title}
        {...(compactTitle === undefined && titleNode !== undefined ? { titleNode } : {})}
        {...(compactTitle === undefined && onTitleClick !== undefined ? { onTitleClick } : {})}
        {...(onCompactBack !== undefined ? { onBack: onCompactBack } : {})}
      >
        {compactHeaderChildren}
      </CompactContentHeader>
    ) : (
      (contentHeaderChildren ?? (isMac() || isBrowserClientRuntime() ? null : <></>))
    );
  const effectiveForceSidebarExpanded =
    (forceSidebarExpanded === true && !compactLayout) || (compactLayout && compactHome);

  const shell = (
    <AppShell
      sidebarHeader={sidebarHeader}
      contentHeader={contentHeader}
      sidebar={sidebar}
      content={content}
      rightPanel={rightPanel}
      gitPanel={gitPanel}
      {...(rightPanelOpen !== undefined ? { rightPanelOpen } : {})}
      {...(rightPanelPlacement !== undefined ? { rightPanelPlacement } : {})}
      {...(rightPanelResizeLabel !== undefined ? { rightPanelResizeLabel } : {})}
      {...(effectiveForceSidebarExpanded ? { forceSidebarExpanded: true } : {})}
      {...(onRequestClosePanels != null ? { onRequestClosePanels } : {})}
      {...(onDismissRightOverlay != null ? { onDismissRightOverlay } : {})}
      compactHome={compactHome}
      mobileNavigation={mobileNavigation}
    />
  );

  if (effectiveForceSidebarExpanded) {
    return <SidebarContext.Provider value={alwaysExpandedSidebar}>{shell}</SidebarContext.Provider>;
  }

  return shell;
}
