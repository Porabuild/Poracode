import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { PullFromSourceDialog } from "@/renderer/views/MainView/parts/PullFromSourceDialog";
import { usePanelStore } from "@/renderer/state/panelStore";
import { MobileAppProvider, type MobileAppContextValue } from "./remoteContext";
import { getStoredPreference, setStoredPreference } from "./storage";
import { UserMessageActionsSheet } from "./UserMessageActionsSheet";
import { useMediaQuery, WIDE_SHELL_QUERY } from "./useMediaQuery";
import { useDeepLinkPairing } from "./useDeepLinkPairing";
import { useRemoteDesktop } from "./useRemoteDesktop";
import { getChrome } from "./chrome";
import { NarrowShell } from "./NarrowShell";
import { WideShell } from "./WideShell";
import { usePushLifecycle } from "./push/usePushLifecycle";

const PROJECT_FILTER_PREF = "threads.projectFilter";

/**
 * Root route component: owns the single remote session, exposes it to every
 * route through context, restores the persisted thread filter, and renders the
 * route-aware shell chrome around the active route's <Outlet/>.
 */
export function RootLayout() {
  const remote = useRemoteDesktop();
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Native-only: push notifications + foreground Live Activities. Inert on the
  // PWA/web (guarded by isNativeApp inside the hook).
  usePushLifecycle({
    connected: remote.connection === "online",
    activeDesktop: remote.activeDesktop,
  });

  // Universal Links: route a pairing link that opens the installed app (cold
  // start or foregrounded) to the connections screen for the user to confirm.
  // Also surfaces a PWA boot launch captured from window.location.
  useDeepLinkPairing();

  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchHost, setThreadSearchHost] = useState<HTMLDivElement | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  // A hidden header on /threads must not leak into the next screen; the list
  // remounts scrolled to top on return, so re-anchor on every route change.
  useEffect(() => {
    setChromeHidden(false);
  }, [pathname]);

  const [projectFilter, setProjectFilterState] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getStoredPreference(PROJECT_FILTER_PREF).then((stored) => {
      if (cancelled || !stored) return;
      // Don't clobber a filter the user picked while this async read was still
      // in flight; only seed when nothing has been chosen yet.
      setProjectFilterState((current) => current ?? stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const validProjectFilter =
    projectFilter && remote.projects.some((project) => project.id === projectFilter)
      ? projectFilter
      : null;
  function setProjectFilter(next: string | null) {
    setProjectFilterState(next);
    void setStoredPreference(PROJECT_FILTER_PREF, next ?? "");
  }

  // First launch without a paired desktop lands on pairing.
  useEffect(() => {
    if (pathname === "/threads" && remote.booted && remote.desktops.length === 0) {
      void navigate({ to: "/desktops" });
    }
  }, [pathname, remote.booted, remote.desktops.length, navigate]);

  // Connection-state problems (offline / reconnecting / unauthorized / error)
  // are shown by the ConnectionBanner; only surface action-level errors that
  // occur while the session is live as a toast, so we don't double-message.
  const connectionRef = useRef(remote.connection);
  connectionRef.current = remote.connection;
  useEffect(() => {
    if (remote.message && connectionRef.current === "online") toast.danger(remote.message);
  }, [remote.message]);

  // The reused desktop PrSection opens PR review by writing panelStore; bridge
  // that one-shot signal into a route push so PR review is a real screen.
  const prReviewContext = usePanelStore((state) => state.prReviewContext);
  const handledPrContextRef = useRef<typeof prReviewContext>(null);
  useEffect(() => {
    if (!prReviewContext) {
      handledPrContextRef.current = null;
      return;
    }
    // Process each distinct context object exactly once; clearing the store
    // below would otherwise re-enter with null, and a new object can arrive
    // before navigate() resolves.
    if (handledPrContextRef.current === prReviewContext) return;
    handledPrContextRef.current = prReviewContext;
    usePanelStore.getState().setPrReviewContext(null);
    void navigate({
      to: "/pr/$prNumber",
      params: { prNumber: String(prReviewContext.prNumber) },
      search: {
        project: prReviewContext.projectId,
        ...(prReviewContext.worktreePath ? { worktree: prReviewContext.worktreePath } : {}),
        ...(prReviewContext.prKey ? { prKey: prReviewContext.prKey } : {}),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable; guarded by ref
  }, [prReviewContext]);

  // Some reused desktop git actions open the git review overlay/panel through
  // panelStore. Route that signal into the mobile workspace changes screen.
  const gitReviewContext = usePanelStore((state) => state.gitReviewContext);
  const gitOverlayOpen = usePanelStore((state) => state.gitOverlayOpen);
  const gitReviewAsPanel = usePanelStore((state) => state.gitReviewAsPanel);
  const handledGitContextRef = useRef<typeof gitReviewContext>(null);
  useEffect(() => {
    if (!gitReviewContext || (!gitOverlayOpen && !gitReviewAsPanel)) {
      handledGitContextRef.current = null;
      return;
    }
    if (handledGitContextRef.current === gitReviewContext) return;
    const thread = remote.threads.find((entry) => {
      if (entry.projectId !== gitReviewContext.projectId) return false;
      return gitReviewContext.worktreePath
        ? entry.worktreePath === gitReviewContext.worktreePath
        : !entry.worktreePath;
    });
    // Consume the one-shot signal unconditionally so the overlay/panel flags
    // never stay stuck set — even when no open thread matches the worktree
    // (e.g. it was archived while the worktree persists), where there is simply
    // no workspace screen to route to.
    handledGitContextRef.current = gitReviewContext;
    const panelStore = usePanelStore.getState();
    panelStore.setGitOverlayOpen(false);
    panelStore.setGitReviewAsPanel(false);
    panelStore.setGitReviewContext(null);
    if (!thread) return;
    void navigate({
      to: "/workspace/$threadId",
      params: { threadId: thread.id },
      search: { tab: "changes" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable; guarded by ref
  }, [gitReviewContext, gitOverlayOpen, gitReviewAsPanel, remote.threads]);

  const context: MobileAppContextValue = {
    remote,
    projectFilter: validProjectFilter,
    setProjectFilter,
    threadSearchOpen,
    setThreadSearchOpen,
    threadSearchHost,
    setChromeHidden,
  };

  return (
    <MobileAppProvider value={context}>
      {isWide ? (
        <WideShell
          remote={remote}
          pathname={pathname}
          projectFilter={validProjectFilter}
          setProjectFilter={setProjectFilter}
        />
      ) : (
        <NarrowShell
          remote={remote}
          chrome={getChrome(pathname)}
          pathname={pathname}
          searchOpen={threadSearchOpen}
          onSearchOpenChange={setThreadSearchOpen}
          onSearchHostChange={setThreadSearchHost}
          chromeHidden={chromeHidden}
        />
      )}
      <PullFromSourceDialog />
      <UserMessageActionsSheet />
    </MobileAppProvider>
  );
}
