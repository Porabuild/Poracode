import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMobilePageActionScope } from "./MobilePageActionScope";

type MobilePageBottomActionSide = "left" | "right";

/** Compact-page bottom control row with stable edge slots around page-owned content. */
export function MobilePageBottomBar(props: { children: ReactNode; className?: string }) {
  const scope = useMobilePageActionScope();
  return (
    <div className={`m-mobile-page-bottom-bar ${props.className ?? ""}`}>
      <div
        data-poracode-mobile-page-bottom-action={`${scope}:left`}
        className="m-mobile-page-bottom-action-slot"
      />
      <div className="min-w-0 flex-1">{props.children}</div>
      <div
        data-poracode-mobile-page-bottom-action={`${scope}:right`}
        className="m-mobile-page-bottom-action-slot"
      />
    </div>
  );
}

/** Portals a page-owned action into one edge of the active compact bottom bar. */
export function MobilePageBottomAction(props: {
  side: MobilePageBottomActionSide;
  children: ReactNode;
}) {
  const scope = useMobilePageActionScope();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(
      document.querySelector<HTMLElement>(
        `[data-poracode-mobile-page-bottom-action="${scope}:${props.side}"]`,
      ),
    );
  }, [props.side, scope]);

  return target ? createPortal(props.children, target) : null;
}
