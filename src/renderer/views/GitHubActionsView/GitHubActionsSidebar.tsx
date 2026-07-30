import { Button, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, PanelLeft, PanelLeftClose, Pin, Play, RefreshCw, Workflow } from "lucide-react";
import type { GitHubActionsWorkflow } from "@/shared/contracts";
import { SidebarButton } from "@/renderer/components/common";
import {
  overlaySidebarColumnClass,
  overlaySidebarSurfaceClass,
  sidebarBodyScrollClass,
  sidebarFooterNavClass,
  sidebarIconRailFooterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";

export function GitHubActionsSidebar(props: {
  workflows: GitHubActionsWorkflow[];
  selectedWorkflowId: number | null;
  pinnedWorkflowIds: number[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (workflowId: number) => void;
  onRun: (workflowId: number) => void;
  onTogglePin: (workflowId: number) => void;
}) {
  const { t } = useLingui();
  const { isCollapsed, collapse, expand } = useSidebar();
  const pinned = new Set(props.pinnedWorkflowIds);
  const workflows = [...props.workflows].sort((a, b) => {
    const aPinned = pinned.has(a.id);
    const bPinned = pinned.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

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
          <div className="flex items-center justify-between px-2 py-1">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              <Trans>Workflows</Trans>
            </h2>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="size-7 min-w-0"
              isDisabled={props.loading}
              aria-label={t`Refresh workflows`}
              onPress={props.onRefresh}
            >
              <RefreshCw className={`size-3.5 ${props.loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

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
                    <Tooltip delay={150}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        className="size-7 min-w-0 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={t`Run workflow`}
                        onPress={() => props.onRun(workflow.id)}
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Tooltip.Content placement="right">
                        <Trans>Run workflow</Trans>
                      </Tooltip.Content>
                    </Tooltip>
                    <Tooltip delay={150}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        className={`size-7 min-w-0 ${
                          isPinned
                            ? "text-accent"
                            : "text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        }`}
                        aria-label={isPinned ? t`Unpin workflow` : t`Pin workflow`}
                        onPress={() => props.onTogglePin(workflow.id)}
                      >
                        <Pin className={`size-3.5 ${isPinned ? "fill-current" : ""}`} />
                      </Button>
                      <Tooltip.Content placement="right">
                        {isPinned ? <Trans>Unpin workflow</Trans> : <Trans>Pin workflow</Trans>}
                      </Tooltip.Content>
                    </Tooltip>
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
