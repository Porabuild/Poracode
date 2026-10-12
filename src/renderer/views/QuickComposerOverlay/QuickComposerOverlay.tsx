import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus, Project } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { isAgentStatusSupervisorEvent } from "@/shared/ipc";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { readBridge } from "@/renderer/bridge";
import { resolveProjectIdForView } from "@/renderer/actions/currentProject";
import { PixelLoader } from "@/renderer/components/common";
import { ProjectSwitchMenu } from "@/renderer/components/thread/ProjectSwitchMenu";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import {
  applyAgentStatusSupervisorEvent,
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { buildWslProjectDistrosKey, parseWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

type OverlayPhase = "opening" | "idle" | "closing" | "sending";
const EMPTY_AGENT_STATUSES: AgentStatus[] = [];

export function QuickComposerOverlay() {
  const { t } = useLingui();
  const [composerRevision, setComposerRevision] = useState(0);
  const [pendingForm, setPendingForm] = useState<{
    project: Project;
    agentStatuses: AgentStatus[];
  } | null>(null);
  const submissionPending = pendingForm !== null;
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [phase, setPhase] = useState<OverlayPhase>("opening");
  const phaseRef = useRef<OverlayPhase>("opening");
  const frameRef = useRef<HTMLElement>(null);
  // Mirrors `phase` so timer callbacks and reentrancy guards read the latest
  // value; write both only through `transitionPhase`.
  const transitionPhase = (next: OverlayPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  // The native show listener is subscribed once, but must always invoke the
  // latest transition — route it through a ref synced after every render
  // (same pattern as ChatPane's onOpenThreadRef) so the effect takes no
  // per-render dependency.
  const transitionPhaseRef = useRef(transitionPhase);
  useLayoutEffect(() => {
    transitionPhaseRef.current = transitionPhase;
  });
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleRef = useRef({ showGeneration: 0, mounted: false });
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const view = useAppStore((state) => state.view);
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const disabledAgents = useSharedSettings((state) => state.disabledAgents);
  const resolvedProject = resolveQuickComposerProject({
    projects,
    threads,
    view,
    focusedPaneId,
    homeScopeEnabled,
    selectedProjectId,
  });
  // Native reopen refreshes shared state. Keep the submitted form's identity
  // stable until its acknowledgement so a different active project or a probe
  // result cannot unmount its editor and lose failure recovery.
  const project = pendingForm?.project ?? resolvedProject;
  const projectAgentStatuses = useAgentStatusesStore((state) =>
    pendingForm
      ? pendingForm.agentStatuses
      : project
        ? getProjectAgentStatuses(project.location, state.agentStatuses, state.wslAgentStatuses)
        : EMPTY_AGENT_STATUSES,
  );
  const isDetectingAgents = useAgentStatusesStore((state) =>
    project && !pendingForm ? isDetectingAgentsForLocation(state, project.location) : false,
  );
  const hasInstalledAgent =
    submissionPending ||
    projectAgentStatuses.some(
      (status) => status.installed && !disabledAgents.includes(status.kind),
    );

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.mounted = true;
    const refresh = async () => {
      await useAppStore.persist.rehydrate();
      const wslDistros = parseWslProjectDistrosKey(
        buildWslProjectDistrosKey(useAppStore.getState().projects),
      );
      const response = await readBridge().getAgentStatuses(wslDistros);
      if (response.fromCache) {
        useAgentStatusesStore.getState().hydrateFromCache({
          windows: response.windows,
          wsl: response.wsl,
        });
      }
    };
    // Native show is authoritative: Chromium can keep visibilityState="visible"
    // while this window is hidden, and the OS may refuse a focus request. Merely
    // returning from a file dialog must not replay this transition.
    const onShown = () => {
      lifecycle.showGeneration++;
      frameRef.current
        ?.querySelector<HTMLElement>('[data-composer-input-anchor] [contenteditable="true"]')
        ?.focus();
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      transitionPhaseRef.current("opening");
      animationTimerRef.current = setTimeout(() => {
        transitionPhaseRef.current("idle");
      }, 220);
      void refresh().catch(() => undefined);
    };
    const unsubscribeShown = readBridge().onQuickComposerShown(onShown);
    // Mount runs the same enter sequence as a fresh focus. The phase is
    // already "opening", so this inlines the DOM focus, the idle timer, and
    // the refresh without invoking the phase transition synchronously on
    // effect entry.
    frameRef.current
      ?.querySelector<HTMLElement>('[data-composer-input-anchor] [contenteditable="true"]')
      ?.focus();
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    animationTimerRef.current = setTimeout(() => {
      transitionPhaseRef.current("idle");
    }, 220);
    void refresh().catch(() => undefined);
    return () => {
      unsubscribeShown();
      lifecycle.showGeneration++;
      lifecycle.mounted = false;
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

  useEffect(
    () =>
      readBridge().onSupervisorEvent((event) => {
        if (isAgentStatusSupervisorEvent(event)) applyAgentStatusSupervisorEvent(event);
      }),
    [],
  );

  useEffect(() => {
    if (!project || project.id === HOME_PROJECT_ID) return;
    let active = true;
    void refreshGitProject(project, "initial", "full", { isActive: () => active });
    return () => {
      active = false;
    };
  }, [project]);

  // The dismiss-request subscription below calls the latest dismiss callback
  // through a ref, so its lifetime does not depend on this render's identity.
  const dismiss = (openMainWindow = false) => {
    if (phaseRef.current === "closing" || phaseRef.current === "sending") return;
    transitionPhase("closing");
    const lifecycle = lifecycleRef.current;
    const generation = lifecycle.showGeneration;
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    animationTimerRef.current = setTimeout(() => {
      if (!lifecycle.mounted || lifecycle.showGeneration !== generation) return;
      const reveal = openMainWindow ? readBridge().focusWindow() : Promise.resolve();
      const finish = () => {
        if (!lifecycle.mounted || lifecycle.showGeneration !== generation) return;
        void readBridge()
          .dismissQuickComposer()
          .catch((error: unknown) => console.warn(error));
      };
      void reveal.then(finish, (error: unknown) => {
        console.warn(error);
        finish();
      });
    }, 180);
  };
  // Same ref-routing as transitionPhaseRef so the dismiss-request
  // subscription below stays dependency-free while invoking the latest close.
  const dismissRef = useRef(dismiss);
  useLayoutEffect(() => {
    dismissRef.current = dismiss;
  });
  const startThread = async (input: DraftStartInput) => {
    if (!project) return;
    const lifecycle = lifecycleRef.current;
    const generation = lifecycle.showGeneration;
    setPendingForm({ project, agentStatuses: projectAgentStatuses });
    transitionPhase("sending");
    try {
      await readBridge().submitQuickComposer({ projectId: project.id, input });
      await new Promise((resolve) => setTimeout(resolve, 220));
      if (!lifecycle.mounted) return;
      // Keep the submitted form mounted and inert until acknowledgement. Clear
      // it before re-enabling input, even if a newer show is already visible.
      setComposerRevision((revision) => revision + 1);
      setPendingForm(null);
      if (lifecycle.showGeneration === generation) {
        // A native hide failure cannot undo the accepted submission.
        void readBridge()
          .dismissQuickComposer()
          .catch((error: unknown) => console.warn(error));
      }
    } catch (error) {
      if (lifecycle.mounted) {
        setPendingForm(null);
        if (lifecycle.showGeneration === generation) transitionPhase("idle");
      }
      // The shared composer catch swallows non-voice submission errors, so
      // this is the only surface for a refused handoff — show it exactly once
      // while the restored draft is still recoverable.
      toast.danger(friendlyError(error));
      throw error;
    }
  };

  useEffect(() => readBridge().onQuickComposerDismissRequested(() => dismissRef.current()), []);

  return (
    <main
      aria-label={t`New thread`}
      className={`quick-composer-root quick-composer-root--${phase}`}
    >
      <button
        type="button"
        aria-label={t`Close`}
        className="quick-composer-dismiss-backdrop"
        onClick={() => dismiss()}
      />
      <section
        ref={frameRef}
        className="quick-composer-frame"
        data-overlay-surface=""
        inert={submissionPending}
        aria-busy={submissionPending}
      >
        {!project ? (
          <QuickComposerUnavailable onOpenMainWindow={() => dismiss(true)}>
            <Trans>Add a project to start</Trans>
          </QuickComposerUnavailable>
        ) : isDetectingAgents ? (
          <QuickComposerProjectStatus projectId={project.id} onProjectChange={setSelectedProjectId}>
            <PixelLoader size="sm" />
            <Trans>Detecting agents…</Trans>
          </QuickComposerProjectStatus>
        ) : !hasInstalledAgent ? (
          <QuickComposerProjectStatus projectId={project.id} onProjectChange={setSelectedProjectId}>
            <Trans>No supported agents detected</Trans>
          </QuickComposerProjectStatus>
        ) : (
          <ThreadDraftView
            key={`${project.id}:${composerRevision}`}
            project={project}
            agentStatuses={projectAgentStatuses}
            quickComposer
            paneCount={1}
            composerPlaceholder={t`Ask ${project.name} anything about this workspace`}
            pickFiles={() => readBridge().pickQuickComposerFiles()}
            onProjectChange={setSelectedProjectId}
            {...(project.lastDraftConfig ? { lastDraftConfig: project.lastDraftConfig } : {})}
            onStart={startThread}
          />
        )}
      </section>
    </main>
  );
}

function QuickComposerProjectStatus(props: {
  projectId: string;
  onProjectChange: (projectId: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      <div data-draft-controls="" className="flex items-center px-1">
        <ProjectSwitchMenu
          currentProjectId={props.projectId}
          variant="compact"
          onSelectProject={props.onProjectChange}
        />
      </div>
      <div className="quick-composer-status" role="status">
        {props.children}
      </div>
    </div>
  );
}

function QuickComposerUnavailable(props: { children: ReactNode; onOpenMainWindow: () => void }) {
  return (
    <div className="quick-composer-status">
      <span>{props.children}</span>
      <Button size="sm" variant="secondary" onPress={props.onOpenMainWindow}>
        <Trans>Add a project</Trans>
      </Button>
    </div>
  );
}

export function resolveQuickComposerProject(input: {
  projects: Project[];
  threads: Array<{ id: string; projectId: string; archived?: boolean }>;
  view: ReturnType<typeof useAppStore.getState>["view"];
  focusedPaneId?: string | null;
  homeScopeEnabled: boolean;
  selectedProjectId?: string | null;
}): Project | undefined {
  const byId = new Map(input.projects.map((project) => [project.id, project]));
  const isUsable = (project: Project | undefined) =>
    project !== undefined &&
    (project.id === HOME_PROJECT_ID ? input.homeScopeEnabled : !project.disabled);
  const selectedProject = byId.get(input.selectedProjectId ?? "");
  if (isUsable(selectedProject)) return selectedProject;
  const viewedProject = byId.get(
    resolveProjectIdForView(input.view, input.threads, input.focusedPaneId ?? null) ?? "",
  );
  if (isUsable(viewedProject)) return viewedProject;

  const recentThread = input.threads.find((thread) => !thread.archived);
  const recentProject = byId.get(recentThread?.projectId ?? "");
  if (isUsable(recentProject)) return recentProject;

  const homeProject = byId.get(HOME_PROJECT_ID);
  if (isUsable(homeProject)) return homeProject;
  return input.projects.find((project) => isUsable(project));
}
