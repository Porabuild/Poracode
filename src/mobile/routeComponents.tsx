import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { Project, Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import { buildWorktreeLocation } from "@/shared/worktree";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitSummariesStore } from "./gitSummaries";
import { useMobileApp, useRemote } from "./remoteContext";
import {
  buildFilesTarget,
  buildGitTarget,
  preselectWorktreeDraft,
  runThreadAction,
  selectDraftProject,
} from "./navHelpers";
import {
  isMixedContentEndpoint,
  normalizePairingEndpoint,
  parsePairingLaunch,
  parsePairingUrl,
} from "./pairing";
import { useMediaQuery, WIDE_SHELL_QUERY } from "./useMediaQuery";
import { DesktopsView } from "./views/DesktopsView";
import { ManageProjectsView } from "./views/ManageProjectsView";
import { MoreView } from "./views/MoreView";
import { NewThreadView } from "./views/NewThreadView";
import { ThreadsView } from "./views/ThreadsView";
import { ThreadView } from "./views/ThreadView";

const BrowserView = lazy(() =>
  import("./views/BrowserView").then((module) => ({ default: module.BrowserView })),
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
const settingsSectionRouteApi = getRouteApi("/more/settings/$section");
const workspaceRouteApi = getRouteApi("/workspace/$threadId");
const terminalRouteApi = getRouteApi("/terminal/$projectId");

function LazyRoute(props: { readonly children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="m-page">
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
 * Shared thread detail pane. Used by the /thread/:id route and, in the wide
 * layout, by the /threads route (where the list lives in the sidebar and the
 * detail shows the selected thread, or an empty state when none is selected).
 */
function ThreadDetail(props: { readonly thread: Thread | null; readonly hideHeader: boolean }) {
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const thread = props.thread;
  // Still fetching this thread's history when no snapshot matches it yet.
  const loading = Boolean(thread) && remote.selectedThreadSnapshot?.thread.id !== thread?.id;
  return (
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
      onResolveServerRequest={(input) =>
        thread ? remote.resolveRequest({ ...input, threadId: thread.id }) : Promise.resolve()
      }
      onOpenWorkspace={(tab) => {
        if (thread) {
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: { tab },
          });
        }
      }}
      onOpenWorkspaceFile={(path, lineNumber) => {
        if (thread) {
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: {
              tab: "files",
              file: path,
              ...(lineNumber !== undefined ? { line: lineNumber } : {}),
            },
          });
        }
      }}
      onOpenWorkspaceFolder={(path) => {
        if (thread) {
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: { tab: "files", folder: path },
          });
        }
      }}
      onOpenTerminal={() => {
        if (thread) {
          void navigate({
            to: "/terminal/$projectId",
            params: { projectId: thread.projectId },
            search: {
              fromThread: thread.id,
              ...(thread.worktreePath ? { worktree: thread.worktreePath } : {}),
            },
          });
        }
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
  );
}

export function ThreadsRoute() {
  const { remote, projectFilter, setProjectFilter } = useMobileApp();
  const navigate = useNavigate();
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);

  // Wide: the sidebar owns the list; this pane shows the selected thread.
  if (isWide) {
    return <ThreadDetail thread={remote.selectedThread} hideHeader={false} />;
  }

  return (
    <ThreadsView
      projects={remote.projects}
      threads={remote.threads}
      selectedThreadId={null}
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
  );
}

export function ThreadRoute() {
  const { threadId } = threadRouteApi.useParams();
  const { remote } = useMobileApp();
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
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [draftNonce, setDraftNonce] = useState(0);

  // The draft composer embeds the desktop ProjectSwitchMenu, which switches
  // projects through the shared store's `openDraft`; mirror that choice here.
  const storeView = useAppStore((state) => state.view);
  useEffect(() => {
    if (storeView.kind === "draft") setDraftProjectId(storeView.projectId);
  }, [storeView]);

  const draftProject = selectDraftProject(remote.projects, {
    draftProjectId,
    selectedThreadProjectId: remote.selectedThread?.projectId,
  });

  function startFromDraft(project: Project, input: DraftStartInput) {
    return remote
      .startThread(project, input)
      .then((threadId) => {
        if (threadId) void navigate({ to: "/thread/$threadId", params: { threadId } });
      })
      .catch((error: unknown) => {
        toast.danger(error instanceof Error ? error.message : t`Unable to start the thread.`);
        // Remount the draft view so its internal pending state resets.
        setDraftNonce((nonce) => nonce + 1);
      });
  }

  return <NewThreadView key={String(draftNonce)} project={draftProject} onStart={startFromDraft} />;
}

export function DesktopsRoute() {
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [manualEndpoint, setManualEndpoint] = useState(() => parsePairingLaunch().endpoint);
  const [manualToken, setManualToken] = useState("");
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
    if (isMixedContentEndpoint(normalizedEndpoint)) {
      toast.danger(
        t`This app is served over HTTPS but the desktop is on plain HTTP, which browsers block. Open the pairing link directly from the desktop (LAN), or expose the desktop over HTTPS.`,
      );
      return;
    }
    try {
      await remote.pairDesktop(normalizedEndpoint, credential);
      setManualToken("");
      void navigate({ to: "/threads" });
    } catch (error) {
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
      toast.danger(t`That QR code isn't a Lightcode pairing link.`);
      return;
    }
    void pair(parsed.endpoint, parsed.credential);
  }

  return (
    <DesktopsView
      desktops={remote.desktops}
      activeDesktopId={remote.activeDesktopId}
      manualEndpoint={manualEndpoint}
      manualToken={manualToken}
      canPair={canPairManually}
      showPairingHint={parsePairingLaunch().credential !== null}
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
    />
  );
}

export function MoreRoute() {
  const navigate = useNavigate();
  return (
    <MoreView
      onOpen={(destination) => {
        const to =
          destination === "browser"
            ? "/more/browser"
            : destination === "projects"
              ? "/more/projects"
              : "/more/settings";
        void navigate({ to });
      }}
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
            void navigate({ to: "/more/settings/$section", params: { section: "usage" } })
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

function SettingsRoute(props: { readonly sectionId: string | null }) {
  const { remote } = useMobileApp();
  const navigate = useNavigate();

  return (
    <LazyRoute>
      <SettingsView
        threads={remote.threads}
        projects={remote.projects}
        sectionId={props.sectionId}
        onSectionChange={(section) => {
          void navigate(
            section
              ? { to: "/more/settings/$section", params: { section } }
              : { to: "/more/settings" },
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
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const { t } = useLingui();

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
    <LazyRoute>
      <WorkspaceView
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
    </LazyRoute>
  );
}

export function TerminalRoute() {
  const { projectId } = terminalRouteApi.useParams();
  const { worktree, action, fromThread } = terminalRouteApi.useSearch();
  const { remote } = useMobileApp();
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
    <LazyRoute>
      <TerminalView
        title={title}
        projectLocation={projectLocation}
        {...(worktree ? { worktreePath: worktree } : {})}
        {...(projectAction?.command ? { initialCommand: projectAction.command } : {})}
        onClose={closeTerminal}
      />
    </LazyRoute>
  );
}
