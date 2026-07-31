import { useEffect, useRef } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronLeft,
  Ellipsis,
  FolderGit2,
  Gauge,
  Globe,
  Plug,
  Search,
  Server,
  Settings2,
} from "lucide-react";
import { Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import { SubAgentHeaderText } from "@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay";
import { ConnectionPill, SheetMenu } from "./components";
import { NarrowThreadHostProvider } from "./narrowThreadHostContext";
import { preselectWorktreeDraft, runThreadAction } from "./navHelpers";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { ThreadDetail } from "./ThreadDetail";
import { ThreadTitleRow } from "./ThreadTitleRow";
import { ThreadUsageIndicator } from "./ThreadUsageIndicator";
import { useHeldThreadHeader } from "./useHeldThreadHeader";
import { useLightweightThreadListPop } from "./useLightweightThreadListPop";
import type { RemoteDesktopSession } from "./useRemoteDesktop";
import { useSwipeBack } from "./useSwipeBack";
import type { Chrome } from "./chrome";

/** Header/sidebar brand mark shared by {@link NarrowShell} and the wide shell. */
export function Brand(props: { readonly onPress: () => void }) {
  return (
    <button className="m-brand" type="button" onClick={props.onPress}>
      <BrandWordmark className="m-brand__wordmark" />
    </button>
  );
}

/** Header/sidebar connection indicator that doubles as the recovery action.
 * Shared by {@link NarrowShell} and the wide-shell sidebar. */
export function ConnectionControl(props: {
  readonly remote: RemoteDesktopSession;
  readonly onPair: () => void;
  readonly showDesktopName?: boolean;
}) {
  const { remote } = props;
  if (!remote.activeDesktop) return null;
  if (remote.connection === "online" && !props.showDesktopName) return null;
  return (
    <ConnectionPill
      state={remote.connection}
      {...(props.showDesktopName ? { label: desktopTitle(remote.activeDesktop.label) } : {})}
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

/** Trigger button for the home screen's "More" `SheetMenu`: opens the sheet
 * of quick-access destinations on press. */
function MoreMenuTrigger(props: { readonly onPress: () => void }) {
  const { t } = useLingui();
  return (
    <button
      className="m-home-compose-action"
      type="button"
      aria-label={t`More`}
      onClick={props.onPress}
    >
      <Ellipsis className="size-5" />
    </button>
  );
}

/**
 * Renders the "More" `SheetMenu`'s `trigger` function. Kept at module scope
 * (rather than an inline arrow in JSX) so `NarrowShell`'s render body never
 * defines a fresh component.
 */
function renderMoreMenuTrigger(api: { readonly open: () => void; readonly isOpen: boolean }) {
  return <MoreMenuTrigger onPress={api.open} />;
}

/** Phone chrome: route-aware top bar + the routed page. Navigation is
 * header-driven (search / More) with edge-swipe back — no bottom tab bar. */
export function NarrowShell(props: {
  readonly remote: RemoteDesktopSession;
  readonly chrome: Chrome;
  readonly pathname: string;
  readonly searchOpen: boolean;
  readonly onSearchOpenChange: (open: boolean) => void;
  readonly onSearchHostChange: (element: HTMLDivElement | null) => void;
}) {
  const { remote, chrome, pathname } = props;
  const navigate = useNavigate();
  const router = useRouter();
  const { t } = useLingui();
  const hasActiveDesktop = remote.activeDesktop !== null;
  const hostedThreadId =
    chrome.layout === "thread" || chrome.layout === "subagent" ? chrome.threadId : null;
  const hostedThread = hostedThreadId
    ? (remote.threads.find((thread) => thread.id === hostedThreadId) ?? null)
    : null;
  const subagentCoversThread = chrome.layout === "subagent";
  const shellRef = useRef<HTMLDivElement | null>(null);
  useLightweightThreadListPop(shellRef, pathname);
  const ignoreSearchClickRef = useRef(false);
  const ignoreSearchClickTimerRef = useRef<number | null>(null);

  const clearIgnoreSearchClickTimer = () => {
    if (!ignoreSearchClickTimerRef.current) return;
    window.clearTimeout(ignoreSearchClickTimerRef.current);
    ignoreSearchClickTimerRef.current = null;
  };
  useEffect(() => () => clearIgnoreSearchClickTimer(), []);

  // Edge-swipe back mirrors the header back button: subscreens pop to their
  // parent, a thread pops to the list. Home has nowhere to go; fullscreen
  // routes own their chrome (and their own horizontal gestures).
  const canSwipeBack =
    chrome.layout === "thread" || chrome.layout === "subscreen" || chrome.layout === "subagent";
  const navigateBack = () => {
    if (chrome.layout === "thread") {
      void navigate({ to: "/threads" });
    } else if (chrome.layout === "subscreen") {
      void navigate({ to: chrome.backTo });
    } else if (chrome.layout === "subagent") {
      if (router.history.canGoBack()) {
        router.history.back();
      } else {
        void navigate({
          to: "/thread/$threadId",
          params: { threadId: chrome.threadId },
          replace: true,
        });
      }
    }
  };
  useSwipeBack(shellRef, canSwipeBack, navigateBack);

  const { headerThread, visibleHeldThreadHeader } = useHeldThreadHeader({
    pathname,
    chromeLayout: chrome.layout,
    selectedThread: remote.selectedThread,
    threads: remote.threads,
  });

  // One stable tree for every layout: the routed <Outlet/> always lives inside
  // <main className="m-main">, so React never repositions (and thus never
  // remounts) the routed subtree when the chrome flips between fullscreen and
  // the regular shell. A positional remount would wipe the thread composer's
  // state and hand the view transition a half-mounted page to snapshot.
  // For ordinary routes styles.css captures this whole shell as one transition
  // image, so the header and routed page cannot be composited from different
  // route states. Fullscreen routes (workspace, PR review, terminal) render
  // their own fixed overlay and opt the shell out of that transition group.
  // The shell's top bar stays MOUNTED for them too — the opaque z-50 overlay
  // covers it, and `visibility: hidden` keeps its layout height so .m-main and
  // the page beneath never reflow into the status-bar safe zone.
  return (
    <div className="m-shell" ref={shellRef} data-chrome={chrome.layout}>
      <header className="m-topbar" data-chrome-layout={chrome.layout}>
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
                  void navigate({ to: "/threads" });
                }}
                onDeleteWorktreeGroup={(input) => {
                  void remote.deleteWorktreeGroup(input);
                  void navigate({ to: "/threads" });
                }}
                onOpenNotes={() =>
                  void navigate({
                    to: "/notes/$threadId",
                    params: { threadId: headerThread.id },
                  })
                }
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
        ) : chrome.layout === "subagent" ? (
          <>
            <button className="m-back" type="button" onClick={navigateBack}>
              <ChevronLeft className="size-5" />
            </button>
            <SubAgentHeaderText threadId={chrome.threadId} parentItemId={chrome.parentItemId} />
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
            <div className="m-home-brand-cluster">
              <Brand onPress={() => void navigate({ to: "/threads" })} />
              <ConnectionControl
                remote={remote}
                onPair={() => void navigate({ to: "/desktops" })}
              />
            </div>
            <div className="m-topbar-search" ref={props.onSearchHostChange} />
          </>
        )}
        {chrome.layout === "home" ? null : (
          <ConnectionControl remote={remote} onPair={() => void navigate({ to: "/desktops" })} />
        )}
      </header>
      {visibleHeldThreadHeader ? (
        <header
          className="m-topbar m-topbar--transition-hold"
          data-chrome-layout="thread"
          aria-hidden="true"
          inert
        >
          <button className="m-back" type="button" tabIndex={-1}>
            <ChevronLeft className="size-5" />
          </button>
          <ThreadTitleRow
            thread={visibleHeldThreadHeader.thread}
            threads={visibleHeldThreadHeader.threads}
            onAction={() => undefined}
            onNewThreadInWorktree={() => undefined}
            onDeleteWorktreeGroup={() => undefined}
            onOpenNotes={() => undefined}
            onOpenTerminal={() => undefined}
          />
          <ThreadUsageIndicator thread={visibleHeldThreadHeader.thread} />
          <ConnectionControl remote={remote} onPair={() => undefined} />
        </header>
      ) : null}

      <main className="m-main">
        <NarrowThreadHostProvider value>
          {hostedThreadId ? (
            <div
              className="m-thread-route-host"
              data-covered={subagentCoversThread || undefined}
              aria-hidden={subagentCoversThread || undefined}
              {...(subagentCoversThread ? { inert: true } : {})}
            >
              <ThreadDetail thread={hostedThread} hideHeader />
            </div>
          ) : null}
          <Outlet />
        </NarrowThreadHostProvider>
      </main>
      {chrome.layout === "home" ? (
        <div className="m-home-compose-actions">
          <button
            className="m-home-compose-action"
            type="button"
            aria-label={t`Search threads`}
            aria-pressed={props.searchOpen}
            onPointerDown={(event) => {
              if (!props.searchOpen) return;
              event.preventDefault();
              ignoreSearchClickRef.current = true;
              clearIgnoreSearchClickTimer();
              ignoreSearchClickTimerRef.current = window.setTimeout(() => {
                ignoreSearchClickRef.current = false;
                ignoreSearchClickTimerRef.current = null;
              }, 700);
              props.onSearchOpenChange(false);
            }}
            onPointerCancel={() => {
              ignoreSearchClickRef.current = false;
              clearIgnoreSearchClickTimer();
            }}
            onClick={() => {
              if (ignoreSearchClickRef.current) {
                ignoreSearchClickRef.current = false;
                clearIgnoreSearchClickTimer();
                return;
              }
              props.onSearchOpenChange(!props.searchOpen);
            }}
          >
            <Search className="size-5" />
          </button>
          {/* Quick-access destinations live in a sheet menu; Settings (the
              full page) is deliberately the last entry. */}
          <SheetMenu
            label={t`More`}
            items={[
              {
                id: "usage",
                label: t`Usage`,
                icon: <Gauge className="size-4 text-muted" />,
                disabled: !hasActiveDesktop,
              },
              {
                id: "desktops",
                label: t`Connections`,
                icon: <Server className="size-4 text-muted" />,
              },
              {
                id: "projects",
                label: t`Projects`,
                icon: <FolderGit2 className="size-4 text-muted" />,
                disabled: !hasActiveDesktop,
              },
              {
                id: "browser",
                label: t`Browser`,
                icon: <Globe className="size-4 text-muted" />,
                disabled: !hasActiveDesktop,
              },
              {
                id: "ports",
                label: t`Ports`,
                icon: <Plug className="size-4 text-muted" />,
                disabled: !hasActiveDesktop,
              },
              {
                id: "settings",
                label: t`Settings`,
                icon: <Settings2 className="size-4 text-muted" />,
              },
            ]}
            onSelect={(id) => {
              const to =
                id === "usage"
                  ? "/usage"
                  : id === "desktops"
                    ? "/desktops"
                    : id === "projects"
                      ? "/projects"
                      : id === "browser"
                        ? "/browser"
                        : id === "ports"
                          ? "/ports"
                          : "/settings";
              void navigate({ to });
            }}
            trigger={renderMoreMenuTrigger}
          />
        </div>
      ) : null}
    </div>
  );
}
