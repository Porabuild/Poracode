import { Tooltip } from "@heroui/react";
import { useShallow } from "zustand/shallow";
import { useGitStore } from "../../state/gitStore";
import { readBridge } from "../../bridge";

const STATE_COLORS: Record<string, string> = {
  open: "bg-green-400",
  draft: "bg-gray-400",
  merged: "bg-purple-400",
  closed: "bg-red-400",
};

export function PrBadge(props: { worktreePath: string }) {
  const { number, state, url } = useGitStore(
    useShallow((s) => {
      const prData = s.prData[props.worktreePath];
      return {
        number: prData?.number,
        state: prData?.state,
        url: prData?.url,
      };
    }),
  );
  if (!number || !state || state === "closed") return null;

  const stateLabel = state === "draft" ? "Draft" : state === "merged" ? "Merged" : "Open";

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>
        <div
          role="button"
          tabIndex={0}
          aria-label={`PR #${number} ${stateLabel}`}
          className="shrink-0 cursor-default rounded px-1 py-0.5 transition-colors text-muted/60 hover:bg-white/[0.04] hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            if (url) void readBridge().openExternal(url);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              if (url) void readBridge().openExternal(url);
            }
          }}
        >
          <span className="flex items-center gap-1 text-[10px] font-medium">
            <span className={`size-1.5 rounded-full ${STATE_COLORS[state] ?? "bg-gray-400"}`} />
            <span className="text-muted/80">#{number}</span>
          </span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content>{`PR #${number} · ${stateLabel}`}</Tooltip.Content>
    </Tooltip>
  );
}
