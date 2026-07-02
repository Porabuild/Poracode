import { useEffect, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronLeft,
  Ellipsis,
  FolderGit2,
  Gauge,
  Globe,
  Plus,
  Search,
  Server,
  Settings2,
} from "lucide-react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { PullFromSourceDialog } from "@/renderer/views/MainView/parts/PullFromSourceDialog";
import { usePanelStore } from "@/renderer/state/panelStore";
import { ConnectionBanner, ConnectionPill, SheetMenu } from "./components";
import { preselectWorktreeDraft, runThreadAction, threadIdFromPath } from "./navHelpers";
import { MobileAppProvider, type MobileAppContextValue } from "./remoteContext";
import { getStoredPreference, setStoredPreference } from "./storage";
import { ThreadTitleRow } from "./ThreadTitleRow";
import { ThreadUsageIndicator } from "./ThreadUsageIndicator";
import { UserMessageActionsSheet } from "./UserMessageActionsSheet";
import { useMediaQuery, WIDE_SHELL_QUERY } from "./useMediaQuery";
import { useRemoteDesktop, type RemoteDesktopSession } from "./useRemoteDesktop";
import { useSwipeBack } from "./useSwipeBack";
import { getSettingsSectionLabel, isDesktopSettingsSection } from "./settingsSections";
import { usePushLifecycle } from "./push/usePushLifecycle";
import { ThreadsView } from "./views/ThreadsView";

const PROJECT_FILTER_PREF = "threads.projectFilter";

/** Route-derived narrow-layout chrome: home, a pushed subscreen, or a thread. */
type Chrome =
  | { readonly layout: "home" }
  | {
      readonly layout: "subscreen";
      readonly title: MessageDescriptor;
      readonly backTo: "/threads" | "/more" | "/more/settings";
    }
  | { readonly layout: "thread" }
  | { readonly layout: "fullscreen" };

function getChrome(pathname: string): Chrome {
  if (pathname.startsWith("/thread/")) return { layout: "thread" };
  if (
    pathname.startsWith("/workspace/") ||
    pathname.startsWith("/pr/") ||
    pathname.startsWith("/terminal/")
  ) {
    // These render their own full-screen chrome (own header + back button), so
    // the shell shows no top bar at all.
    return { layout: "fullscreen" };
  }
  const sectionMatch = /^\/more\/settings\/(.+)$/.exec(pathname);
  if (sectionMatch?.[1]) {
    const id = decodeURIComponent(sectionMatch[1]);
    // Device sections are listed flat on the More screen; only desktop-syncing
    // sections sit behind the Desktop Settings subscreen.
    return {
      layout: "subscreen",
      title: getSettingsSectionLabel(id) ?? msg`Settings`,
      backTo: isDesktopSettingsSection(id) ? "/more/settings" : "/more",
    };
  }
  if (pathname === "/more/settings") {
    return { layout: "subscreen", title: msg`Desktop Settings`, backTo: "/more" };
  }
  // These are pushed straight from the home header's quick menu.
  if (pathname === "/more/usage") {
    return { layout: "subscreen", title: msg`Usage`, backTo: "/threads" };
  }
  if (pathname === "/more/browser") {
    return { layout: "subscreen", title: msg`Browser`, backTo: "/threads" };
  }
  if (pathname === "/more/projects") {
    return { layout: "subscreen", title: msg`Projects`, backTo: "/threads" };
  }
  if (pathname === "/more") {
    return { layout: "subscreen", title: msg`Settings`, backTo: "/threads" };
  }
  if (pathname === "/new") {
    return { layout: "subscreen", title: msg`New thread`, backTo: "/threads" };
  }
  if (pathname === "/desktops") {
    return { layout: "subscreen", title: msg`Connections`, backTo: "/threads" };
  }
  return { layout: "home" };
}

function Brand(props: { readonly subtitle?: string | undefined; readonly onPress: () => void }) {
  // Desktop labels default to "Lightcode on <host>"; the header only needs the host.
  const label = props.subtitle?.replace(/^Lightcode\s+on\s+/i, "");
  return (
    <button className="m-brand" type="button" onClick={props.onPress}>
      <span className="m-brand__title">{label || "Lightcode"}</span>
    </button>
  );
}

function ConnectionControl(props: {
  readonly remote: RemoteDesktopSession;
  readonly onPair: () => void;
}) {
  const { remote } = props;
  // Healthy is silent: the pill appears only when the session needs attention
  // (booting/pairing spinner, reconnecting, offline, expired, errored) and is
  // itself the recovery action.
  if (remote.connection === "online") return null;
  return (
    <ConnectionPill
      state={remote.connection}
      onPress={() => {
        if (remote.connection === "unauthorized") {
          props.onPair();
        } else {
          remote.reconnect();
        }
      }}
    />
  );
}

/** Phone chrome: route-aware top bar + the routed page. Navigation is
 * header-driven (search / More) with edge-swipe back — no bottom tab bar. */
