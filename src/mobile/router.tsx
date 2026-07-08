import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  redirect,
} from "@tanstack/react-router";
import { capturePairingLaunch } from "./pairing";
import { isFullscreenScreenPath, navigationTransitionType } from "./navHelpers";
import { RootLayout } from "./RootLayout";
import { WIDE_SHELL_QUERY } from "./useMediaQuery";
import {
  BrowserRoute,
  DesktopsRoute,
  MoreRoute,
  NewThreadRoute,
  ProjectsRoute,
  SettingsListRoute,
  SettingsSectionRoute,
  TerminalRoute,
  ThreadRoute,
  ThreadsRoute,
  UsageRoute,
  WorkspaceRoute,
} from "./routeComponents";
import { PrChangesPage } from "./views/pr/PrChangesPage";
import { PrChecksPage } from "./views/pr/PrChecksPage";
import { PrCommitsPage } from "./views/pr/PrCommitsPage";
import { PrConversationPage } from "./views/pr/PrConversationPage";
import { PrLayout } from "./views/pr/PrLayout";
import { PrOverviewPage } from "./views/pr/PrOverviewPage";

// Snapshot + strip the pairing launch params BEFORE hash history reads the URL,
// so a `#token=…` launch never confuses the router (see pairing.ts).
capturePairingLaunch();

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/threads" });
  },
});

const threadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/threads",
  component: ThreadsRoute,
});

const threadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/thread/$threadId",
  component: ThreadRoute,
});

const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/new",
  component: NewThreadRoute,
});

const desktopsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktops",
  component: DesktopsRoute,
});

const moreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more",
  component: MoreRoute,
});

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more/usage",
  component: UsageRoute,
});

const browserRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more/browser",
  component: BrowserRoute,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more/projects",
  component: ProjectsRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more/settings",
  component: SettingsListRoute,
});

const settingsSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more/settings/$section",
  component: SettingsSectionRoute,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace/$threadId",
  component: WorkspaceRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    readonly tab: "changes" | "files";
    readonly file?: string;
    readonly folder?: string;
    readonly line?: number;
  } => {
    const line = typeof search.line === "number" ? search.line : Number(search.line);
    return {
      tab: search.tab === "files" ? "files" : "changes",
      ...(typeof search.file === "string" && search.file ? { file: search.file } : {}),
      ...(typeof search.folder === "string" && search.folder ? { folder: search.folder } : {}),
      ...(Number.isInteger(line) && line > 0 ? { line } : {}),
    };
  },
});

const terminalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terminal/$projectId",
  component: TerminalRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): { readonly worktree?: string; readonly action?: string; readonly fromThread?: string } => ({
    ...(typeof search.worktree === "string" ? { worktree: search.worktree } : {}),
    ...(typeof search.action === "string" ? { action: search.action } : {}),
    ...(typeof search.fromThread === "string" ? { fromThread: search.fromThread } : {}),
  }),
});

interface PrSearch {
  readonly project: string;
  readonly worktree?: string;
  readonly prKey?: string;
}

// PR review is a layout route (loads the PR once) with deep child pages.
const prLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pr/$prNumber",
  component: PrLayout,
  validateSearch: (search: Record<string, unknown>): PrSearch => ({
    project: typeof search.project === "string" ? search.project : "",
    ...(typeof search.worktree === "string" ? { worktree: search.worktree } : {}),
    ...(typeof search.prKey === "string" && search.prKey ? { prKey: search.prKey } : {}),
  }),
});

const prOverviewRoute = createRoute({
  getParentRoute: () => prLayoutRoute,
  path: "/",
  component: PrOverviewPage,
});
const prChangesRoute = createRoute({
  getParentRoute: () => prLayoutRoute,
  path: "/changes",
  component: PrChangesPage,
});
const prCommitsRoute = createRoute({
  getParentRoute: () => prLayoutRoute,
  path: "/commits",
  component: PrCommitsPage,
});
const prChecksRoute = createRoute({
  getParentRoute: () => prLayoutRoute,
  path: "/checks",
  component: PrChecksPage,
});
const prConversationRoute = createRoute({
  getParentRoute: () => prLayoutRoute,
  path: "/conversation",
  component: PrConversationPage,
});

const prRouteTree = prLayoutRoute.addChildren([
  prOverviewRoute,
  prChangesRoute,
  prCommitsRoute,
  prChecksRoute,
  prConversationRoute,
]);

const routeTree = rootRoute.addChildren([
  indexRoute,
  threadsRoute,
  threadRoute,
  newRoute,
  desktopsRoute,
  moreRoute,
  usageRoute,
  browserRoute,
  projectsRoute,
  settingsRoute,
  settingsSectionRoute,
  workspaceRoute,
  terminalRoute,
  prRouteTree,
]);

// TanStack applies `defaultViewTransition` to EVERY navigation, including native
// back/edge-swipe (popstate) ones, which iOS already animates interactively.
// The `types` callback isn't told the history action, so we mirror it here:
// BACK/FORWARD/GO come from popstate (a gesture/history back), PUSH/REPLACE from
// our own navigate() calls. Set synchronously in the same history-notify loop,
// so it's current when the router later reads the transition types.
let lastNavWasGesture = false;

/**
 * View-transition types for a navigation, consumed by the CSS in styles.css
 * (`:active-view-transition-type(push|pop|fade)`). Returns `false` to skip the
 * transition entirely — the wide split isn't a phone stack and reduced-motion
 * users opt out. Browsers without the View Transitions API fall back to an
 * instant swap automatically.
 */
function navigationTransitionTypes(fromPath: string | undefined, toPath: string): string[] | false {
  if (typeof window !== "undefined") {
    if (window.matchMedia(WIDE_SHELL_QUERY).matches) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  }
  // Leaving the mirrored browser view via a native edge-swipe/back already plays
  // the OS's own interactive back animation; running our `pop` slide on top of it
  // double-animates. Skip our transition for that specific gesture-driven pop.
  if (lastNavWasGesture && fromPath === "/more/browser") return false;
  const type = navigationTransitionType(fromPath, toPath);
  if (!type) return false;
  // Fullscreen overlay screens (workspace / PR / terminal) carry the m-screen
  // transition group; the extra `screen` type lets the CSS hold the page
  // chrome steady while the screen slides over (push) or away (pop).
  if (isFullscreenScreenPath(toPath) || (fromPath && isFullscreenScreenPath(fromPath))) {
    return [type, "screen"];
  }
  return [type];
}

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: false,
  // Native-app screen transitions on the phone layout (View Transitions API).
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) =>
      navigationTransitionTypes(fromLocation?.pathname, toLocation.pathname),
  },
  // Any unmatched path (a stale/typo deep link, a route removed in a later
  // version) redirects to /threads. Rendering null here would leave the home
  // chrome over a permanently blank body; only the exact "/" is handled by the
  // index route's redirect.
  defaultNotFoundComponent: () => <Navigate to="/threads" replace />,
});

// Record the history action for each navigation (see `lastNavWasGesture`). This
// runs synchronously in history's notify loop, before the router's deferred
// startViewTransition reads the transition types, so the flag is always current.
router.history.subscribe(({ action }) => {
  lastNavWasGesture = action.type === "BACK" || action.type === "FORWARD" || action.type === "GO";
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
