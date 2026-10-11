import { formatBytes } from "@/shared/formatBytes";

export function MediaDetails(props: {
  sizeBytes?: number;
  width?: number;
  height?: number;
  duration?: number;
}) {
  const seconds =
    props.duration !== undefined && Number.isFinite(props.duration)
      ? Math.floor(props.duration)
      : null;
  const details = [
    props.width && props.height ? `${props.width} × ${props.height}` : null,
    props.sizeBytes !== undefined ? formatBytes(props.sizeBytes) : null,
    seconds !== null
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
      : null,
  ].filter((detail) => detail !== null);
  return details.length ? (
    <div
      className="shrink-0 border-t border-[color:var(--border)] px-3 py-1 text-xs text-muted tabular-nums"
      data-testid="media-details"
    >
      {details.join(" · ")}
    </div>
  ) : null;
}
