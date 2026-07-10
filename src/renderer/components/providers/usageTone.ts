import { usageTone } from "@lightcode/agents-usage/formatters";

/**
 * Map a utilization percentage to a theme color. The scale runs white → yellow
 * → red (low → high): green reads as "go" and is too invasive for an at-rest
 * meter, so low usage uses the neutral foreground tone instead.
 */
export function usageToneColor(usedPercent: number | undefined): string {
  switch (usageTone(usedPercent)) {
    case "danger":
      return "var(--danger)";
    case "warning":
      return "var(--warning)";
    case "normal":
      return "var(--foreground)";
    default:
      return "var(--muted)";
  }
}
