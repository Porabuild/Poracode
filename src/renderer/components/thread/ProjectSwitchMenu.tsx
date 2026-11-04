import { useState } from "react";
import { Check, ChevronDown, House } from "lucide-react";
import { Description, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_NAME, isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { pickGroupMember } from "@/renderer/state/projectGroups/useProjectGroups";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import type { ProjectGroupRow } from "@/renderer/state/projectGroups/projectGroups";
import { useProjectSwitchEntries } from "./projectSwitchGroups";
import { ProjectEnvironmentMenu } from "./ProjectEnvironmentMenu";
import { switchDraftProject } from "./switchDraftProject";

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
  // switcher first. One entry per logical project; the environment is picked
  // by the adjacent environment menu.
  const entries = useProjectSwitchEntries();
  const allProjects = useAppStore((state) => state.projects);
  const remoteServerFor = useProjectRemoteServerLookup();
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
    <ProjectSelectorIcon
      project={current}
      remote={currentRemote}
      className="size-3.5"
      showEnvironment={false}
    />
  ) : null;
  const currentEntry = entries.find((entry) =>
    (entry.group?.members ?? entry.members).some((member) => member.id === currentProjectId),
  );
  const isDisabled = entries.length === 0 || (entries.length === 1 && currentEntry !== undefined);
  const environmentMenu = (
    <ProjectEnvironmentMenu
      currentProjectId={currentProjectId}
      {...(paneId ? { paneId } : {})}
      {...(onSelectProject ? { onSelectProject } : {})}
    />
  );

  function handleSelect(groupId: string) {
    const entry = entries.find((candidate) => candidate.id === groupId);
    if (!entry || entry === currentEntry) return;
    // Members are already the workspace's reachable rows.
    const target = pickGroupMember(entry.members, () => true);
    if (!target) return;
    switchDraftProject(currentProjectId, target.id, { paneId, onSelectProject });
  }

  /** Label for an entry: the current row's own name, else the anchor's. */
  function entryProject(entry: ProjectGroupRow): Project {
    return entry.members.find((project) => project.id === currentProjectId) ?? entry.members[0]!;
  }

  /** Machine name for a project that lives on one paired machine only. */
  function soleServerName(entry: ProjectGroupRow): string | undefined {
    return entry.members.length === 1 ? remoteServerFor(entry.members[0]).serverName : undefined;
  }

  /** Finger-sized rows for the mobile bottom drawer. */
  function sheetRows(list: readonly ProjectGroupRow[]) {
    return list.map((entry) => {
      const project = entryProject(entry);
      const isHome = isHomeProject(project);
      const itemLabel = isHome ? HOME_PROJECT_NAME : project.name;
      const selected = entry === currentEntry;
      const remote = remoteServerFor(project);
      const serverName = soleServerName(entry);
      return (
        <button
          key={entry.id}
          type="button"
          className="m-sheet-action"
          aria-pressed={selected || undefined}
          onClick={() => {
            setIsOpen(false);
            handleSelect(entry.id);
          }}
        >
          <ProjectSelectorIcon project={project} remote={remote} showEnvironment={false} />
          <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
          {serverName ? (
            <span className="max-w-28 shrink-0 truncate text-xs text-muted/60">{serverName}</span>
          ) : null}
          {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
        </button>
      );
    });
  }

  function menuItems(list: readonly ProjectGroupRow[]) {
    return list.map((entry) => {
      const project = entryProject(entry);
      const isHome = isHomeProject(project);
      const itemLabel = isHome ? HOME_PROJECT_NAME : project.name;
      const remote = remoteServerFor(project);
      const serverName = soleServerName(entry);
      return (
        <Dropdown.Item key={entry.id} id={entry.id} textValue={itemLabel}>
          <ProjectSelectorIcon project={project} remote={remote} showEnvironment={false} />
          <Label>{itemLabel}</Label>
          {serverName ? <Description>{serverName}</Description> : null}
        </Dropdown.Item>
      );
    });
  }

  // Mobile PWA: present as a bottom drawer with finger-sized rows instead of the
  // desktop HeroUI dropdown popover. The runtime surface, not its transport,
  // decides which presentation is appropriate.
  if (mobile) {
    const triggerClass =
      variant === "hero"
        ? "group mx-auto inline-flex max-w-full items-center gap-1.5 rounded border border-transparent px-2 py-0.5 outline-none transition-colors hover:border-border/60 hover:bg-[var(--row-hover)] disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
        : "group inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-sm leading-tight text-muted/60 outline-none transition-colors hover:bg-[var(--row-hover)] hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted/60";
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1">
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
                </>
              )}
              {!isDisabled ? <ChevronDown className="size-3 shrink-0 text-muted/60" /> : null}
            </button>
          }
        >
          <div className="m-sheet-list">{sheetRows(entries)}</div>
        </ResponsiveMenuSurface>
        {environmentMenu}
      </span>
    );
  }

  const menu = (
    <Dropdown.Menu
      aria-label={t`Switch project`}
      selectionMode="single"
      selectedKeys={currentEntry ? [currentEntry.id] : []}
      onAction={(key) => handleSelect(String(key))}
      className="poracode-menu min-w-56"
    >
      {menuItems(entries)}
    </Dropdown.Menu>
  );

  if (variant === "hero") {
    return (
      <span className="mx-auto inline-flex max-w-full items-center gap-1">
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
        {environmentMenu}
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <Dropdown>
        <Dropdown.Trigger
          aria-label={t`Switch project`}
          isDisabled={isDisabled}
          className="group inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-sm leading-tight text-muted/60 outline-none transition-colors hover:bg-[var(--row-hover)] hover:text-foreground focus-visible:bg-[var(--row-hover)] disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted/60"
        >
          {triggerIcon}
          <span className="min-w-0 truncate">{label}</span>
          {!isDisabled ? (
            <ChevronDown className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          ) : null}
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end">{menu}</Dropdown.Popover>
      </Dropdown>
      {environmentMenu}
    </span>
  );
}
