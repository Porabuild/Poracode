import { useEffect, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ChevronLeft, Ellipsis, Gauge, Home, Plus, Server } from "lucide-react";
import type { ReactNode } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { PullFromSourceDialog } from "@/renderer/views/MainView/parts/PullFromSourceDialog";
import { usePanelStore } from "@/renderer/state/panelStore";
import { ConnectionBanner, ConnectionPill } from "./components";
import { preselectWorktreeDraft, runThreadAction, threadIdFromPath } from "./navHelpers";
import { MobileAppProvider, type MobileAppContextValue } from "./remoteContext";
import { getStoredPreference, setStoredPreference } from "./storage";
import { ThreadTitleRow } from "./ThreadTitleRow";
import { useMediaQuery, WIDE_SHELL_QUERY } from "./useMediaQuery";
import { useRemoteDesktop, type RemoteDesktopSession } from "./useRemoteDesktop";
import { getSettingsSectionLabel } from "./settingsSections";
import { ThreadsView } from "./views/ThreadsView";

const PROJECT_FILTER_PREF = "threads.projectFilter";

type TabKey = "threads" | "new" | "desktops" | "usage" | "more";

/** Route-derived narrow-layout chrome: which top bar + tab bar to render. */
type Chrome =
  | { readonly layout: "tab"; readonly tab: TabKey }
  | {
      readonly layout: "subscreen";
      readonly title: MessageDescriptor;
      readonly backTo: "/more" | "/more/settings";
      readonly tab: "more";
    }
  | { readonly layout: "thread" }
  | { readonly layout: "fullscreen" };

function getChrome(pathname: string): Chrome {
  if (pathname.startsWith("/thread/")) return { layout: "thread" };
  if (pathname.startsWith("/workspace/") || pathname.startsWith("/pr/")) {
    return { layout: "fullscreen" };
  }
  const sectionMatch = /^\/more\/settings\/(.+)$/.exec(pathname);
  if (sectionMatch?.[1]) {
    const id = decodeURIComponent(sectionMatch[1]);
    return {
      layout: "subscreen",
      title: getSettingsSectionLabel(id) ?? msg`Settings`,
      backTo: "/more/settings",
      tab: "more",
    };
  }
  if (pathname === "/more/settings") {
    return { layout: "subscreen", title: msg`Settings`, backTo: "/more", tab: "more" };
  }
  if (pathname === "/more/usage") return { layout: "tab", tab: "usage" };
  if (pathname === "/more/browser") {
    return { layout: "subscreen", title: msg`Browser`, backTo: "/more", tab: "more" };
  }
  if (pathname === "/more/projects") {
    return { layout: "subscreen", title: msg`Projects`, backTo: "/more", tab: "more" };
  }
  if (pathname === "/more") return { layout: "tab", tab: "more" };
  if (pathname === "/new") return { layout: "tab", tab: "new" };
  if (pathname === "/desktops") return { layout: "tab", tab: "desktops" };
  return { layout: "tab", tab: "threads" };
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

function TabButton(props: {
  readonly active: boolean;
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly onPress: () => void;
}) {
  return (
    <button className="m-tab" data-active={props.active} type="button" onClick={props.onPress}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function ConnectionControl(props: {
  readonly remote: RemoteDesktopSession;
  readonly onPair: () => void;
}) {
  const { remote } = props;
  return (
    <ConnectionPill
      state={remote.connection}
      onPress={() => {
        // The header pill replaces the connection banner: it both reports state
        // and is the recovery action. Pair again when the session expired,
        // reconnect when offline/errored/reconnecting, otherwise just re-sync.
        if (remote.connection === "unauthorized") {
          props.onPair();
        } else if (remote.connection === "online") {
          void remote.refresh(remote.activeDesktop, { refreshSelectedThread: true });
        } else {
          remote.reconnect();
        }
      }}
    />
  );
}

/** Phone chrome: route-aware top bar + the routed page + the bottom tab bar. */
function NarrowShell(props: { readonly remote: RemoteDesktopSession; readonly chrome: Chrome }) {
  const { remote, chrome } = props;
  const navigate = useNavigate();
  const { t } = useLingui();

  // Fullscreen routes (git panel, PR review) render their own chrome.
  if (chrome.layout === "fullscreen") {
    return (
      <div className="m-shell">
        <Outlet />
      </div>
    );
  }

  const activeTab = chrome.layout === "tab" ? chrome.tab : "more";

  return (
    <div className="m-shell">
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
            {remote.selectedThread ? (
              <ThreadTitleRow
                thread={remote.selectedThread}
                onAction={(action) =>
                  runThreadAction(
                    remote,
                    remote.selectedThread,
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
              />
            ) : (
              <span className="m-topbar__thread">
                <span className="m-topbar__title">
                  <Trans>Thread</Trans>
                </span>
              </span>
            )}
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
          <Brand
            subtitle={remote.activeDesktop?.label}
            onPress={() => void navigate({ to: "/threads" })}
          />
        )}
        <ConnectionControl remote={remote} onPair={() => void navigate({ to: "/desktops" })} />
      </header>

      <main className="m-main">
        <Outlet />
      </main>

      {chrome.layout === "thread" ? null : (
        <nav className="m-tabbar" aria-label={t`Lightcode mobile navigation`}>
          <TabButton
            active={activeTab === "threads"}
            icon={<Home className="size-4" />}
            label={t`Threads`}
            onPress={() => void navigate({ to: "/threads" })}
          />
          <TabButton
            active={activeTab === "usage"}
            icon={<Gauge className="size-4" />}
            label={t`Usage`}
            onPress={() => void navigate({ to: "/more/usage" })}
          />
          <TabButton
            active={activeTab === "new"}
            icon={<Plus className="size-4" />}
            label={t`New`}
            onPress={() => void navigate({ to: "/new" })}
          />
          <TabButton
            active={activeTab === "desktops"}
            icon={<Server className="size-4" />}
            label={t`Desktops`}
            onPress={() => void navigate({ to: "/desktops" })}
          />
          <TabButton
            active={activeTab === "more"}
            icon={<Ellipsis className="size-4" />}
            label={t`More`}
            onPress={() => void navigate({ to: "/more" })}
          />
        </nav>
      )}
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
                search: input.worktreePath ? { worktree: input.worktreePath } : {},
              })
            }
            onRunProjectAction={(input) =>
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  action: input.actionId,
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
              <strong>{remote.activeDesktop?.label ?? t`No desktop paired`}</strong>
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
        <NarrowShell remote={remote} chrome={getChrome(pathname)} />
      )}
      <PullFromSourceDialog />
    </MobileAppProvider>
  );
}
