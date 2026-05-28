import { Tooltip } from "@heroui/react";
import { Bot, Check, GitBranch, X } from "lucide-react";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadSubAgentDockStore } from "@/renderer/state/threadSubAgentDockStore";
import {
  getChildItemIdsStoreSelector,
  getRuntimeItemStoreSelector,
  selectActiveSubAgentParentItemIds,
} from "../../chatPaneSelectors";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import type { ToolCallPayload } from "@/shared/contracts";
import { deriveToolDisplay, isWorkflowTool } from "./toolDisplay";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { ThreadDockHeader, ThreadDockList, ThreadDockSection } from "../../../ThreadDockUI";

interface ActiveSubAgentTileProps {
  threadId: string;
}

export function ActiveSubAgentTile({ threadId }: ActiveSubAgentTileProps) {
  const ids = useAppStore((s) => selectActiveSubAgentParentItemIds(s, threadId));
  const dismissed = useThreadSubAgentDockStore((s) => s.dismissedByThread[threadId]);
  const dismissMany = useThreadSubAgentDockStore((s) => s.dismissMany);

  const visibleIds = dismissed ? ids.filter((id) => !dismissed[id]) : ids;

  const completedCount = useAppStore(
    (s) =>
      visibleIds.filter((id) => {
        const item = getRuntimeItemStoreSelector(threadId, id)(s);
        if (!item) return false;
        const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
        return item.state === "completed" && payload?.status !== "running";
      }).length,
  );
  const workflowCount = useAppStore(
    (s) =>
      visibleIds.filter((id) => {
        const item = getRuntimeItemStoreSelector(threadId, id)(s);
        if (!item) return false;
        return isWorkflowTool(getRuntimeItemPayload<ToolCallPayload>(item, "tool_call"));
      }).length,
  );

  if (visibleIds.length === 0) return null;
  const title =
    workflowCount === visibleIds.length
      ? "Workflows"
      : workflowCount > 0
        ? "Background tasks"
        : "Subagents";
  const HeaderIcon = workflowCount === visibleIds.length ? GitBranch : Bot;

  return (
    <ThreadDockSection placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={HeaderIcon}
        title={title}
        countLabel={`${completedCount}/${visibleIds.length}`}
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <button
                aria-label="Close subagents panel"
                className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
                type="button"
                onClick={() => dismissMany(threadId, visibleIds)}
              >
                <X className="size-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content>Close subagents</Tooltip.Content>
          </Tooltip>
        }
      />
      <ThreadDockList placement="composer" collapsed={false} gap="1">
        {visibleIds.map((id) => (
          <ActiveSubAgentRow key={id} threadId={threadId} itemId={id} />
        ))}
      </ThreadDockList>
    </ThreadDockSection>
  );
}

function ActiveSubAgentRow({ threadId, itemId }: { threadId: string; itemId: string }) {
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, itemId));
  const childCount = useAppStore(getChildItemIdsStoreSelector(threadId, itemId)).length;
  const openSubAgent = useAppStore((s) => s.openSubAgent);
  const dismiss = useThreadSubAgentDockStore((s) => s.dismiss);

  if (!item) return null;
  const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
  if (!payload?.name) return null;

  const display = deriveToolDisplay(payload);
  const isRunning = item.state !== "completed" || payload?.status === "running";
  const isDone = !isRunning;
  const progress = payload?.progress;
  const stepCount = progress?.stepCount ?? childCount;

  const innerClass = `flex items-center gap-2 rounded px-2 py-1 leading-5 ${
    isDone ? "opacity-60" : ""
  } ${!isDone ? "bg-accent/10" : ""}`;

  return (
    <li className="group relative flex" role="listitem">
      <button
        type="button"
        onClick={() => openSubAgent(threadId, item.id)}
        className={`flex min-w-0 flex-1 text-left transition-[padding,background-color] duration-150 hover:bg-foreground/5 group-hover:pr-8 ${innerClass}`}
        aria-label={display.title}
        title={display.title}
      >
        {isDone ? (
          <Check aria-label="completed" className="size-3.5 shrink-0 text-foreground-muted" />
        ) : (
          <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
            <PixelLoader size="xxs" className="text-foreground" />
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate leading-5 ${isDone ? "text-foreground-muted" : "text-foreground"}`}
        >
          {display.title}
        </span>
        {isRunning && (
          <span className="shrink-0 tabular-nums text-foreground-muted opacity-80">
            {progress?.lastToolName || progress?.description ? (
              <span className="mr-1.5 max-w-[20ch] truncate inline-block align-bottom">
                {progress?.lastToolName ?? progress?.description}
              </span>
            ) : null}
            <span>
              {stepCount} step{stepCount === 1 ? "" : "s"}
            </span>
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={`Remove ${display.title} from panel`}
        title="Remove from panel"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(threadId, itemId);
        }}
        className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded p-0.5 text-muted/70 opacity-0 transition-opacity duration-150 hover:bg-danger-500/10 hover:text-danger-500 group-hover:opacity-100 focus:opacity-100"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}
