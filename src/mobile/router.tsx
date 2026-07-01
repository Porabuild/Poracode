import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { capturePairingLaunch } from "./pairing";
import { RootLayout } from "./RootLayout";
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
  ): { readonly worktree?: string; readonly action?: string } => ({
    ...(typeof search.worktree === "string" ? { worktree: search.worktree } : {}),
    ...(typeof search.action === "string" ? { action: search.action } : {}),
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

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: false,
  // The shell handles "no route" by redirecting to /threads via the index route.
  defaultNotFoundComponent: () => null,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
