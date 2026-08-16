import { formatBytes } from "@/shared/formatBytes";

export interface UpdateDownloadDisplay {
  /** True once electron-updater has reported a real byte total. */
  determinate: boolean;
  percent: number;
  byteLine: string | null;
}

/**
 * About / sidebar / recovery all render the same download telemetry.
 * Until the first `download-progress` event, the store is `{ percent: 0,
 * total: null }` — treat that as indeterminate so a stalled GitHub fetch
 * does not look like a confident 0%.
 */
export function updateDownloadDisplay(
  percent: number,
  transferred: number | null,
  total: number | null,
): UpdateDownloadDisplay {
  const determinate = total != null && total > 0;
  const rounded = Math.min(100, Math.max(0, Math.round(percent)));
  let byteLine: string | null = null;
  if (total != null && total > 0 && transferred != null) {
    byteLine = `${formatBytes(transferred)} / ${formatBytes(total)}`;
  } else if (transferred != null && transferred > 0) {
    byteLine = formatBytes(transferred);
  }
  return { determinate, percent: rounded, byteLine };
}
