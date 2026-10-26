import type { PrLabel } from "@/shared/contracts";

/**
 * A host label. The host's color tints the chip so it stays legible on both
 * themes; labels without a color use the neutral chip.
 */
export function PrLabelChip(props: { label: PrLabel; size?: "xs" | "sm" }) {
  const color = props.label.color ? `#${props.label.color}` : undefined;
  return (
    <span
      title={props.label.description ?? props.label.name}
      className={`inline-flex min-w-0 max-w-40 shrink items-center gap-1 rounded-full border px-1.5 font-medium ${
        props.size === "xs" ? "h-4 text-[10px]" : "h-5 text-[11px]"
      } ${color ? "text-foreground" : "border-[var(--hairline)] bg-default-100 text-muted"}`}
      style={
        color
          ? {
              borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
              backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
            }
          : undefined
      }
    >
      {color ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span className="truncate">{props.label.name}</span>
    </span>
  );
}
