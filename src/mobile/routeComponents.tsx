import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useAppStore } from "@/renderer/state/appStore";
import { SubAgentContent } from "@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay";
import { getBasename } from "@/shared/pathUtils";
import { buildWorktreeLocation, resolveProjectLocation } from "@/shared/worktree";
import { useGitSummariesStore } from "./gitSummaries";
import { useMobileApp, useRemote } from "./remoteContext";
import {
  buildFilesTarget,
  buildGitTarget,
  openWorktreeDraft,
  preselectWorktreeDraft,
} from "./navHelpers";
import {
  clearPairingLaunch,
  desktopServedPairingUrl,
  isMixedContentEndpoint,
  normalizePairingEndpoint,
  parsePairingLaunch,
  parsePairingUrl,
  subscribePairingLaunch,
} from "./pairing";
import { RemoteClientError } from "@/shared/remote/client";
import { MobileSetupEmptyState, type MobileSetupKind } from "./setupEmptyState";
import { isDesktopSettingsSection } from "./settingsSections";
import type { MobileSshPairRequest } from "./views/DesktopsView";
import { useGitSummaryHydration } from "./useGitSummaryHydration";
import { DESKTOP_RIGHT_PANEL_QUERY, useMediaQuery, WIDE_SHELL_QUERY } from "./useMediaQuery";
import { useDesktopPanelStore } from "./desktopPanelStore";
import { useNarrowThreadHost } from "./narrowThreadHostContext";
import { ThreadDetail } from "./ThreadDetail";
import { DesktopsView } from "./views/DesktopsView";
import { ManageProjectsView } from "./views/ManageProjectsView";
import { MoreView } from "./views/MoreView";
import { ThreadsView } from "./views/ThreadsView";

const NewThreadFlow = lazy(() =>
  import("./views/NewThreadFlow").then((module) => ({ default: module.NewThreadFlow })),
);
const QuickCompose = lazy(() =>
  import("./views/QuickCompose").then((module) => ({ default: module.QuickCompose })),
);
const BrowserView = lazy(() =>
  import("./views/BrowserView").then((module) => ({ default: module.BrowserView })),
);
const PortsView = lazy(() =>
  import("./views/PortsView").then((module) => ({ default: module.PortsView })),
);
const WorkspaceView = lazy(() =>
  import("./views/WorkspaceView").then((module) => ({ default: module.WorkspaceView })),
);
const TerminalView = lazy(() =>
  import("./views/TerminalView").then((module) => ({ default: module.TerminalView })),
);
const NotesView = lazy(() =>
  import("./views/NotesView").then((module) => ({ default: module.NotesView })),
);
const SettingsView = lazy(() =>
  import("./views/SettingsView").then((module) => ({ default: module.SettingsView })),
);
const UsagePanel = lazy(() =>
  import("@/renderer/views/MainView/parts/RightPanel/parts/UsagePanel/UsagePanel").then(
    (module) => ({
      default: module.UsagePanel,
    }),
  ),
);

// Typed route APIs (params/search) — decoupled from the route consts so this
// file never imports router.tsx (which imports these components).
const threadRouteApi = getRouteApi("/thread/$threadId");
const subAgentRouteApi = getRouteApi("/subagent/$threadId/$parentItemId");
const notesRouteApi = getRouteApi("/notes/$threadId");
const settingsSectionRouteApi = getRouteApi("/settings/$section");
const workspaceRouteApi = getRouteApi("/workspace/$threadId");
const terminalRouteApi = getRouteApi("/terminal/$projectId");

function LazyRoute(props: { readonly children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="m-page m-route-loading">
          <div className="text-sm text-muted">
            <Trans>Loading…</Trans>
          </div>
        </div>
      }
    >
      {props.children}
    </Suspense>
  );
}

/**
 * Suspense boundary for the fullscreen overlay routes (workspace, terminal).
 * Their push/pop navigations slide via the `m-screen` view-transition group,
 * and the view transition captures whatever the route renders at commit time —
 * on a cold chunk that's the fallback, so the fallback itself must be a
 * fullscreen, `m-screen`-named surface or the slide has nothing to animate
 * (the old page then just dissolves via the root cross-fade, and the late-
 * arriving screen paints with no coherent entry). Connected sessions warm
 * these chunks after the first paint, keeping the fallback a rare sight.
 */
