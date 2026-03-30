import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { OverlayHeader } from "./OverlayHeader";

/**
 * Shared page layout: header bar + AppShell body.
 * Used by the main app, git review overlay, and settings overlay.
 */
export function PageLayout(props: {
  title: string;
  onTitleClick?: () => void;
  headerChildren?: ReactNode;
  sidebar: ReactNode;
  content: ReactNode;
  rightPanel?: ReactNode;
  rightPanelOpen?: boolean;
}) {
  const { title, onTitleClick, headerChildren, sidebar, content, rightPanel, rightPanelOpen } =
    props;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <OverlayHeader title={title} {...(onTitleClick ? { onTitleClick } : {})}>
        {headerChildren}
      </OverlayHeader>
      <div className="lightcode-overlay-body min-h-0 flex-1">
        <AppShell
          sidebar={sidebar}
          content={content}
          rightPanel={rightPanel}
          {...(rightPanelOpen != null ? { rightPanelOpen } : {})}
        />
      </div>
    </div>
  );
}
