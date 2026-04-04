import { Tooltip } from "@heroui/react";
import { useGitStore } from "../../state/gitStore";
import { readBridge } from "../../bridge";

const STATE_COLORS: Record<string, string> = {
  open: "bg-green-400",
  draft: "bg-gray-400",
  merged: "bg-purple-400",
  closed: "bg-red-400",
};

export function PrBadge(props: { worktreePath: string }) {
  const prData = useGitStore((s) => s.prData[props.worktreePath]);
  if (!prData || prData.state === "closed") return null;

  const stateLabel = prData.state === "draft" ? "Draft" : prData.state === "merged" ? "Merged" : "Open";

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>
      <div
        role="button"
        tabIndex={0}
        aria-label={`PR #${prData.number} ${stateLabel}`}
        className="shrink-0 cursor-default rounded px-1 py-0.5 transition-colors text-muted/60 hover:bg-white/[0.04] hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          if (prData.url) void readBridge().openExternal(prData.url);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            if (prData.url) void readBridge().openExternal(prData.url);
          }
        }}
      >
        <span className="flex items-center gap-1 text-[10px] font-medium">
          <span className={`size-1.5 rounded-full ${STATE_COLORS[prData.state] ?? "bg-gray-400"}`} />
          <span className="text-muted/80">#{prData.number}</span>
        </span>
      </div>
      </Tooltip.Trigger>
      <Tooltip.Content>{`PR #${prData.number} · ${stateLabel}`}</Tooltip.Content>
    </Tooltip>
  );
}
