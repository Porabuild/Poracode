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
import { MessageCircle } from "lucide-react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useAppStore } from "@/renderer/state/appStore";
import type { Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import { buildWorktreeLocation } from "@/shared/worktree";
import { useGitSummariesStore } from "./gitSummaries";
import { useMobileApp, useRemote } from "./remoteContext";
import {
  buildFilesTarget,
  buildGitTarget,
  preselectWorktreeDraft,
  runThreadAction,
} from "./navHelpers";
import {
  clearPairingLaunch,
  isMixedContentEndpoint,
  normalizePairingEndpoint,
  parsePairingLaunch,
  parsePairingUrl,
  subscribePairingLaunch,
} from "./pairing";
import { MobileSetupEmptyState, type MobileSetupKind } from "./setupEmptyState";
import { EmptyState } from "./components";
import { isDesktopSettingsSection } from "./settingsSections";
import type { MobileSshPairRequest } from "./views/DesktopsView";
import { useGitSummaryHydration } from "./useGitSummaryHydration";
import { useMediaQuery, WIDE_SHELL_QUERY } from "./useMediaQuery";
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
const ThreadView = lazy(() =>
  import("./views/ThreadView").then((module) => ({ default: module.ThreadView })),
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

/**
 * Shared thread detail pane. Used by the /thread/:id route and, in the wide
 * layout, by the /threads route (where the list lives in the sidebar and the
 * detail shows the selected thread, or an empty state when none is selected).
 */
function ThreadDetail(props: { readonly thread: Thread | null; readonly hideHeader: boolean }) {
  const remote = useRemote();
  const navigate = useNavigate();
  const thread = props.thread;
  if (!thread) {
    return (
      <section className="m-thread">
        <EmptyState
          icon={<MessageCircle className="size-5" />}
          title={<Trans>No thread selected</Trans>}
          hint={<Trans>Pick a thread from the list to follow the agent from here.</Trans>}
        />
      </section>
    );
  }
  // Still fetching this thread's history when no snapshot matches it yet.
  const loading = remote.selectedThreadSnapshot?.thread.id !== thread.id;
  return (
    <LazyRoute>
      <ThreadView
        thread={thread}
        terminalScrollback={remote.selectedThreadSnapshot?.terminalScrollback}
        terminalSize={remote.selectedThreadSnapshot?.terminalSize}
        hideHeader={props.hideHeader}
        loading={loading}
        onThreadAction={(action) =>
          runThreadAction(remote, thread, action, () => void navigate({ to: "/threads" }))
        }
        onSubmitInput={(prompt, segments) => remote.sendPrompt(prompt, segments)}
        onOpenWorkspace={(tab) => {
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: { tab },
          });
        }}
        onOpenWorkspaceFile={(path, lineNumber) => {
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: {
              tab: "files",
              file: path,
              ...(lineNumber !== undefined ? { line: lineNumber } : {}),
            },
          });
        }}
        onOpenWorkspaceFolder={(path) => {
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: { tab: "files", folder: path },
          });
        }}
        onOpenTerminal={() => {
          void navigate({
            to: "/terminal/$projectId",
            params: { projectId: thread.projectId },
            search: {
              fromThread: thread.id,
              ...(thread.worktreePath ? { worktree: thread.worktreePath } : {}),
            },
          });
        }}
        onNewThreadInWorktree={(input) => {
          preselectWorktreeDraft(input);
          void navigate({ to: "/new" });
        }}
        onDeleteWorktreeGroup={(input) => {
          void remote.deleteWorktreeGroup(input);
          void navigate({ to: "/threads" });
        }}
      />
    </LazyRoute>
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
    setChromeHidden,
  } = useMobileApp();
  const navigate = useNavigate();
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);
  // The home composer's expand state (kept here so the list's empty-state
  // "New thread" button grows the same bubble as a tap on it).
  const [composeExpanded, setComposeExpanded] = useState(false);
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

  // Wide: the sidebar owns the list; this pane shows the selected thread.
  if (isWide) {
    return <ThreadDetail thread={remote.selectedThread} hideHeader={false} />;
  }

  return (
    <>
      <ThreadsView
        projects={remote.projects}
        threads={remote.threads}
        selectedThreadId={null}
        projectFilter={projectFilter}
        loading={!remote.booted}
        searchOpen={threadSearchOpen}
        searchContainer={threadSearchHost}
        onSearchOpenChange={setThreadSearchOpen}
        onChromeHiddenChange={setChromeHidden}
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
        onNew={() => setComposeExpanded(true)}
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
        {...(setupEmptyState ? { emptyStateOverride: setupEmptyState } : {})}
      />
      {readyToCompose ? (
        <Suspense fallback={null}>
          <QuickCompose
            expanded={composeExpanded}
            onExpandedChange={setComposeExpanded}
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
  // Track existence rather than the array reference (which changes every render)
  // so the open effect only re-runs when the routed thread appears/leaves.
  const targetExists = remote.threads.some((entry) => entry.id === threadId);

  // Open (load snapshot for) the routed thread once it appears in the list.
  // A missing thread renders the empty detail state (parity with the old shell,
  // which never redirected away from a thread view).
  useEffect(() => {
    if (remote.selectedThread?.id === threadId) return;
    const thread = remote.threads.find((entry) => entry.id === threadId);
    if (thread) void remote.openThread(thread);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the routed thread + its availability
  }, [threadId, targetExists, remote.selectedThread?.id]);

  const thread = remote.threads.find((entry) => entry.id === threadId) ?? null;
  return <ThreadDetail thread={thread} hideHeader={!isWide} />;
}

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

  async function pair(endpoint: string, credential: string) {
    let normalizedEndpoint: string;
    try {
      normalizedEndpoint = normalizePairingEndpoint(endpoint);
    } catch {
      toast.danger(t`Enter a valid desktop endpoint.`);
      return;
    }
    try {
      await remote.pairDesktop(normalizedEndpoint, credential);
      clearPairingLaunch();
      setManualToken("");
      void navigate({ to: "/threads" });
    } catch (error) {
      // Chromium can prompt for local-network access and permit this request.
      // Attempt it before showing fallback guidance so that prompt can appear.
      if (isMixedContentEndpoint(normalizedEndpoint)) {
        toast.danger(
          t`Couldn't reach the desktop. If the browser asked to access your local network, allow it and pair again. Otherwise open the pairing link directly from the desktop (LAN), or expose the desktop over HTTPS.`,
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
        threads={remote.threads}
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
  const { t } = useLingui();
  const thread = remote.threads.find((entry) => entry.id === threadId) ?? null;
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

  if (!filesTarget) return null;
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
          const worktreeThread = remote.threads.find(
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
          preselectWorktreeDraft({
            projectId: filesTarget.project.id,
            worktreePath,
            worktreeBranch,
          });
          void navigate({ to: "/new" });
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

export function TerminalRoute() {
  const { projectId } = terminalRouteApi.useParams();
  const { worktree, action, fromThread } = terminalRouteApi.useSearch();
  const remote = useRemote();
  const navigate = useNavigate();
  const project = remote.projects.find((entry) => entry.id === projectId);
  const sourceThread = fromThread
    ? remote.threads.find((entry) => entry.id === fromThread)
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
