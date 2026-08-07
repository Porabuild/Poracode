import { Tooltip } from "@heroui/react";
import { Download, RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { readBridge } from "@/renderer/bridge";
import { formatBytes } from "@/shared/formatBytes";
import { useUpdateStore } from "@/renderer/state/updateStore";

/**
 * Whether `UpdateButtons` renders anything. The collapsed footer nav reads
 * this to keep its overflow math in sync with the component's own rule.
 */
export function useUpdateEntryVisible(): boolean {
  return useUpdateStore((s) => s.phase === "downloading" || s.phase === "downloaded");
}

export function UpdateButtons(props: {
  iconOnly?: boolean;
  /** Icon-only tooltip placement; bottom icon rows pass "top". */
  tooltipPlacement?: "right" | "top";
}) {
  const { iconOnly = false, tooltipPlacement = "right" } = props;
  const { t } = useLingui();
  const updatePhase = useUpdateStore((s) => s.phase);
  const updateVersion = useUpdateStore((s) => s.version);
  const downloadPercent = useUpdateStore((s) => s.downloadPercent);
  const transferred = useUpdateStore((s) => s.downloadTransferred);
  const total = useUpdateStore((s) => s.downloadTotal);

  if (updatePhase !== "downloading" && updatePhase !== "downloaded") {
    return null;
  }

  if (updatePhase === "downloading") {
    const percent = Math.min(100, Math.max(0, Math.round(downloadPercent)));
    const byteLine =
      transferred != null && total != null && total > 0
        ? `${formatBytes(transferred)} / ${formatBytes(total)}`
        : null;

    if (iconOnly) {
      return (
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Download className="size-4 animate-pulse text-muted" />
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content placement={tooltipPlacement} className="pointer-events-none">
            <Trans>Downloading update</Trans> — {percent}%{byteLine ? ` · ${byteLine}` : ""}
          </Tooltip.Content>
        </Tooltip>
      );
    }

    // Compact, fixed-height status: one line (bytes + percent) over a thin bar.
    // The long target version is omitted — it overflowed/clipped and the About
    // page already surfaces it. `tabular-nums` keeps the digits from reflowing.
    return (
      <div className="flex w-full items-center gap-2 rounded-3xl px-2 py-1.5 text-muted">
        <Download className="size-4 shrink-0 animate-pulse text-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center justify-between gap-2 text-xs tabular-nums">
            <span className="truncate">{byteLine ?? <Trans>Downloading update</Trans>}</span>
            <AnimatedNumber className="shrink-0" value={percent} suffix="%" />
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--row-active)]">
            <div
              className="h-1 rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarButton
      iconOnly={iconOnly}
      icon={<RefreshCw className="size-4" />}
      label={updateVersion ? t`Install v${updateVersion}` : t`Install update`}
      tooltipPlacement={tooltipPlacement}
      onPress={() => void readBridge().installUpdate()}
    />
  );
}
