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
import { Outlet, useNavigate } from "@tanstack/react-router";
import { ConnectionPill, SheetMenu } from "./components";
import { preselectWorktreeDraft, runThreadAction } from "./navHelpers";
import { ThreadTitleRow } from "./ThreadTitleRow";
import { ThreadUsageIndicator } from "./ThreadUsageIndicator";
import { useHeldThreadHeader } from "./useHeldThreadHeader";
import type { RemoteDesktopSession } from "./useRemoteDesktop";
import { useSwipeBack } from "./useSwipeBack";
import type { Chrome } from "./chrome";

/** Header/sidebar brand mark: the desktop's paired label, or "Poracode".
 * Shared by {@link NarrowShell} and the wide-shell sidebar. */
export function Brand(props: {
  readonly subtitle?: string | undefined;
  readonly onPress: () => void;
}) {
  // Desktop labels default to "Poracode on <host>"; the header only needs the
  // host. Accept the legacy "Lightcode on …" prefix for desktops paired before
  // the rebrand so their stored labels still render cleanly.
  const label = props.subtitle?.replace(/^(?:Poracode|Lightcode)\s+on\s+/i, "");
  return (
    <button className="m-brand" type="button" onClick={props.onPress}>
      <span className="m-brand__title">{label || "Poracode"}</span>
    </button>
  );
}

/** Header/sidebar connection indicator: silent when online, otherwise a
 * {@link ConnectionPill} that doubles as the recovery action. Shared by
 * {@link NarrowShell} and the wide-shell sidebar. */
export function ConnectionControl(props: {
  readonly remote: RemoteDesktopSession;
  readonly onPair: () => void;
}) {
  const { remote } = props;
  // Healthy is silent: the pill appears only when the session needs attention
  // (booting/pairing spinner, reconnecting, offline, expired, errored) and is
  // itself the recovery action.
  if (!remote.activeDesktop) return null;
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
export function NarrowShell(props: {
  readonly remote: RemoteDesktopSession;
  readonly chrome: Chrome;
  readonly pathname: string;
  readonly searchOpen: boolean;
  readonly onSearchOpenChange: (open: boolean) => void;
  readonly onSearchHostChange: (element: HTMLDivElement | null) => void;
  readonly chromeHidden: boolean;
}) {
  const { remote, chrome, pathname } = props;
  const navigate = useNavigate();
  const { t } = useLingui();
  const shellRef = useRef<HTMLDivElement | null>(null);
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
  const swipeBackTo =
    chrome.layout === "thread" ? "/threads" : chrome.layout === "subscreen" ? chrome.backTo : null;
  useSwipeBack(shellRef, swipeBackTo !== null, () => {
    if (swipeBackTo) void navigate({ to: swipeBackTo });
  });

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
  // Fullscreen routes (workspace, PR review, terminal) render their own chrome
  // as fixed overlays. The shell's top bar stays MOUNTED for them too — the
  // opaque z-50 overlay covers it, and styles.css hides it with
  // `visibility: hidden` (which keeps its layout height, so .m-main and the
  // page beneath never reflow into the status-bar safe zone) and drops the
  // m-topbar/m-main view-transition-names via [data-chrome="fullscreen"].
  return (
    <div
      className="m-shell"
      ref={shellRef}
      data-chrome={chrome.layout}
      data-chrome-hidden={
        (chrome.layout === "home" && props.chromeHidden && !props.searchOpen) || undefined
      }
    >
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
            <div className="m-home-brand-cluster">
              <Brand
                subtitle={remote.activeDesktop?.label}
                onPress={() => void navigate({ to: "/threads" })}
              />
              <ConnectionControl
                remote={remote}
                onPair={() => void navigate({ to: "/desktops" })}
              />
            </div>
          </>
        )}
        {chrome.layout === "home" ? null : (
          <ConnectionControl remote={remote} onPair={() => void navigate({ to: "/desktops" })} />
        )}
      </header>
      {chrome.layout === "home" ? (
        <div className="m-topbar-search" ref={props.onSearchHostChange} />
      ) : null}
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
            onOpenTerminal={() => undefined}
          />
          <ThreadUsageIndicator thread={visibleHeldThreadHeader.thread} />
          <ConnectionControl remote={remote} onPair={() => undefined} />
        </header>
      ) : null}

      <main className="m-main">
        <Outlet />
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
              { id: "ports", label: t`Ports`, icon: <Plug className="size-4 text-muted" /> },
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
                        : id === "ports"
                          ? "/more/ports"
                          : "/more";
              void navigate({ to });
            }}
            trigger={({ open }) => (
              <button
                className="m-home-compose-action"
                type="button"
                aria-label={t`More`}
                onClick={open}
              >
                <Ellipsis className="size-5" />
              </button>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
