import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { House } from "lucide-react";
import { isMac, isWindows } from "@/renderer/bridge";
import { macosTrafficLightGutterClass } from "@/renderer/components/layout/sidebarChrome";
import {
  AppShell,
  SidebarContext,
  useSidebar,
} from "@/renderer/views/MainView/parts/AppShell/AppShell";

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
        className="poracode-overlay-header__controls shrink-0 leading-none text-muted transition-colors hover:text-foreground"
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
}) {
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

  // macOS only: drop the empty center `poracode-overlay-header` when there is no content so main
  // + the right column reclaim the titlebar row next to hidden-inset chrome. Other platforms keep
  // the empty row (signalled by the empty fragment, since `null` would suppress it everywhere).
  const contentHeader = contentHeaderChildren ?? (isMac() ? null : <></>);

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
      {...(forceSidebarExpanded === true ? { forceSidebarExpanded: true } : {})}
      {...(onRequestClosePanels != null ? { onRequestClosePanels } : {})}
      {...(onDismissRightOverlay != null ? { onDismissRightOverlay } : {})}
    />
  );

  if (forceSidebarExpanded === true) {
    return <SidebarContext.Provider value={alwaysExpandedSidebar}>{shell}</SidebarContext.Provider>;
  }

  return shell;
}