function FullscreenLazyRoute(props: { readonly children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <section className="m-screen-loading">
          <div className="text-sm text-muted">
            <Trans>Loading…</Trans>
          </div>
        </section>
      }
    >
      {props.children}
    </Suspense>
  );
}

export function ThreadsRoute() {
  const {
    remote,
    projectFilter,
    setProjectFilter,
    threadSearchOpen,
    setThreadSearchOpen,
    threadSearchHost,
  } = useMobileApp();
  const navigate = useNavigate();
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);
  // The home composer's expand state (kept here so the list's empty-state
  // "New thread" button grows the same bubble as a tap on it).
  const hasPendingWorktreeDraft = useAppStore(
    (state) => Object.keys(state.pendingDraftWorktreeSelections).length > 0,
  );
  const [composeExpanded, setComposeExpanded] = useState(hasPendingWorktreeDraft);
  const [restoreWorktreeSelectionToken, setRestoreWorktreeSelectionToken] = useState(0);
  const readyToCompose = remote.connection === "online" && remote.projects.length > 0;
  const needsDesktop = remote.connection !== "online";
  const setupKind: MobileSetupKind | null = readyToCompose
    ? null
    : needsDesktop
      ? "desktop"
      : "project";
  const setupEmptyState =
    setupKind === null ? null : (
      <MobileSetupEmptyState
        kind={setupKind}
        onAction={(kind) =>
          void navigate(kind === "desktop" ? { to: "/desktops" } : { to: "/projects" })
        }
      />
    );

  // The narrow list is the "away from every thread" surface: reset the shared
  // view so threads finishing from here on count as unwatched (the store
  // downgrades their idle transition to the "Finished" badge). openThread in
  // useRemoteDesktop sets the view back when a thread is opened. Wide shells
  // keep the detail pane mounted, so the view stays on the selected thread.
  useEffect(() => {
    if (!isWide) useAppStore.getState().openHome();
  }, [isWide]);

  // Worktree actions from another narrow route return here with a one-shot
  // target already queued. Reveal the inline composer that will consume it.
  useEffect(() => {
    if (hasPendingWorktreeDraft) setComposeExpanded(true);
  }, [hasPendingWorktreeDraft]);

  // Once a desktop is connected, warm the fullscreen chunks after first paint
  // so their push transition normally captures real content. Disconnected
  // startup keeps them off the network entirely.
  const activeDesktopId = remote.activeDesktop?.desktopId;
  useEffect(() => {
    if (!activeDesktopId) return;
    const warmFullscreenChunks = () => {
      void import("./views/WorkspaceView");
      void import("./views/TerminalView");
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warmFullscreenChunks, { timeout: 4_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(warmFullscreenChunks, 2_000);
    return () => window.clearTimeout(handle);
  }, [activeDesktopId]);

  // Wide: the sidebar already owns the list. Keep the detail empty until the
  // user explicitly opens a thread or navigates to /new.
  if (isWide) {
    return <ThreadDetail thread={null} hideHeader={false} />;
  }

  return (
    <>
      <ThreadsView
        projects={remote.projects}
        threads={remote.activeThreads}
        selectedThreadId={null}
        projectFilter={projectFilter}
        loading={!remote.booted}
        searchOpen={threadSearchOpen}
        searchContainer={threadSearchHost}
        onSearchOpenChange={setThreadSearchOpen}
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
        onMoveThreadToWorktree={(thread, withChanges) => {
          void remote.moveThreadToWorktree(thread, withChanges);
        }}
        onNew={() => setComposeExpanded(true)}
        onNewThreadInWorktree={(input) => {
          preselectWorktreeDraft(input);
          setComposeExpanded(true);
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
        {...(setupEmptyState ? { emptyStateOverride: setupEmptyState } : {})}
      />
      {readyToCompose ? (
        <Suspense fallback={null}>
          <QuickCompose
            expanded={composeExpanded}
            restoreWorktreeSelectionToken={restoreWorktreeSelectionToken}
            onExpandedChange={(expanded) => {
              if (!expanded) setRestoreWorktreeSelectionToken((token) => token + 1);
              setComposeExpanded(expanded);
            }}
            onStarted={(threadId) => {
              setComposeExpanded(false);
              void navigate({ to: "/thread/$threadId", params: { threadId } });
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}

export function ThreadRoute() {
  const { threadId } = threadRouteApi.useParams();
  const remote = useRemote();
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);
  const narrowShellOwnsThread = useNarrowThreadHost();
  // Opening (store watch + snapshot load) is owned by ThreadDetail's effect: it
  // also covers the fallback-selected thread on reloads, which a check against
  // remote.selectedThread here would wrongly consider already open.
  const thread = remote.activeThreads.find((entry) => entry.id === threadId) ?? null;
  if (!isWide && narrowShellOwnsThread) return null;
  return <ThreadDetail thread={thread} hideHeader={!isWide} />;
}

/** A history-backed subagent page on phones; desktop-width PWA shells migrate it into the panel. */
export function SubAgentRoute() {
  const { threadId, parentItemId } = subAgentRouteApi.useParams();
  const remote = useRemote();
  const navigate = useNavigate();
  const useRightPanel = useMediaQuery(DESKTOP_RIGHT_PANEL_QUERY);
  const thread = remote.activeThreads.find((entry) => entry.id === threadId) ?? null;
  const project = thread
    ? (remote.projects.find((entry) => entry.id === thread.projectId) ?? null)
    : null;
  const activeDesktopId = remote.activeDesktop?.desktopId ?? null;
  const hasSnapshot = remote.selectedThreadSnapshot?.thread.id === threadId;

  useEffect(() => {
    if (!thread || hasSnapshot) return;
    void remote.openThread(thread);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on route target + connection; openThread deduplicates in-flight history loads
  }, [activeDesktopId, hasSnapshot, threadId]);

  useEffect(() => {
    if (!useRightPanel) return;
    useDesktopPanelStore.getState().showSubAgent(threadId, parentItemId);
    void navigate({
      to: "/thread/$threadId",
      params: { threadId },
      replace: true,
    });
  }, [navigate, parentItemId, threadId, useRightPanel]);

  if (useRightPanel) return null;

  const projectLocation =
    thread && project ? resolveProjectLocation(project.location, thread.worktreePath) : undefined;

  return (
    <LazyRoute>
      <section className="m-page m-subagent-page">
        {hasSnapshot ? (
          <SubAgentContent
            threadId={threadId}
            parentItemId={parentItemId}
            hideHeader
            {...(projectLocation ? { projectLocation } : {})}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
            <Trans>Loading…</Trans>
          </div>
        )}
      </section>
    </LazyRoute>
  );
}

/**
 * The /new route: the New-thread composer pane on every layout.
 */
export function NewThreadRoute() {
  const navigate = useNavigate();
  return (
    <LazyRoute>
      <NewThreadFlow
        onStarted={(threadId) => void navigate({ to: "/thread/$threadId", params: { threadId } })}
        onSetupAction={(kind) =>
          void navigate(kind === "desktop" ? { to: "/desktops" } : { to: "/projects" })
        }
      />
    </LazyRoute>
  );
}

export function DesktopsRoute() {
  const remote = useRemote();
  const navigate = useNavigate();
  const { t } = useLingui();
  // A launch/deep-link pairing offer prefills the form for the user to CONFIRM
  // (see useDeepLinkPairing). Reactive so a warm deep link re-prefills.
  const launch = useSyncExternalStore(
    subscribePairingLaunch,
    parsePairingLaunch,
    parsePairingLaunch,
  );
  const [manualEndpoint, setManualEndpoint] = useState(launch.endpoint);
  const [manualToken, setManualToken] = useState(launch.credential ?? "");
  const lastLaunchRef = useRef(launch);
  useEffect(() => {
    if (launch !== lastLaunchRef.current) {
      lastLaunchRef.current = launch;
      if (launch.credential) {
        setManualEndpoint(launch.endpoint);
        setManualToken(launch.credential);
      }
    }
  }, [launch]);
  const manualEndpointValue = manualEndpoint.trim();
  const manualTokenValue = manualToken.trim();
  const manualPairingLink =
    parsePairingUrl(manualTokenValue) ?? parsePairingUrl(manualEndpointValue);
  const canPairManually = Boolean(
    manualPairingLink?.credential || (manualEndpointValue && manualTokenValue),
  );
  // Set only once the browser has actually refused a cleartext LAN endpoint, so
  // the escape hatch appears exactly when it is the answer.
  const [blockedHandoffUrl, setBlockedHandoffUrl] = useState<string | null>(null);

  async function pair(endpoint: string, credential: string) {
    let normalizedEndpoint: string;
    try {
      normalizedEndpoint = normalizePairingEndpoint(endpoint);
    } catch {
      toast.danger(t`Enter a valid desktop endpoint.`);
      return;
    }
    setBlockedHandoffUrl(null);
    try {
      await remote.pairDesktop(normalizedEndpoint, credential);
      clearPairingLaunch();
      setManualToken("");
      void navigate({ to: "/threads" });
    } catch (error) {
      // A desktop that answered has a real reason (expired credential, rate
      // limit, protocol mismatch) — report it verbatim rather than blaming the
      // browser. Only a transport failure can be the page being blocked from a
      // cleartext LAN endpoint, and Chromium reaches it fine once its local
      // network permission is granted, so the handoff is the last resort.
      const remoteError = error instanceof RemoteClientError ? error : null;
      const answered = (remoteError?.status ?? 0) >= 400;
      if (!answered && isMixedContentEndpoint(normalizedEndpoint)) {
        setBlockedHandoffUrl(desktopServedPairingUrl(normalizedEndpoint, credential));
        toast.danger(t`Couldn't reach the desktop from this HTTPS page.`);
        return;
      }
      // A one-time code is also spent or expired under this status; the desktop's
      // own "Invalid pairing token." says nothing about how to recover.
      if (remoteError?.code === "invalid_pairing_token") {
        toast.danger(
          t`That pairing code is no longer valid. Open Settings → Remote Access on the desktop, press New code, and pair again.`,
        );
        return;
      }
      toast.danger(error instanceof Error ? error.message : t`Unable to pair with that desktop.`);
    }
  }

  function submitManualPairing() {
    const endpoint = manualEndpointValue;
    const token = manualTokenValue;
    const parsed = manualPairingLink;
    if (parsed?.credential) {
      void pair(parsed.endpoint, parsed.credential);
      return;
    }
    if (!endpoint || !token) return;
    void pair(endpoint, token);
  }

  function handleScan(value: string) {
    const parsed = parsePairingUrl(value);
    if (!parsed?.credential) {
      toast.danger(t`That QR code isn't a Poracode pairing link.`);
      return;
    }
    void pair(parsed.endpoint, parsed.credential);
  }

  async function pairSsh(input: MobileSshPairRequest) {
    await remote.pairSsh(
      {
        id: crypto.randomUUID(),
        label: input.target,
        target: input.target,
        port: input.port,
        authentication: input.authentication.kind,
        hostKeyFingerprint: input.fingerprint,
      },
      input.authentication,
    );
    void navigate({ to: "/threads" });
  }

  return (
    <DesktopsView
      desktops={remote.desktops}
      activeDesktopId={remote.activeDesktopId}
      manualEndpoint={manualEndpoint}
      manualToken={manualToken}
      canPair={canPairManually}
      showPairingHint={launch.credential !== null}
      pairing={remote.connection === "pairing"}
      onEndpointChange={setManualEndpoint}
      onTokenChange={setManualToken}
      onPair={submitManualPairing}
      onScan={handleScan}
      {...(blockedHandoffUrl
        ? { onOpenDesktopServedApp: () => window.location.assign(blockedHandoffUrl) }
        : {})}
      onSwitch={(desktop) => {
        void remote.switchDesktop(desktop).then(() => navigate({ to: "/threads" }));
      }}
      onRename={(desktop, label) => {
        void remote.rename(desktop, label);
      }}
      onForget={(desktop) => {
        void remote.forget(desktop);
      }}
      onProbeSsh={remote.probeSshHost}
      onPairSsh={pairSsh}
    />
  );
}

export function MoreRoute() {
  const remote = useRemote();
  const navigate = useNavigate();
  return (
    <MoreView
      hasDesktop={remote.activeDesktop !== null}
      onOpen={() => void navigate({ to: "/settings/desktop" })}
      onOpenSettingsSection={(section) =>
        void navigate({ to: "/settings/$section", params: { section } })
      }
    />
  );
}

export function ProjectsRoute() {
  const remote = useRemote();
  const canManage = remote.activeDesktop?.scopes.includes("projects:manage") ?? false;
  return (
    <div className="m-subscreen">
      <ManageProjectsView
        projects={remote.projects}
        canManage={canManage}
        onCommand={(command) => remote.manageProject(command)}
      />
    </div>
  );
}

export function UsageRoute() {
  const navigate = useNavigate();
  return (
    <LazyRoute>
      <div className="m-subscreen">
        <UsagePanel
          onOpenUsageSettings={() =>
            void navigate({ to: "/settings/$section", params: { section: "usage" } })
          }
        />
      </div>
    </LazyRoute>
  );
}

export function BrowserRoute() {
  return (
    <LazyRoute>
      <BrowserView />
    </LazyRoute>
  );
}

export function PortsRoute() {
  return (
    <LazyRoute>
      <PortsView />
    </LazyRoute>
  );
}

function SettingsRoute(props: { readonly sectionId: string | null }) {
  const remote = useRemote();
  const navigate = useNavigate();
  const requiresDesktop = props.sectionId === null || isDesktopSettingsSection(props.sectionId);

  useEffect(() => {
    if (requiresDesktop && remote.booted && !remote.activeDesktop) {
      void navigate({ to: "/settings", replace: true });
    }
  }, [navigate, remote.activeDesktop, remote.booted, requiresDesktop]);

  if (requiresDesktop && !remote.activeDesktop) return null;

  return (
    <LazyRoute>
      <SettingsView
        archivedThreads={remote.archivedThreads}
        projects={remote.projects}
        sectionId={props.sectionId}
        onSectionChange={(section) => {
          void navigate(
            section
              ? { to: "/settings/$section", params: { section } }
              : { to: "/settings/desktop" },
          );
        }}
        onThreadAction={(thread, action) => {
          void remote.applyThreadAction(thread, action);
        }}
      />
    </LazyRoute>
  );
}

export function SettingsListRoute() {
  return <SettingsRoute sectionId={null} />;
}

export function SettingsSectionRoute() {
  const { section } = settingsSectionRouteApi.useParams();
  return <SettingsRoute sectionId={section} />;
}

export function WorkspaceRoute() {
  const { threadId } = workspaceRouteApi.useParams();
  const { tab, file, folder, line } = workspaceRouteApi.useSearch();
  const remote = useRemote();
  const navigate = useNavigate();
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);
  const useRightPanel = useMediaQuery(DESKTOP_RIGHT_PANEL_QUERY);
  const { t } = useLingui();
  const thread = remote.activeThreads.find((entry) => entry.id === threadId) ?? null;
  const project = thread
    ? (remote.projects.find((entry) => entry.id === thread.projectId) ?? null)
    : null;
  useGitSummaryHydration(thread, project);

  // A non-repo thread still has a Files tab; the Changes tab only appears when
  // the thread's working tree is a git repo (per the cached summary).
  const isRepo = useGitSummariesStore((s) => s.byThread[threadId]?.isRepo === true);
  const filesTarget = buildFilesTarget(remote, threadId);
  const gitTarget = isRepo ? buildGitTarget(remote, threadId) : null;
  const hasTarget = Boolean(filesTarget);

  // If the thread/project never resolves (e.g. a stale deep link), bail out to
  // the thread list once the session has booted.
  useEffect(() => {
    if (remote.booted && !hasTarget) void navigate({ to: "/threads" });
  }, [remote.booted, hasTarget, navigate]);

  useEffect(() => {
    if (!useRightPanel || !hasTarget) return;
    const panel = useDesktopPanelStore.getState();
    if (file) panel.showFile(threadId, file, line);
    else if (folder) panel.showFolder(threadId, folder);
    else panel.show(tab === "changes" ? "git" : "files", threadId);
    void navigate({
      to: "/thread/$threadId",
      params: { threadId },
      replace: true,
    });
  }, [file, folder, hasTarget, line, navigate, tab, threadId, useRightPanel]);

  if (!filesTarget) return null;
  if (useRightPanel) {
    return null;
  }
  // The workspace belongs to a thread; closing returns there deterministically
  // (robust even on a fresh load with no back-history).
  return (
    <FullscreenLazyRoute>
      <WorkspaceView
        key={threadId}
        gitTarget={gitTarget}
        filesTarget={filesTarget}
        initialTab={isRepo ? tab : "files"}
        {...(file ? { initialFilePath: file } : {})}
        {...(folder ? { initialFolderPath: folder } : {})}
        {...(line ? { initialLineNumber: line } : {})}
        onClose={() => void navigate({ to: "/thread/$threadId", params: { threadId } })}
        onOpenWorktreeBranch={({ worktreePath, worktreeBranch }) => {
          const worktreeThread = remote.activeThreads.find(
            (entry) =>
              entry.projectId === filesTarget.project.id && entry.worktreePath === worktreePath,
          );
          if (worktreeThread) {
            void navigate({
              to: "/workspace/$threadId",
              params: { threadId: worktreeThread.id },
              search: { tab: "changes" },
            });
            return;
          }
          const input = {
            projectId: filesTarget.project.id,
            worktreePath,
            worktreeBranch,
          };
          if (!isWide) {
            preselectWorktreeDraft(input);
            void navigate({ to: "/threads" });
            return;
          }
          void openWorktreeDraft(input, () => navigate({ to: "/new" }));
        }}
        onLaunchConflictResolverThread={(input) => {
          remote
            .startThread(filesTarget.project, input)
            .then((resolverThreadId) => {
              if (resolverThreadId) {
                void navigate({
                  to: "/thread/$threadId",
                  params: { threadId: resolverThreadId },
                });
              }
            })
            .catch((error: unknown) => {
              toast.danger(error instanceof Error ? error.message : t`Unable to start the thread.`);
            });
        }}
      />
    </FullscreenLazyRoute>
  );
}

export function NotesRoute() {
  const { threadId } = notesRouteApi.useParams();
  const remote = useRemote();
  const navigate = useNavigate();
  const useRightPanel = useMediaQuery(DESKTOP_RIGHT_PANEL_QUERY);
  const thread = remote.activeThreads.find((entry) => entry.id === threadId) ?? null;
  const project = thread
    ? (remote.projects.find((entry) => entry.id === thread.projectId) ?? null)
    : null;

  useEffect(() => {
    if (remote.booted && !project) {
      void navigate({ to: "/threads", replace: true });
    }
  }, [navigate, project, remote.booted]);

  useEffect(() => {
    if (!useRightPanel || !project) return;
    useDesktopPanelStore.getState().show("notes", threadId);
    void navigate({
      to: "/thread/$threadId",
      params: { threadId },
      replace: true,
    });
  }, [navigate, project, threadId, useRightPanel]);

  if (!project || useRightPanel) return null;

  return (
    <FullscreenLazyRoute>
      <NotesView
        key={project.id}
        projectId={project.id}
        projectName={project.name}
        onClose={() =>
          void navigate({
            to: "/thread/$threadId",
            params: { threadId },
          })
        }
      />
    </FullscreenLazyRoute>
  );
}

export function TerminalRoute() {
  const { projectId } = terminalRouteApi.useParams();
  const { worktree, action, fromThread } = terminalRouteApi.useSearch();
  const remote = useRemote();
  const navigate = useNavigate();
  const project = remote.projects.find((entry) => entry.id === projectId);
  const sourceThread = fromThread
    ? remote.activeThreads.find((entry) => entry.id === fromThread)
    : undefined;
  const hasProject = Boolean(project);

  useEffect(() => {
    if (remote.booted && !hasProject) void navigate({ to: "/threads" });
  }, [remote.booted, hasProject, navigate]);

  if (!project) return null;
  const projectLocation = worktree
    ? buildWorktreeLocation(project.location, worktree)
    : project.location;
  const projectAction = action
    ? project.scripts?.actions?.find((entry) => entry.id === action)
    : undefined;
  const title = projectAction?.name ?? (worktree ? getBasename(worktree) : project.name);
  function closeTerminal(): void {
    if (sourceThread) {
      void navigate({ to: "/thread/$threadId", params: { threadId: sourceThread.id } });
      return;
    }
    void navigate({ to: "/threads" });
  }
  return (
    <FullscreenLazyRoute>
      {/*
        TanStack Router keeps this component mounted across param/search changes,
        but TerminalView seeds its tabs once and starts each shell keyed on its
        shellId — so without a target-scoped key, navigating to a different
        project/worktree/action would reuse the old PTY in the old cwd and skip
        the new action's initial command. Remount on any target change instead.
      */}
      <TerminalView
        key={`${projectId}:${worktree ?? ""}:${action ?? ""}`}
        title={title}
        projectLocation={projectLocation}
        {...(worktree ? { worktreePath: worktree } : {})}
        {...(projectAction?.command ? { initialCommand: projectAction.command } : {})}
        onClose={closeTerminal}
      />
    </FullscreenLazyRoute>
  );
}
