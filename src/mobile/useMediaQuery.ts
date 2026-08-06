// Re-export HeroUI's hook (already a dependency) rather than hand-rolling our
// own; it adds Safari < 14 support and SSR-safe init with identical client
// behavior.
export { useMediaQuery } from "@heroui/react";

/** The PWA switches between phone chrome and the sidebar/desktop layout here;
 * matches the 767px guard in styles.css. */
export const WIDE_SHELL_QUERY = "(min-width: 768px)";

/** Menus use anchored popovers only when the browser has desktop-like input. */
export const DESKTOP_POINTER_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine)";

/** Enough room for sidebar + thread + a docked auxiliary panel. */
export const DESKTOP_RIGHT_PANEL_QUERY =
  "(min-width: 1200px) and (hover: hover) and (pointer: fine)";