function NarrowShell(props: {
  readonly remote: RemoteDesktopSession;
  readonly chrome: Chrome;
  readonly pathname: string;
  readonly searchOpen: boolean;
  readonly onToggleSearch: () => void;
  readonly chromeHidden: boolean;
}) {
  const { remote, chrome, pathname } = props;
  const navigate = useNavigate();
  const { t } = useLingui();
  const shellRef = useRef<HTMLDivElement | null>(null);

  // Edge-swipe back mirrors the header back button: subscreens pop to their
  // parent, a thread pops to the list. Home has nowhere to go; fullscreen
  // routes own their chrome (and their own horizontal gestures).
  const swipeBackTo =
    chrome.layout === "thread" ? "/threads" : chrome.layout === "subscreen" ? chrome.backTo : null;
  useSwipeBack(shellRef, swipeBackTo !== null, () => {
    if (swipeBackTo) void navigate({ to: swipeBackTo });
  });

  // `remote.selectedThread` falls back to the most-recent thread, so on a stale
  // /thread/:id deep link (thread deleted elsewhere) it points at the wrong
  // thread. Only trust it for thread chrome when it matches the routed id;
  // otherwise the header must not offer actions that would hit that other thread.
  const routedThreadId = threadIdFromPath(pathname);
  const headerThread =
    chrome.layout === "thread" &&
    remote.selectedThread &&
    remote.selectedThread.id === routedThreadId
      ? remote.selectedThread
      : null;

  // Fullscreen routes (git panel, PR review) render their own chrome.
  if (chrome.layout === "fullscreen") {
    return (
      <div className="m-shell" ref={shellRef}>
        <Outlet />
      </div>
    );
  }

  return (
    <div
      className="m-shell"
      ref={shellRef}
      data-chrome-hidden={(chrome.layout === "home" && props.chromeHidden) || undefined}
    >
      <header className="m-topbar">
        {chrome.layout === "thread" ? (
          <>
            <button
              className="m-back"
              type="button"
              onClick={() => void navigate({ to: "/threads" })}
            >
              <ChevronLeft className="size-5" />
            </button>
            {headerThread ? (
              <ThreadTitleRow
                thread={headerThread}
                threads={remote.threads}
                onAction={(action) =>
                  runThreadAction(
                    remote,
                    headerThread,
                    action,
                    () => void navigate({ to: "/threads" }),
                  )
                }
                onNewThreadInWorktree={(input) => {
                  preselectWorktreeDraft(input);
                  void navigate({ to: "/new" });
                }}
                onDeleteWorktreeGroup={(input) => {
                  void remote.deleteWorktreeGroup(input);
                  void navigate({ to: "/threads" });
                }}
                onOpenTerminal={() =>
                  void navigate({
                    to: "/terminal/$projectId",
                    params: { projectId: headerThread.projectId },
                    search: {
                      fromThread: headerThread.id,
                      ...(headerThread.worktreePath ? { worktree: headerThread.worktreePath } : {}),
                    },
                  })
                }
              />
            ) : (
              <span className="m-topbar__thread">
                <span className="m-topbar__title">
                  <Trans>Thread</Trans>
                </span>
              </span>
            )}
            {headerThread ? <ThreadUsageIndicator thread={headerThread} /> : null}
          </>
        ) : chrome.layout === "subscreen" ? (
          <>
            <button
              className="m-back"
              type="button"
              onClick={() => void navigate({ to: chrome.backTo })}
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="m-topbar__thread">
              <span className="m-topbar__title">{t(chrome.title)}</span>
            </span>
          </>
        ) : (
          <>
            <Brand
              subtitle={remote.activeDesktop?.label}
              onPress={() => void navigate({ to: "/threads" })}
            />
            <button
              className="m-topbar-icon"
              type="button"
              aria-label={t`Search threads`}
              aria-pressed={props.searchOpen}
              onClick={props.onToggleSearch}
            >
              <Search className="size-5" />
            </button>
            {/* Quick-access destinations live in a sheet menu; Settings (the
                full page) is deliberately the last entry. */}
            <SheetMenu
              label={t`More`}
              items={[
                { id: "usage", label: t`Usage`, icon: <Gauge className="size-4 text-muted" /> },
                {
                  id: "desktops",
                  label: t`Connections`,
                  icon: <Server className="size-4 text-muted" />,
                },
                {
                  id: "projects",
                  label: t`Projects`,
                  icon: <FolderGit2 className="size-4 text-muted" />,
                },
                { id: "browser", label: t`Browser`, icon: <Globe className="size-4 text-muted" /> },
                {
                  id: "settings",
                  label: t`Settings`,
                  icon: <Settings2 className="size-4 text-muted" />,
                },
              ]}
              onSelect={(id) => {
                const to =
                  id === "usage"
                    ? "/more/usage"
                    : id === "desktops"
                      ? "/desktops"
                      : id === "projects"
                        ? "/more/projects"
                        : id === "browser"
                          ? "/more/browser"
                          : "/more";
                void navigate({ to });
              }}
              trigger={({ open }) => (
                <button className="m-topbar-icon" type="button" aria-label={t`More`} onClick={open}>
                  <Ellipsis className="size-5" />
                </button>
              )}
            />
          </>
        )}
        <ConnectionControl remote={remote} onPair={() => void navigate({ to: "/desktops" })} />
      </header>

      <main className="m-main">
        <Outlet />
      </main>
    </div>
  );
}

