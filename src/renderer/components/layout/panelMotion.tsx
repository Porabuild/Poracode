import { Activity, createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Covers the longest panel exit (the narrow-window overlay slide). */
export const PANEL_EXIT_DURATION_MS = 300;

/** Defer new heavy bodies while their host is opening or closing. */
export const PanelContentDeferredContext = createContext(false);

export function usePanelContentDeferred(): boolean {
  return useContext(PanelContentDeferredContext);
}

/** Suspend presentation effects after the tab's cross-fade, retaining its DOM and state. */
export function PanelActivity({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [exiting, setExiting] = useState(visible);
  if (visible && !exiting) setExiting(true);
  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => setExiting(false), 120);
    return () => window.clearTimeout(timer);
  }, [visible]);
  return (
    <Activity mode={visible || exiting ? "visible" : "hidden"}>
      <PanelExitContent visible={visible}>{children}</PanelExitContent>
    </Activity>
  );
}

/** Preserve the last open view when closing clears its selection/context. */
export function PanelExitContent({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [lastVisibleChildren, setLastVisibleChildren] = useState(children);
  if (visible && children !== lastVisibleChildren) setLastVisibleChildren(children);
  return visible ? children : lastVisibleChildren;
}
