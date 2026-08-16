import React, { useEffect, useRef, useState } from "react";
import type { Selection } from "@heroui/react";
import { Description, Dropdown, Label, Separator } from "@heroui/react";
import { Check, ChevronsUpDown, ListFilter, MoreHorizontal } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { MENU_BACKDROP_ATTR } from "@/renderer/components/common/ContextMenu";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import { useResponsiveMenu } from "@/renderer/components/common/ResponsiveMenuSurface";
import { ResponsiveContextMenuSurface } from "@/renderer/components/common/ResponsiveContextMenuSurface";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { sidebarRowClass } from "@/renderer/components/common/SidebarButton";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import { useProjectMenu } from "./useProjectMenu";

/**
 * Menu id of the "All projects" reset row. Real project ids are generated and
 * can't collide with this sentinel (mirrors `FLAT_LIST_SCOPE = "__flat__"`).
 */
const ALL_PROJECTS_KEY = "__all__";

/**
 * Interact-outside predicate shared by the two stacked overlays: neither may
 * dismiss while the target stays inside any open menu. React Aria menu items
 * take DOM focus on hover and RAC popovers close on blur (`shouldCloseOnBlur`
 * is hardcoded in `usePopover`), so without this the pointer moving between the
 * filter menu and the project menu on top of it collapses one of them. Same
 * rule RAC applies to its own submenus. Real outside presses still dismiss.
 */
const closeOnlyOutsideMenus = (element: Element) => element.closest('[role="menu"]') === null;

/** Marks the filter trigger so the dismissal paths below can ignore it. */
const TRIGGER_ATTR = "data-poracode-project-filter-trigger";

/**
 * Dismiss the open filter on a press outside every menu overlay, and on Escape.
 *
 * The filter popover has to be `isNonModal` so the stacked project menu can own
 * focus — a modal popover contains focus in its own scope, leaving the menu on
 * top unreachable by hover and keyboard. Non-modal costs both dismissal paths
 * React Aria would otherwise provide, so they are restored here (modelled on
 * {@link BrowserTabGroupMenu}):
 *
 * - `usePopover` derives `isDismissable: !isNonModal`, so no outside-press
 *   handling is attached at all.
 * - Only a modal popover renders as a dialog and takes focus on open, so after a
 *   mouse press focus stays on the trigger and the popover's own Escape handler
 *   never sees the key. Escape is handled at the window instead, which also
 *   makes it peel the stack top-down from wherever focus happens to sit.
 *
 * Presses on the trigger are skipped; it toggles through its own capture
 * handlers below.
 */
function useFilterDismissal(args: {
  isOpen: boolean;
  /** Closes the stacked project menu only; null when none is open. */
  closeStacked: (() => void) | null;
  closeAll: () => void;
}) {
  const { isOpen, closeStacked, closeAll } = args;
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: Event) => {
      const target = event.target as Element | null;
      if (
        target?.closest(
          `[role="menu"], [role="menuitem"], [data-heroui-overlay], [${TRIGGER_ATTR}], [${MENU_BACKDROP_ATTR}]`,
        )
      ) {
        // The stacked menu's backdrop included: that press dismisses only the
        // menu on top, leaving this one open like a submenu would.
        return;
      }
      closeAll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (closeStacked) closeStacked();
      else closeAll();
    };
    // Both press events: React Aria presses start on pointerdown where
    // available, and fall back to mousedown otherwise.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen, closeStacked, closeAll]);
}

/**
 * Trailing overflow button on a project row: reports where the project context
 * menu should open. The press must not reach the enclosing multi-select menu
 * item — that would toggle the filter instead — so the whole gesture stops here.
 *
 * Every step matters: React Aria menu items select on press *up*, so stopping
 * only the press down still toggles the row. And the default focus has to be
 * prevented too, since `useSelectableCollection` focuses the row whenever focus
 * enters it, leaving the row outlined as focus-visible.
 */
