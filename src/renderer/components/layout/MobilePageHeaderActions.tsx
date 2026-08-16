import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMobilePageActionScope } from "./MobilePageActionScope";

/** Stable compact-header destination for actions owned by the active page. */
export function MobilePageHeaderActionsSlot() {
  const scope = useMobilePageActionScope();
  return (
    <div
      data-poracode-mobile-page-header-actions={scope}
      className="ml-auto flex shrink-0 items-center gap-2"
    />
  );
}

/**
 * Keeps page actions beside the shared compact title without lifting page
 * state into the shell or duplicating the mobile header.
 */
export function MobilePageHeaderActions(props: { children: ReactNode }) {
  const scope = useMobilePageActionScope();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(
      document.querySelector<HTMLElement>(`[data-poracode-mobile-page-header-actions="${scope}"]`),
    );
  }, [scope]);

  return target ? createPortal(props.children, target) : null;
}
