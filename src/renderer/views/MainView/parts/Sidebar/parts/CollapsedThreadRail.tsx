import { Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import type { Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { SidebarButton, sidebarIconButtonClass } from "@/renderer/components/common/SidebarButton";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { openThread } from "@/renderer/actions/threadActions";
import { useCurrentThreadIds, useIsCurrentThread } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useAuxiliaryThreadWindows } from "@/renderer/state/auxiliaryThreadWindows";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceThreadFilter } from "@/renderer/state/workspaceSelectors";
import { ThreadContextMenu } from "./ThreadContextMenu";

function ThreadIcon(props: { thread: Thread }) {
  return <ThreadProviderIcon thread={props.thread} className="size-3.5" />;
}

function CollapsedThreadRailButton(props: {
  thread: Thread;
  projectName?: string;
  iconOnly?: boolean;
  onPress?: () => void;
}) {
  const { thread, projectName, iconOnly = true, onPress } = props;
  const isActive = useIsCurrentThread(thread.id);
  const project = useAppStore((s) => s.projects.find((p) => p.id === thread.projectId));
  const title = thread.done ? (
    <span className="opacity-50 line-through">{thread.title}</span>
  ) : (
    thread.title
  );
  const button = (
    <SidebarButton
      iconOnly={iconOnly}
      size="xs"
      icon={<ThreadIcon thread={thread} />}
      label={title}
      {...(projectName
        ? {
            tooltip: (
              <span>
                {title}
                <span className="text-muted"> — {projectName}</span>
              </span>
            ),
          }
        : {})}
      isActive={isActive}
      isCurrentPage={isActive}
      suffix={
        !iconOnly && projectName ? (
          <span className="max-w-24 truncate text-xs text-muted">{projectName}</span>
        ) : null
      }
      onPress={() => {
        openThread(thread.id);
        onPress?.();
      }}
    />
  );
  if (!project) return button;
  // No `onRename`: the icon rail has no inline rename affordance.
  return (
    <ThreadContextMenu thread={thread} project={project}>
      {button}
    </ThreadContextMenu>
  );
}

export function CollapsedThreadRail() {
  const { t } = useLingui();
  const currentThreadIds = useCurrentThreadIds();
  const railRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState(0);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const auxiliaryIds = useAuxiliaryThreadWindows((s) => s.hiddenThreadIds);
  const homeScopeEnabled = useSharedSettings((s) => s.homeScopeEnabled);
  const showProjectName = usePanelStore((s) => s.threadListLayout === "flat");
  const isThreadInActiveWorkspace = useWorkspaceThreadFilter();
  const projects = useAppStore((s) => s.projects);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const activeThreads = useAppStore(
    useShallow((state) =>
      state.threads.filter(
        (thread) =>
          !auxiliaryIds.has(thread.id) &&
          thread.status !== "inactive" &&
          !thread.done &&
          !thread.archived &&
          (homeScopeEnabled || !isHomeProjectId(thread.projectId)) &&
          isThreadInActiveWorkspace(thread),
      ),
    ),
  );
  useLayoutEffect(() => {
    const el = railRef.current;
    if (!el) return;
    // 32px buttons with a 2px gap; the container height is set by the sidebar.
    const measure = () => setSlots(Math.max(1, Math.floor((el.clientHeight + 2) / 34)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shownCount = activeThreads.length <= slots ? activeThreads.length : Math.max(0, slots - 1);
  const overflowed = activeThreads.slice(shownCount);
  const hasActiveOverflow = overflowed.some((thread) => currentThreadIds.includes(thread.id));
  if (overflowed.length === 0 && overflowOpen) setOverflowOpen(false);

  return (
    <div
      ref={railRef}
      className="flex min-h-8 flex-1 flex-col gap-0.5 overflow-hidden [&>*]:shrink-0"
    >
      {activeThreads.slice(0, shownCount).map((thread) => {
        const projectName = showProjectName ? projectsById.get(thread.projectId)?.name : undefined;
        return (
          <CollapsedThreadRailButton
            key={thread.id}
            thread={thread}
            {...(projectName ? { projectName } : {})}
          />
        );
      })}
      {overflowed.length > 0 ? (
        <Popover isOpen={overflowOpen} onOpenChange={setOverflowOpen}>
          <Popover.Trigger
            aria-label={t`More`}
            className={`${sidebarIconButtonClass({ isActive: hasActiveOverflow })} m-0.5 h-7 w-7 rounded-full border border-[var(--hairline)] text-[10px] font-semibold`}
          >
            +{overflowed.length}
          </Popover.Trigger>
          <Popover.Content
            placement="right bottom"
            shouldCloseOnInteractOutside={(element) => !element.closest('[role="menu"]')}
          >
            <Popover.Dialog
              aria-label={t`Threads`}
              className="max-h-[min(24rem,70vh)] w-72 max-w-[80vw] overflow-y-auto p-1"
            >
              {overflowed.map((thread) => {
                const projectName = showProjectName
                  ? projectsById.get(thread.projectId)?.name
                  : undefined;
                return (
                  <CollapsedThreadRailButton
                    key={thread.id}
                    thread={thread}
                    iconOnly={false}
                    {...(projectName ? { projectName } : {})}
                    onPress={() => setOverflowOpen(false)}
                  />
                );
              })}
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      ) : null}
    </div>
  );
}
