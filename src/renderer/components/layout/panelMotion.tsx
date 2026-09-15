import { createContext, useContext, useState, type ReactNode } from "react";

/** Covers the longest panel exit (the narrow-window overlay slide). */
export const PANEL_EXIT_DURATION_MS = 300;

/** Defer new heavy bodies while their host is opening or closing. */
export const PanelContentDeferredContext = createContext(false);

export function usePanelContentDeferred(): boolean {
  return useContext(PanelContentDeferredContext);
}

/** Preserve the last open view when closing clears its selection/context. */
export function PanelExitContent({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [lastVisibleChildren, setLastVisibleChildren] = useState(children);
  if (visible && children !== lastVisibleChildren) setLastVisibleChildren(children);
  return visible ? children : lastVisibleChildren;
}