function ProjectRowMenuButton(props: {
  project: Project;
  mobile?: boolean;
  /** Extra classes for the host — used to pin the desktop button to the row end. */
  className?: string;
  onOpenMenu: (anchor: { x: number; y: number }) => void;
}) {
  const { t } = useLingui();

  const open = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    props.onOpenMenu({ x: rect.left, y: rect.bottom });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t`Project actions for ${props.project.name}`}
      className={`${props.mobile ? "size-11 rounded-lg" : "-mr-1 size-5 rounded hover:bg-[var(--row-hover)] hover:text-foreground"} flex shrink-0 items-center justify-center text-muted/60${props.className ? ` ${props.className}` : ""}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUp={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        open(event.currentTarget);
      }}
      onKeyDown={(event) =>
        handleKeyActivate(event, () => open(event.currentTarget), { stopPropagation: true })
      }
    >
      <MoreHorizontal className="size-3.5" />
    </div>
  );
}

/**
 * The full project context menu (the same entries the grouped sidebar's
 * project header offers on right-click) anchored at a filter row's overflow
 * button. The flat list has no project headers, so this is the only route to
 * project settings/git/run/workspace actions.
 *
 * Rendered *inside* the filter's popover so React Aria treats it as a nested
 * overlay: its focus scope registers as a child of the filter menu's, which is
 * what lets it take focus (arrow keys and Escape address the top menu, not the
 * one underneath). It also means the filter closing tears this menu down with
 * it, which is the behaviour we want.
 */
function ProjectOverflowMenu(props: {
  project: Project;
  anchor: { x: number; y: number };
  onClose: () => void;
  /** Fired before dispatching a picked action, so the filter menu can close. */
  onAction: () => void;
}) {
  const remoteServerFor = useProjectRemoteServerLookup();
  const projectMenu = useProjectMenu(props.project, {
    isUnreachable: isRemoteProjectStatusUnreachable(
      props.project,
      remoteServerFor(props.project).status,
    ),
  });
  return (
    <ResponsiveContextMenuSurface
      position={props.anchor}
      label={props.project.name}
      items={projectMenu.items}
      onAction={(key) => {
        props.onAction();
        projectMenu.onAction(key);
      }}
      onClose={props.onClose}
      shouldCloseOnInteractOutside={closeOnlyOutsideMenus}
      // Its own clickaway layer: a press anywhere but this menu dismisses it
      // without reaching the filter menu underneath, so the first click after
      // opening it never toggles a project by accident.
      withBackdrop
    />
  );
}

/**
 * Project filter for the flat thread list: a multi-select of which projects'
 * threads to show, defaulting to all of them. Selecting every project — or
 * deselecting the last selected one — collapses back to "All projects" (null),
 * since a filter matching everything or nothing is meaningless.
 *
 * The trigger is a sidebar row labelled with the current selection; the menu
 * is a desktop dropdown and a bottom sheet in compact/coarse-input layout, mirroring
 * {@link SidebarWorkspaceSwitcher}.
 */
export function SidebarProjectFilter(props: {
  /** Projects offered in the menu, including unavailable projects with actions. */
  projects: readonly Project[];
  /** Projects whose threads can currently participate in the filter. */
  filterableProjectIds: ReadonlySet<string>;
  /** Unarchived thread counts per project id, shown as row hints. */
  threadCounts: ReadonlyMap<string, number>;
  /**
   * Selected project ids, pre-intersected with `filterableProjectIds` by the caller;
   * null = all projects.
   */
  value: ReadonlySet<string> | null;
  onChange: (next: string[] | null) => void;
  /** Compact header uses an icon trigger; desktop keeps the labelled row. */
  mobileIconTrigger?: boolean;
}) {
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const remoteServerFor = useProjectRemoteServerLookup();
  const [isOpen, setIsOpen] = useState(false);
  // Which project the overflow menu is open for, and where.
  const [overflowTarget, setOverflowTarget] = useState<{
    project: Project;
    anchor: { x: number; y: number };
  } | null>(null);

  const close = () => {
    setIsOpen(false);
    setOverflowTarget(null);
  };
  useFilterDismissal({
    // The compact surface is a modal sheet and already owns outside-press and
    // Escape dismissal. Its project rows are plain buttons rather than menu
    // items, so the desktop-only window listener would mistake every tap in
    // the sheet for an outside press and close it before multi-selection.
    isOpen: isOpen && !mobile,
    closeStacked: overflowTarget ? () => setOverflowTarget(null) : null,
    closeAll: close,
  });

  // `useMenuTrigger` only ever *opens* on a mouse press: a modal dropdown closes
  // on a second trigger click because its underlay swallows that press, and this
  // popover is non-modal (see useDismissOnOutsidePress), so it renders none.
  // Close here instead and swallow the whole gesture — both the press and the
  // click React Aria falls back to — so it can't re-open behind us.
  const swallowTriggerClick = useRef(false);
  const onTriggerPointerDownCapture = (event: React.PointerEvent) => {
    if (!isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    swallowTriggerClick.current = true;
    close();
  };
  const onTriggerClickCapture = (event: React.MouseEvent) => {
    if (!swallowTriggerClick.current) return;
    swallowTriggerClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const filterableProjects = props.projects.filter((project) =>
    props.filterableProjectIds.has(project.id),
  );
  const unavailableProjects = props.projects.filter(
    (project) => !props.filterableProjectIds.has(project.id),
  );
  const filterableIds = filterableProjects.map((project) => project.id);
  const isAll = props.value === null;
  // In the all state every project reads as selected — unchecking one then
  // filters it out, matching checkbox expectations.
  const selectedProjects: ReadonlySet<string> = props.value ?? new Set(filterableIds);

  const soleSelected =
    !isAll && selectedProjects.size === 1
      ? filterableProjects.find((project) => selectedProjects.has(project.id))
      : undefined;
  const soleMachine = soleSelected ? remoteServerFor(soleSelected).serverName : undefined;
  const baseLabel = isAll
    ? t`All projects`
    : selectedProjects.size === 1
      ? (soleSelected?.name ?? t`All projects`)
      : t`${plural(selectedProjects.size, { one: `# project`, other: `# projects` })}`;
  // A persisted filter outlives the session that set it, so a lone same-named
  // project still has to say which machine it came from — muted, since the
  // project stays the thing being named.
  const label: React.ReactNode = soleMachine ? (
    <>
      {baseLabel}
      <span className="text-muted/60"> · {soleMachine}</span>
    </>
  ) : (
    baseLabel
  );

  const selectAll = () => props.onChange(null);

  const toggleProject = (projectId: string) => {
    const next = new Set(selectedProjects);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    // Empty and complete selections are both just "all projects".
    props.onChange(next.size === 0 || next.size >= filterableIds.length ? null : [...next]);
  };

  const triggerContent = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <ListFilter className="size-3.5 text-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-left">{label}</span>
      </div>
      <span className="flex shrink-0 items-center">
        <ChevronsUpDown className="size-3.5 text-muted" />
      </span>
    </>
  );

  if (mobile) {
    const trigger = props.mobileIconTrigger ? (
      <MobileCircleButton
        aria-label={t`Filter by project`}
        aria-expanded={isOpen}
        className={`poracode-mobile-project-filter ${isAll ? "text-muted" : "text-accent"}`}
        onPointerDown={() => setIsOpen(true)}
        onPress={() => setIsOpen(true)}
      >
        <ListFilter className="size-5" />
      </MobileCircleButton>
    ) : (
      <button
        type="button"
        aria-label={t`Filter by project`}
        aria-expanded={isOpen}
        className={sidebarRowClass({ size: "xs" })}
        onClick={() => setIsOpen(true)}
      >
        {triggerContent}
      </button>
    );
    return (
      <>
        {trigger}
        <BottomSheet isOpen={isOpen} label={t`Filter by project`} onClose={close}>
          <div className="m-sheet-head">
            <span className="truncate">{t`Filter by project`}</span>
          </div>
          <div className="m-sheet-list">
            <button
              type="button"
              className="m-sheet-action"
              aria-pressed={isAll || undefined}
              onClick={selectAll}
            >
              <span className="flex-1 truncate">
                <Trans>All projects</Trans>
              </span>
              {isAll ? <Check className="size-4 shrink-0 text-accent" /> : null}
            </button>
            {filterableProjects.map((project) => {
              const selected = selectedProjects.has(project.id);
              const remote = remoteServerFor(project);
              return (
                <div key={project.id} className="m-sheet-action m-sheet-action--split">
                  <button
                    type="button"
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left"
                    aria-pressed={selected || undefined}
                    onClick={() => toggleProject(project.id)}
                  >
                    <ProjectSelectorIcon project={project} remote={remote} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {remote.serverName ? (
                      <span className="max-w-24 shrink-0 truncate text-xs text-muted/60">
                        {remote.serverName}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-xs text-muted">
                      {props.threadCounts.get(project.id) ?? 0}
                    </span>
                    {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
                  </button>
                  {isHomeProject(project) ? null : (
                    <ProjectRowMenuButton
                      project={project}
                      mobile
                      onOpenMenu={(anchor) => setOverflowTarget({ project, anchor })}
                    />
                  )}
                </div>
              );
            })}
            {unavailableProjects.map((project) => {
              const remote = remoteServerFor(project);
              return (
                <div
                  key={project.id}
                  className="m-sheet-action m-sheet-action--split opacity-50"
                  data-static="true"
                >
                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-2.5">
                    <ProjectSelectorIcon project={project} remote={remote} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {remote.serverName ? (
                      <span className="max-w-24 shrink-0 truncate text-xs text-muted/60">
                        {remote.serverName}
                      </span>
                    ) : null}
                  </div>
                  {isHomeProject(project) ? null : (
                    <ProjectRowMenuButton
                      project={project}
                      mobile
                      onOpenMenu={(anchor) => setOverflowTarget({ project, anchor })}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {overflowTarget ? (
            <ProjectOverflowMenu
              project={overflowTarget.project}
              anchor={overflowTarget.anchor}
              onClose={() => setOverflowTarget(null)}
              onAction={close}
            />
          ) : null}
        </BottomSheet>
      </>
    );
  }

  // Controlled multi-selection menu: a press flips one key, so diff the new
  // selection against the rendered one to find it, then route through the same
  // toggle/reset logic as the sheet. Selection changes never close the menu.
  const menuSelectedKeys = new Set<string>([
    ...(isAll ? [ALL_PROJECTS_KEY] : []),
    ...selectedProjects,
  ]);
  const handleSelectionChange = (keys: Selection) => {
    // Interacting with the filter again dismisses a stacked overflow menu,
    // matching how clicking elsewhere closes a context menu.
    setOverflowTarget(null);
    if (keys === "all") {
      selectAll();
      return;
    }
    const next = new Set([...keys].map(String));
    let pressed: string | undefined;
    for (const key of next) {
      if (!menuSelectedKeys.has(key)) {
        pressed = key;
        break;
      }
    }
    if (pressed === undefined) {
      for (const key of menuSelectedKeys) {
        if (!next.has(key)) {
          pressed = key;
          break;
        }
      }
    }
    if (pressed === undefined) return;
    if (pressed === ALL_PROJECTS_KEY) {
      selectAll();
      return;
    }
    toggleProject(pressed);
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) setIsOpen(true);
        // The stacked menu lives in this popover's subtree, so it goes away with
        // the filter — drop its target too, or it would reappear on the next open.
        else close();
      }}
    >
      {/* display:contents keeps the head row's layout while giving the trigger
          press a capture-phase handler React Aria's Button never exposes. */}
      <div
        className="contents"
        onPointerDownCapture={onTriggerPointerDownCapture}
        onClickCapture={onTriggerClickCapture}
      >
        <Dropdown.Trigger
          {...{ [TRIGGER_ATTR]: true }}
          aria-label={t`Filter by project`}
          className={`${sidebarRowClass({ size: "xs" })} h-8`}
        >
          {triggerContent}
        </Dropdown.Trigger>
      </div>
      {/* Non-modal so the project menu stacked on top can hold focus: a modal
          popover contains focus in its own scope, which leaves that menu
          unreachable by hover and keyboard. Dismissal therefore runs through
          useFilterDismissal above. The guard here only exempts targets inside
          another menu, so hover-driven focus moves between the two stacked
          menus don't dismiss this one. */}
      <Dropdown.Popover
        placement="bottom start"
        isNonModal
        shouldCloseOnInteractOutside={closeOnlyOutsideMenus}
      >
        <Dropdown.Menu
          aria-label={t`Projects`}
          className="poracode-menu min-w-56"
          selectionMode="multiple"
          selectedKeys={menuSelectedKeys}
          onSelectionChange={handleSelectionChange}
        >
          <Dropdown.Item key={ALL_PROJECTS_KEY} id={ALL_PROJECTS_KEY} textValue={t`All projects`}>
            <Label className="flex-1 truncate">
              <Trans>All projects</Trans>
            </Label>
            <Dropdown.ItemIndicator />
          </Dropdown.Item>
          {filterableProjects.length > 0 || unavailableProjects.length > 0 ? <Separator /> : null}
          {filterableProjects.map((project) => {
            const remote = remoteServerFor(project);
            return (
              <Dropdown.Item key={project.id} id={project.id} textValue={project.name}>
                <ProjectSelectorIcon project={project} remote={remote} />
                <Label className="min-w-0 truncate">{project.name}</Label>
                {remote.serverName ? <Description>{remote.serverName}</Description> : null}
                <span className="ms-auto shrink-0 text-xs text-muted">
                  {props.threadCounts.get(project.id) ?? 0}
                </span>
                <Dropdown.ItemIndicator />
                {isHomeProject(project) ? null : (
                  <ProjectRowMenuButton
                    project={project}
                    onOpenMenu={(anchor) => {
                      // The filter menu stays open; the overflow menu stacks
                      // on top like a submenu and closes it once an action is
                      // picked (see ProjectOverflowMenu's onAction).
                      setOverflowTarget({ project, anchor });
                    }}
                  />
                )}
              </Dropdown.Item>
            );
          })}
          {filterableProjects.length > 0 && unavailableProjects.length > 0 ? <Separator /> : null}
          {unavailableProjects.length > 0 ? (
            <Dropdown.Section selectionMode="none">
              {unavailableProjects.map((project) => {
                const remote = remoteServerFor(project);
                return (
                  <Dropdown.Item key={project.id} id={project.id} textValue={project.name}>
                    <ProjectSelectorIcon project={project} remote={remote} />
                    <Label className="min-w-0 truncate opacity-50">{project.name}</Label>
                    {remote.serverName ? <Description>{remote.serverName}</Description> : null}
                    {isHomeProject(project) ? null : (
                      <ProjectRowMenuButton
                        project={project}
                        className="ms-auto"
                        onOpenMenu={(anchor) => setOverflowTarget({ project, anchor })}
                      />
                    )}
                  </Dropdown.Item>
                );
              })}
            </Dropdown.Section>
          ) : null}
        </Dropdown.Menu>
        {overflowTarget ? (
          <ProjectOverflowMenu
            project={overflowTarget.project}
            anchor={overflowTarget.anchor}
            onClose={() => setOverflowTarget(null)}
            onAction={close}
          />
        ) : null}
      </Dropdown.Popover>
    </Dropdown>
  );
}
