import { useState, type ReactNode } from "react";
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

  // The slot lives in the shared compact header, outside this component's
  // subtree, so it is located after commit. A ref callback (commit phase, not
  // an effect) keeps the lookup synchronous: the portal exists on the same
  // frame the page commits. The callback is created once — the scope comes
  // from useId and never changes — and the anchor re-locates if it ever does.
  const selector = `[data-poracode-mobile-page-header-actions="${scope}"]`;
  const [locateSlot] = useState(
    () => (anchor: HTMLElement | null) =>
      setTarget(anchor ? document.querySelector<HTMLElement>(selector) : null),
  );

  return (
    <>
      <span key={selector} ref={locateSlot} hidden />
      {target ? createPortal(props.children, target) : null}
    </>
  );
}
