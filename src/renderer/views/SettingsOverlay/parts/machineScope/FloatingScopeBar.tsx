import type { ReactNode } from "react";

/**
 * Docks a settings scope selector at the bottom-center of the page, clear of
 * the content flow. The overlay reserves bottom padding while one is shown.
 */
export function FloatingScopeBar(props: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-6">
      <div className="pointer-events-auto">{props.children}</div>
    </div>
  );
}
