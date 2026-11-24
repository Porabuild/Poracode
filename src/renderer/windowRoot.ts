import type { ComponentType } from "react";
import type { PoracodeWindowKind } from "@/shared/ipc";

/** The root component module `main.tsx` renders for one renderer window. */
export interface WindowRoot {
  App: ComponentType;
}

const loadQuickComposerRoot = () => import("./windowApps/QuickComposerWindowRoot");
const loadAppShell = () => import("./app");

/**
 * Resolve the root module a window boots. The Quick Composer never mounts the
 * app shell (sidebar, thread panes, git review) or its module-level runtime
 * wiring, and `./app` statically imports all of it, so that window loads only
 * its own root.
 *
 * Each import stays in its own function: the bundler attaches a dynamic
 * import's dependency list to the preload call wrapping it, and it wraps the
 * conditional that contains the import. Two imports that minify into branches
 * of one conditional share a single list, so the quick composer would preload
 * the app shell it is bypassing. `src/build/windowRootPreload.test.ts` locks
 * this in.
 */
export function loadWindowRoot(windowKind: PoracodeWindowKind): Promise<WindowRoot> {
  return windowKind === "quickComposer" ? loadQuickComposerRoot() : loadAppShell();
}
