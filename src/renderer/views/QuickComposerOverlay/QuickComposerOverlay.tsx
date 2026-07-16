import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
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

export function QuickComposerOverlay() {
  const { t } = useLingui();
  const [composerRevision, setComposerRevision] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [phase, setPhase] = useState<OverlayPhase>("opening");
  // Mirrors `phase` so timer callbacks and reentrancy guards read the latest
  // value; write both only through `transitionPhase`.
  const phaseRef = useRef<OverlayPhase>("opening");
  const frameRef = useRef<HTMLElement>(null);
  const transitionPhase = (next: OverlayPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const view = useAppStore((state) => state.view);
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const disabledAgents = useSharedSettings((state) => state.disabledAgents);
  const project = resolveQuickComposerProject({
    projects,
    threads,
    view,
    focusedPaneId,
    homeScopeEnabled,
    selectedProjectId,
  });
  const projectAgentStatuses = useAgentStatusesStore((state) =>
    project
      ? getProjectAgentStatuses(project.location, state.agentStatuses, state.wslAgentStatuses)
      : [],
  );
  const isDetectingAgents = useAgentStatusesStore((state) =>
    project ? isDetectingAgentsForLocation(state, project.location) : false,
  );
  const hasInstalledAgent = projectAgentStatuses.some(
    (status) => status.installed && !disabledAgents.includes(status.kind),
  );

  useEffect(() => {
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
    // Focus fires both when the hidden window is re-shown and when focus merely
    // returns (e.g. after the native file dialog closes). Only the former needs
    // the enter animation and a store/agent refresh — gate on having actually
    // been hidden since the last run.
    let wasHiddenSinceRefresh = true;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") wasHiddenSinceRefresh = true;
    };
    const onFocus = () => {
      if (!wasHiddenSinceRefresh) return;
      wasHiddenSinceRefresh = false;
      frameRef.current
        ?.querySelector<HTMLElement>('[data-composer-input-anchor] [contenteditable="true"]')
        ?.focus();
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      transitionPhase("opening");
      animationTimerRef.current = setTimeout(() => {
        transitionPhase("idle");
      }, 220);
      void refresh().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    onFocus();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
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

  const dismiss = (openMainWindow = false) => {
    if (phaseRef.current === "closing" || phaseRef.current === "sending") return;
    transitionPhase("closing");
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    animationTimerRef.current = setTimeout(() => {
      const reveal = openMainWindow ? readBridge().focusWindow() : Promise.resolve();
      void reveal.finally(() => {
        void readBridge().dismissQuickComposer();
      });
    }, 180);
  };
  const startThread = async (input: DraftStartInput) => {
    if (!project) return;
    transitionPhase("sending");
    try {
      await readBridge().submitQuickComposer({ projectId: project.id, input });
      await new Promise((resolve) => setTimeout(resolve, 220));
      setComposerRevision((revision) => revision + 1);
      await readBridge().dismissQuickComposer();
    } catch (error) {
      transitionPhase("idle");
      throw error;
    }
  };

  useEffect(() => readBridge().onQuickComposerDismissRequested(() => dismiss()), []);

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
      <section ref={frameRef} className="quick-composer-frame" data-overlay-surface="">
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