/** Tablet/desktop chrome: a persistent thread sidebar + the routed detail pane. */
function WideShell(props: {
  readonly remote: RemoteDesktopSession;
  readonly pathname: string;
  readonly projectFilter: string | null;
  readonly setProjectFilter: (next: string | null) => void;
}) {
  const { remote, pathname, projectFilter, setProjectFilter } = props;
  const navigate = useNavigate();
  const { t } = useLingui();
  const selectedThreadId = threadIdFromPath(pathname);

  return (
    <div className="m-shell m-shell--wide">
      <aside className="m-sidebar">
        <header className="m-sidebar__head">
          <Brand
            subtitle={remote.activeDesktop?.label}
            onPress={() => void navigate({ to: "/threads" })}
          />
          <ConnectionControl remote={remote} onPair={() => void navigate({ to: "/desktops" })} />
        </header>
        <div className="m-sidebar__actions">
          <Button
            className="flex-1 text-white"
            size="sm"
            variant="secondary"
            onPress={() => void navigate({ to: "/new" })}
          >
            <Plus className="size-4" />
            <Trans>New thread</Trans>
          </Button>
          <Button
            aria-label={t`Usage`}
            className="text-foreground"
            size="sm"
            variant="secondary"
            isIconOnly
            onPress={() => void navigate({ to: "/more/usage" })}
          >
            <Gauge className="size-4" />
          </Button>
          <Button
            aria-label={t`More`}
            className="text-foreground"
            size="sm"
            variant="secondary"
            isIconOnly
            onPress={() => void navigate({ to: "/more" })}
          >
            <Ellipsis className="size-4" />
          </Button>
        </div>
        <div className="m-sidebar__scroll">
          <ThreadsView
            projects={remote.projects}
            threads={remote.threads}
            selectedThreadId={selectedThreadId}
            projectFilter={projectFilter}
            loading={!remote.booted}
            onProjectFilterChange={setProjectFilter}
            onOpenThread={(thread) => {
              void remote.openThread(thread);
              void navigate({ to: "/thread/$threadId", params: { threadId: thread.id } });
            }}
            onThreadAction={(thread, action) => {
              void remote.applyThreadAction(thread, action);
            }}
            onDeleteWorktreeGroup={(input) => {
              void remote.deleteWorktreeGroup(input);
            }}
            onNew={() => void navigate({ to: "/new" })}
            onNewThreadInWorktree={(input) => {
              preselectWorktreeDraft(input);
              void navigate({ to: "/new" });
            }}
            onOpenTerminal={(input) =>
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  ...(input.sourceThreadId ? { fromThread: input.sourceThreadId } : {}),
                  ...(input.worktreePath ? { worktree: input.worktreePath } : {}),
                },
              })
            }
            onRunProjectAction={(input) =>
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  action: input.actionId,
                  ...(input.sourceThreadId ? { fromThread: input.sourceThreadId } : {}),
                  ...(input.worktreePath ? { worktree: input.worktreePath } : {}),
                },
              })
            }
          />
        </div>
        <footer className="m-sidebar__foot">
          <button
            type="button"
            className="m-sidebar__desktops"
            data-active={pathname === "/desktops"}
            onClick={() => void navigate({ to: "/desktops" })}
          >
            <Server className="size-4" />
            <span>
              <strong>{remote.activeDesktop?.label ?? t`No connection paired`}</strong>
              <span>
                <Plural
                  value={remote.desktops.length}
                  one="# paired desktop"
                  other="# paired desktops"
                />
              </span>
            </span>
          </button>
        </footer>
      </aside>
      <main className="m-detail">
        <ConnectionBanner
          state={remote.connection}
          message={remote.message}
          onReconnect={remote.reconnect}
          onPair={() => void navigate({ to: "/desktops" })}
        />
        <Outlet />
      </main>
    </div>
  );
}

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

  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  // A hidden header on /threads must not leak into the next screen; the list
  // remounts scrolled to top on return, so re-anchor on every route change.
  useEffect(() => {
    setChromeHidden(false);
  }, [pathname]);

  const [projectFilter, setProjectFilterState] = useState<string | null>(null);
  useEffect(() => {
    void getStoredPreference(PROJECT_FILTER_PREF).then((stored) => {
      if (stored) setProjectFilterState(stored);
    });
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
    if (remote.booted && remote.desktops.length === 0) {
      void navigate({ to: "/desktops" });
    }
  }, [remote.booted, remote.desktops.length, navigate]);

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
    if (!thread) return;
    handledGitContextRef.current = gitReviewContext;
    const panelStore = usePanelStore.getState();
    panelStore.setGitOverlayOpen(false);
    panelStore.setGitReviewAsPanel(false);
    panelStore.setGitReviewContext(null);
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
          onToggleSearch={() => setThreadSearchOpen(!threadSearchOpen)}
          chromeHidden={chromeHidden}
        />
      )}
      <PullFromSourceDialog />
      <UserMessageActionsSheet />
    </MobileAppProvider>
  );
}
