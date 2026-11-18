import type { ComponentProps } from "react";

const materials = {
  panel: "content-surface",
  row: "content-surface-row",
  group: "content-surface-group",
} as const;

type ContentSurfaceProps = ComponentProps<"div"> & {
  variant?: keyof typeof materials;
};

/** Flat, in-flow content. The caller owns layout, spacing and interaction. */
export function ContentSurface({ variant = "panel", className, ...props }: ContentSurfaceProps) {
  const material = materials[variant];
  return <div {...props} className={className ? `${material} ${className}` : material} />;
}
