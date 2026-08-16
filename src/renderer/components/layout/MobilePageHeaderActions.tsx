import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const MOBILE_PAGE_HEADER_ACTIONS_ID = "poracode-mobile-page-header-actions";

/** Stable compact-header destination for actions owned by the active page. */
export function MobilePageHeaderActionsSlot() {
  return (
    <div id={MOBILE_PAGE_HEADER_ACTIONS_ID} className="ml-auto flex shrink-0 items-center gap-2" />
  );
}

/**
 * Keeps page actions beside the shared compact title without lifting page
 * state into the shell or duplicating the mobile header.
 */
export function MobilePageHeaderActions(props: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(document.getElementById(MOBILE_PAGE_HEADER_ACTIONS_ID));
  }, []);

  return target ? createPortal(props.children, target) : null;
}
