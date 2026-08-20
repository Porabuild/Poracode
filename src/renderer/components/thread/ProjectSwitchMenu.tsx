import { startTransition, useState } from "react";
import { Check, ChevronDown, House } from "lucide-react";
import { Description, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_NAME, isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { makeDraftPaneId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import { rememberWorkspaceProject } from "@/renderer/state/workspaceStore";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { useProjectSwitchProjects } from "./projectSwitchGroups";

export function ProjectSwitchMenu(props: {
  currentProjectId: string;
  variant: "hero" | "compact";
  /** When provided, switching replaces this pane id instead of changing the top-level draft view. */
  paneId?: string;
  /** Keeps project selection local to an embedding surface such as Quick Composer. */
  onSelectProject?: (projectId: string) => void;
}) {
  const { currentProjectId, variant, paneId, onSelectProject } = props;
  const { t } = useLingui();
  // Only the active workspace's projects: the composer matches the sidebar,
  // and reaching another workspace's projects goes through the workspace
  // switcher first.
  const projects = useProjectSwitchProjects();
  const allProjects = useAppStore((state) => state.projects);
  const remoteServerFor = useProjectRemoteServerLookup();
  const openDraft = useAppStore((state) => state.openDraft);
  const replacePaneId = useAppStore((state) => state.replacePaneId);
  const discardDraftContent = useAppStore((state) => state.discardDraftContent);
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);

  // The label may name a project the active workspace hides (a draft that
  // outlived a workspace switch), so it resolves against the full list.
  const current = allProjects.find((project) => project.id === currentProjectId);
  const isHomeCurrent = isHomeProjectId(currentProjectId);
  const label = isHomeCurrent ? HOME_PROJECT_NAME : (current?.name ?? t`Select project`);
  const currentRemote = remoteServerFor(current);
  const triggerIcon = isHomeCurrent ? (
    <House className="size-3.5 shrink-0 text-muted" />
  ) : current ? (
    <ProjectSelectorIcon project={current} remote={currentRemote} className="size-3.5" />
  ) : null;
  // The machine trails the name, so the project stays the thing you read first.
  const triggerMachine = currentRemote.serverName ? (
    <span className="min-w-0 shrink truncate text-xs text-muted/60">
      {currentRemote.serverName}
    </span>
  ) : null;
  const isDisabled =
    projects.length === 0 || (projects.length === 1 && projects[0]?.id === currentProjectId);

  function handleSelect(nextProjectId: string) {
    if (nextProjectId === currentProjectId) return;
    rememberWorkspaceProject(nextProjectId);
    if (onSelectProject) {
      onSelectProject(nextProjectId);
      return;
    }
    discardDraftContent(currentProjectId);
    startTransition(() => {
      if (paneId) {
        replacePaneId(paneId, makeDraftPaneId(nextProjectId));
      } else {
        openDraft(nextProjectId);
      }
    });
  }

  /** Finger-sized rows for the mobile bottom drawer. */
  function sheetRows(entries: readonly Project[]) {
    return entries.map((project) => {
      const isHome = isHomeProject(project);
      const itemLabel = isHome ? HOME_PROJECT_NAME : project.name;
      const selected = project.id === currentProjectId;
      const remote = remoteServerFor(project);
      return (
        <button
          key={project.id}
          type="button"
          className="m-sheet-action"
          aria-pressed={selected || undefined}
          onClick={() => {
            setIsOpen(false);
            handleSelect(project.id);
          }}
        >
          <ProjectSelectorIcon project={project} remote={remote} />
          <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
          {remote.serverName ? (
            <span className="max-w-28 shrink-0 truncate text-xs text-muted/60">
              {remote.serverName}
            </span>
          ) : null}
          {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
        </button>
      );
    });
  }

  function menuItems(entries: readonly Project[]) {
    return entries.map((project) => {
      const isHome = isHomeProject(project);
      const itemLabel = isHome ? HOME_PROJECT_NAME : project.name;
      const remote = remoteServerFor(project);
      return (
        <Dropdown.Item key={project.id} id={project.id} textValue={itemLabel}>
          <ProjectSelectorIcon project={project} remote={remote} />
          <Label>{itemLabel}</Label>
          {remote.serverName ? <Description>{remote.serverName}</Description> : null}
        </Dropdown.Item>
      );
    });
  }

  // Mobile PWA: present as a bottom drawer with finger-sized rows instead of the
  // desktop HeroUI dropdown popover. `mobile === isRemoteSession()`, so the
  // desktop branch below is never reached on the phone (and stays untouched).
  if (mobile) {
    const triggerClass =
      variant === "hero"
        ? "group mx-auto inline-flex max-w-full items-center gap-1.5 rounded border border-transparent px-2 py-0.5 outline-none transition-colors hover:border-border/60 hover:bg-[var(--row-hover)] disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
        : "group inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-sm leading-tight text-muted/60 outline-none transition-colors hover:bg-[var(--row-hover)] hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted/60";
    return (
      <ResponsiveMenuSurface
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={t`Switch project`}
        trigger={
          <button
            type="button"
            aria-label={t`Switch project`}
            aria-expanded={isOpen}
            disabled={isDisabled}
            className={triggerClass}
            onClick={() => {
              if (!isDisabled) setIsOpen(true);
            }}
          >
            {variant === "hero" ? (
              <span className="min-w-0 truncate pb-[0.08em] leading-snug font-medium tracking-normal text-transparent [background-image:linear-gradient(135deg,var(--muted)_0%,color-mix(in_oklab,var(--accent)_30%,var(--muted))_100%)] [background-size:100%_100%] bg-clip-text font-mono">
                {label}
              </span>
            ) : (
              <>
                {triggerIcon}
                <span className="min-w-0 truncate">{label}</span>
                {triggerMachine}
              </>
            )}
            {!isDisabled ? <ChevronDown className="size-3 shrink-0 text-muted/60" /> : null}
          </button>
        }
      >
        <div className="m-sheet-list">{sheetRows(projects)}</div>
      </ResponsiveMenuSurface>
    );
  }

  const menu = (
    <Dropdown.Menu
      aria-label={t`Switch project`}
      selectionMode="single"
      selectedKeys={[currentProjectId]}
      onAction={(key) => handleSelect(String(key))}
      className="poracode-menu min-w-56"
    >
      {menuItems(projects)}
    </Dropdown.Menu>
  );

  if (variant === "hero") {
    return (
      <Dropdown>
        <Dropdown.Trigger
          aria-label={t`Switch project`}
          isDisabled={isDisabled}
          className="group mx-auto inline-flex max-w-full items-center gap-1.5 rounded border border-transparent px-2 py-0.5 outline-none transition-colors hover:border-border/60 hover:bg-[var(--row-hover)] focus-visible:border-border focus-visible:bg-[var(--row-hover)] disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
        >
          <span className="min-w-0 truncate pb-[0.08em] leading-snug font-medium tracking-normal text-transparent [background-image:linear-gradient(135deg,var(--muted)_0%,color-mix(in_oklab,var(--accent)_30%,var(--muted))_100%)] [background-size:100%_100%] bg-clip-text font-mono">
            {label}
          </span>
          {!isDisabled ? (
            <ChevronDown className="size-3 shrink-0 text-muted/60 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          ) : null}
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom">{menu}</Dropdown.Popover>
      </Dropdown>
    );
  }

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={t`Switch project`}
        isDisabled={isDisabled}
        className="group inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-sm leading-tight text-muted/60 outline-none transition-colors hover:bg-[var(--row-hover)] hover:text-foreground focus-visible:bg-[var(--row-hover)] disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted/60"
      >
        {triggerIcon}
        <span className="min-w-0 truncate">{label}</span>
        {triggerMachine}
        {!isDisabled ? (
          <ChevronDown className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        ) : null}
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">{menu}</Dropdown.Popover>
    </Dropdown>
  );
}
