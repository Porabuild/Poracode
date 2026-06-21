import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { toast } from "@heroui/react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { Project, Thread } from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { useAppStore } from "@/renderer/state/appStore";
import { useMobileApp } from "./remoteContext";
import {
  buildGitTarget,
  preselectWorktreeDraft,
  runThreadAction,
  selectDraftProject,
} from "./navHelpers";
import { isMixedContentEndpoint, parsePairingLaunch, parsePairingUrl } from "./pairing";
import { useMediaQuery, WIDE_SHELL_QUERY } from "./useMediaQuery";
import { DesktopsView } from "./views/DesktopsView";
import { MoreView } from "./views/MoreView";
import { NewThreadView } from "./views/NewThreadView";
import { ThreadsView } from "./views/ThreadsView";
import { ThreadView } from "./views/ThreadView";

const BrowserView = lazy(() =>
  import("./views/BrowserView").then((module) => ({ default: module.BrowserView })),
);
const GitView = lazy(() =>
  import("./views/GitView").then((module) => ({ default: module.GitView })),
);
const TerminalView = lazy(() =>
  import("./views/TerminalView").then((module) => ({ default: module.TerminalView })),
);
const SettingsView = lazy(() =>
  import("./views/SettingsView").then((module) => ({ default: module.SettingsView })),
);
const SettingsOverlay = lazy(() =>
  import("@/renderer/views/SettingsOverlay/SettingsOverlay").then((module) => ({
    default: module.SettingsOverlay,
  })),
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
const gitRouteApi = getRouteApi("/git/$threadId");
const terminalRouteApi = getRouteApi("/terminal/$projectId");

function LazyRoute(props: { readonly children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="m-page">
          <div className="text-sm text-muted">Loading…</div>
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
      hideHeader={props.hideHeader}
      loading={loading}
      onThreadAction={(action) =>
        runThreadAction(remote, thread, action, () => void navigate({ to: "/threads" }))
      }
      onSubmitInput={(prompt, segments) => remote.sendPrompt(prompt, segments)}
      onResolveServerRequest={(input) => remote.resolveRequest(input)}
      onOpenGit={() => {
        if (thread) {
          void navigate({ to: "/git/$threadId", params: { threadId: thread.id } });
        }
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

  const thread =
    remote.threads.find((entry) => entry.id === threadId) ?? remote.selectedThread ?? null;
  return <ThreadDetail thread={thread} hideHeader={!isWide} />;
}

export function NewThreadRoute() {
  const { remote } = useMobileApp();
  const navigate = useNavigate();
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
    remote
      .startThread(project, input)
      .then((threadId) => {
        if (threadId) void navigate({ to: "/thread/$threadId", params: { threadId } });
      })
      .catch((error: unknown) => {
        toast.danger(error instanceof Error ? error.message : "Unable to start the thread.");
        // Remount the draft view so its internal pending state resets.
        setDraftNonce((nonce) => nonce + 1);
      });
  }

  return <NewThreadView key={String(draftNonce)} project={draftProject} onStart={startFromDraft} />;
}

export function DesktopsRoute() {
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const [manualEndpoint, setManualEndpoint] = useState(() => parsePairingLaunch().endpoint);
  const [manualToken, setManualToken] = useState("");

  async function pair(endpoint: string, credential: string) {
    if (isMixedContentEndpoint(endpoint)) {
      toast.danger(
        "This app is served over HTTPS but the desktop is on plain HTTP, which browsers block. Open the pairing link directly from the desktop (LAN), or expose the desktop over HTTPS.",
      );
      return;
    }
    try {
      await remote.pairDesktop(endpoint, credential);
      setManualToken("");
      void navigate({ to: "/threads" });
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Unable to pair with that desktop.");
    }
  }

  function submitManualPairing() {
    if (!manualEndpoint.trim() || !manualToken.trim()) return;
    void pair(manualEndpoint.trim(), manualToken.trim());
  }

  function handleScan(value: string) {
    const parsed = parsePairingUrl(value);
    if (!parsed?.credential) {
      toast.danger("That QR code isn't a Lightcode pairing link.");
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
        void navigate({
          to:
            destination === "usage"
              ? "/more/usage"
              : destination === "browser"
                ? "/more/browser"
                : "/more/settings",
        });
      }}
    />
  );
}

export function UsageRoute() {
  return (
    <LazyRoute>
      <div className="m-subscreen">
        <UsagePanel />
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
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);

  // The wide shell keeps the desktop settings overlay (its own sidebar layout);
  // the phone gets a fullscreen section list with routed drill-down pages.
  if (isWide) {
    return (
      <LazyRoute>
        <SettingsOverlay onClose={() => void navigate({ to: "/more" })} />
      </LazyRoute>
    );
  }

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

export function GitRoute() {
  const { threadId } = gitRouteApi.useParams();
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const target = buildGitTarget(remote, threadId);
  const hasTarget = Boolean(target);

  // If the thread/project never resolves (e.g. a stale deep link), bail out to
  // the thread list once the session has booted.
  useEffect(() => {
    if (remote.booted && !hasTarget) void navigate({ to: "/threads" });
  }, [remote.booted, hasTarget, navigate]);

  if (!target) return null;
  // The git panel belongs to a thread; closing returns there deterministically
  // (robust even on a fresh load with no back-history).
  return (
    <LazyRoute>
      <GitView
        target={target}
        onClose={() => void navigate({ to: "/thread/$threadId", params: { threadId } })}
      />
    </LazyRoute>
  );
}

export function TerminalRoute() {
  const { projectId } = terminalRouteApi.useParams();
  const { worktree } = terminalRouteApi.useSearch();
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const project = remote.projects.find((entry) => entry.id === projectId);
  const hasProject = Boolean(project);

  useEffect(() => {
    if (remote.booted && !hasProject) void navigate({ to: "/threads" });
  }, [remote.booted, hasProject, navigate]);

  if (!project) return null;
  const projectLocation = worktree
    ? buildWorktreeLocation(project.location, worktree)
    : project.location;
  const title = worktree ? (worktree.split(/[\\/]/).pop() ?? project.name) : project.name;
  return (
    <LazyRoute>
      <TerminalView
        title={title}
        projectLocation={projectLocation}
        {...(worktree ? { worktreePath: worktree } : {})}
        onClose={() => void navigate({ to: "/threads" })}
      />
    </LazyRoute>
  );
}
