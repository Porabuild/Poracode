import { Tooltip } from "@heroui/react";
import { Download, RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { readBridge } from "@/renderer/bridge";
import { updateDownloadDisplay } from "@/renderer/state/updateDownloadDisplay";
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
    const { determinate, percent, byteLine } = updateDownloadDisplay(
      downloadPercent,
      transferred,
      total,
    );

    const statusDetail = (
      <>
        <Trans>Downloading update</Trans>
        {determinate ? ` — ${percent}%` : ""}
        {byteLine ? ` · ${byteLine}` : ""}
      </>
    );

    if (iconOnly) {
      return (
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Download className="size-4 animate-pulse text-muted" />
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content placement={tooltipPlacement} className="pointer-events-none">
            {statusDetail}
          </Tooltip.Content>
        </Tooltip>
      );
    }

    // Compact, fixed-height status: a single line (icon + thin bar + percent)
    // on the same box as a SidebarButton row, so the swap to the install button
    // doesn't shift the footer. Byte telemetry lives in the hover tooltip and
    // aria-valuetext. `tabular-nums` keeps the digits from reflowing.
    return (
      <Tooltip delay={150}>
        <Tooltip.Trigger className="flex w-full min-h-0 flex-col" tabIndex={-1} role="none">
          <div
            role="progressbar"
            aria-label={t`Downloading update`}
            aria-valuemin={0}
            aria-valuemax={100}
            {...(determinate ? { "aria-valuenow": percent } : {})}
            {...(byteLine
              ? { "aria-valuetext": determinate ? `${percent}% · ${byteLine}` : byteLine }
              : {})}
            className="flex w-full shrink-0 items-center gap-2 rounded-3xl px-2 py-1.5 text-sm text-muted"
          >
            <Download className="size-4 shrink-0" />
            <div className="flex h-5 min-w-0 flex-1 items-center gap-2 tabular-nums">
              <div className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-[var(--row-active)]">
                <div
                  className={`h-1 rounded-full bg-foreground ${
                    determinate ? "transition-[width] duration-300" : "w-1/2 animate-pulse"
                  }`}
                  style={determinate ? { width: `${percent}%` } : undefined}
                />
              </div>
              {determinate ? (
                <AnimatedNumber className="w-9 shrink-0 text-right" value={percent} suffix="%" />
              ) : null}
            </div>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right" showArrow className="max-w-[28rem] text-xs">
          {statusDetail}
        </Tooltip.Content>
      </Tooltip>
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
