import { Info } from "lucide-react";
import { Tooltip } from "@heroui/react";

/**
 * Presentational switch used inside the add-menu rows. The desktop rows are a
 * multi-selection menu, so the accessible checked state comes from selection;
 * this visual is aria-hidden. In `readOnly` mode the track is muted so it
 * does not read as an interactive control.
 */
export function MenuSwitch(props: { checked: boolean; readOnly?: boolean }) {
  const { checked, readOnly = false } = props;
  return (
    <span
      aria-hidden
      className={`relative ms-auto h-4 w-7 shrink-0 rounded-full ${
        readOnly ? "" : "transition-colors"
      } ${
        checked
          ? readOnly
            ? "bg-success/45"
            : "bg-success"
          : readOnly
            ? "bg-surface-tertiary/70"
            : "bg-surface-tertiary"
      }`}
    >
      <span
        className={`absolute top-0.5 size-3 rounded-full bg-white ${
          readOnly ? "opacity-90" : "transition-transform"
        } ${checked ? "translate-x-3.5" : "translate-x-0.5"}`}
      />
    </span>
  );
}

/** Static row chrome for session-bound entries (no hover/press affordance). */
export const readOnlyRowClassName =
  "flex min-h-7 cursor-default items-center gap-2 rounded px-2 py-0.5 text-xs text-foreground";

/** Caption chrome under a desktop flyout list. */
export const submenuCaptionClassName =
  "border-t border-border px-3 py-1.5 text-[11px] leading-snug text-muted";

/**
 * Compact info affordance for a menu row: the explanation lives in a tooltip
 * so long descriptions do not stretch the menu. The press is swallowed so
 * hitting the icon does not toggle the surrounding row.
 */
export function InfoHint(props: { text: string }) {
  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger
        aria-label={props.text}
        className="shrink-0 cursor-help text-muted/70 hover:text-foreground"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
      >
        <Info className="size-3.5" aria-hidden />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-60">{props.text}</Tooltip.Content>
    </Tooltip>
  );
}
