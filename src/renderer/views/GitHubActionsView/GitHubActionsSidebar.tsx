import { Button, Description, Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  ChevronsUpDown,
  PanelLeft,
  PanelLeftClose,
  Pin,
  Play,
  UserRound,
  Workflow,
} from "lucide-react";
import type {
  GitHubAccount,
  GitHubAccountRef,
  GitHubActionsWorkflow,
  Project,
} from "@/shared/contracts";
import { SidebarButton } from "@/renderer/components/common";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import {
  overlaySidebarColumnClass,
  overlaySidebarSurfaceClass,
  sidebarBodyScrollClass,
  sidebarFooterNavClass,
  sidebarIconRailFooterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";

/* The ghost recipe's hover wash is tuned for raised surfaces and vanishes on
   dim idle rows, so revealed row actions get a stronger foreground-derived
   wash that stays visible on both idle and active rows. */
const workflowIconButtonHoverClass =
  "hover:bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]";

export function GitHubActionsSidebar(props: {
  projects: Project[];
  selectedProjectId: string | null;
  accounts: GitHubAccount[];
  selectedAccount?: GitHubAccountRef;
  resolvedAccount?: GitHubAccountRef;
  workflows: GitHubActionsWorkflow[];
  selectedWorkflowId: number | null;
  pinnedWorkflowIds: number[];
  loading: boolean;
  onClose: () => void;
  onSelectProject: (projectId: string) => void;
  onSelect: (workflowId: number) => void;
  onRun: (workflowId: number) => void;
  onTogglePin: (workflowId: number) => void;
}) {
  const { t } = useLingui();
  const { isCollapsed, collapse, expand } = useSidebar();
  const remoteServerFor = useProjectRemoteServerLookup();
  const pinned = new Set(props.pinnedWorkflowIds);
  const selectedProject = props.projects.find((project) => project.id === props.selectedProjectId);
  const selectedRemote = remoteServerFor(selectedProject);
  const workflows = [...props.workflows].sort((a, b) => {
    const aPinned = pinned.has(a.id);
    const bPinned = pinned.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  // Informational only: account scoping is automatic (an explicit per-project
  // override wins, then whichever signed-in account can see the repository).
  const effectiveAccount =
    props.selectedAccount ??
    props.resolvedAccount ??
    (props.accounts.length === 1 ? props.accounts[0] : undefined);
  const accountHostIsAmbiguous = effectiveAccount
    ? props.accounts.some(
        (account) =>
          account.login === effectiveAccount.login && account.host !== effectiveAccount.host,
      )
    : false;

  return (
    <div className={`relative h-full ${overlaySidebarSurfaceClass}`}>
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            <SidebarButton
              iconOnly
              icon={<Workflow className="size-4" />}
              label={t`Workflows`}
              isActive
            />
          </div>
          <div className={sidebarIconRailFooterClass}>
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label={t`Return to app`}
              onPress={props.onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label={t`Show sidebar`}
              onPress={expand}
            />
          </div>
        </div>
      )}

      <div
        className={`${overlaySidebarColumnClass} gap-0 transition-opacity duration-150 ${
          isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"
        }`}
      >
        <div className={sidebarBodyScrollClass()}>
          {selectedProject ? (
            <div className="py-1">
              <Dropdown>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full min-w-0 justify-start gap-2 rounded-3xl px-2 text-sm text-muted"
                  aria-label={t`Project`}
                >
                  <ProjectSelectorIcon project={selectedProject} remote={selectedRemote} />
                  <span className="min-w-0 truncate">{selectedProject.name}</span>
                  {selectedRemote.serverName ? (
                    <span className="min-w-0 shrink truncate text-xs text-muted/60">
                      {selectedRemote.serverName}
                    </span>
                  ) : null}
                  <ChevronsUpDown className="ms-auto size-3.5 shrink-0" />
                </Button>
                <Dropdown.Popover placement="bottom start" className="min-w-[--trigger-width]">
                  <Dropdown.Menu
                    aria-label={t`Project`}
                    className="poracode-menu"
                    selectionMode="single"
                    selectedKeys={[selectedProject.id]}
                    onAction={(key) => props.onSelectProject(String(key))}
                  >
                    {props.projects.map((project) => {
                      const remote = remoteServerFor(project);
                      return (
                        <Dropdown.Item
                          key={project.id}
                          id={project.id}
                          textValue={project.name}
                          // An offline machine can't serve workflows, so its
                          // projects stay visible but unpickable.
                          isDisabled={isRemoteProjectStatusUnreachable(project, remote.status)}
                        >
                          <ProjectSelectorIcon project={project} remote={remote} />
                          <Label>{project.name}</Label>
                          {remote.serverName ? (
                            <Description>{remote.serverName}</Description>
                          ) : null}
                          <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                      );
                    })}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              {effectiveAccount ? (
                <div className="flex h-8 w-full min-w-0 items-center gap-2 rounded-3xl px-2 text-sm text-muted">
                  <UserRound className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{effectiveAccount.login}</span>
                  {accountHostIsAmbiguous ? (
                    <span className="min-w-0 shrink truncate text-xs text-muted/60">
                      {effectiveAccount.host}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <nav className="space-y-0.5" aria-label={t`Workflows`}>
            {workflows.map((workflow) => {
              const selected = workflow.id === props.selectedWorkflowId;
              const isPinned = pinned.has(workflow.id);
              return (
                <div
                  key={workflow.id}
                  className={`group relative flex min-w-0 items-center rounded-3xl transition-colors ${
                    selected
                      ? "bg-[var(--row-active)] text-foreground"
                      : "text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
                  }`}
                >
                  <Button
                    variant="ghost"
                    className="h-auto min-w-0 flex-1 justify-start rounded-3xl bg-transparent px-2 py-1.5 text-left hover:bg-transparent"
                    {...(selected ? { "aria-current": "page" as const } : {})}
                    onPress={() => props.onSelect(workflow.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{workflow.name}</span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                        {workflow.path}
                      </span>
                    </span>
                  </Button>

                  <div className="mr-1 flex shrink-0 items-center">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className={`size-7 min-w-0 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${workflowIconButtonHoverClass} hover:text-foreground`}
                      aria-label={t`Run workflow`}
                      onPress={() => props.onRun(workflow.id)}
                    >
                      <Play className="size-3.5" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className={`size-7 min-w-0 ${workflowIconButtonHoverClass} ${
                        isPinned
                          ? "text-accent"
                          : "text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                      }`}
                      aria-label={isPinned ? t`Unpin workflow` : t`Pin workflow`}
                      onPress={() => props.onTogglePin(workflow.id)}
                    >
                      <Pin className={`size-3.5 ${isPinned ? "fill-current" : ""}`} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </nav>

          {!props.loading && workflows.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted">
              <Trans>No active workflows found.</Trans>
            </p>
          ) : null}
        </div>

        <div className={sidebarFooterNavClass}>
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label={t`Return to app`}
            onPress={props.onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label={t`Hide sidebar`}
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}
