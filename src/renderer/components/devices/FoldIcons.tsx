import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Closed foldable phone: vertical cover screen with a left folded hinge spine. */
export function FoldClosedIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 5v14" />
      <rect x="8" y="3" width="10" height="18" rx="2" />
      <path d="M11.5 18h3" />
    </svg>
  );
}

/** Half-open foldable: two angled display halves meeting at the center hinge. */
export function FoldHalfOpenIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 6.2a1.5 1.5 0 0 1 1.15-1.46L12 3l7.85 1.74A1.5 1.5 0 0 1 21 6.2v11.6a1.5 1.5 0 0 1-1.15 1.46L12 21l-7.85-1.74A1.5 1.5 0 0 1 3 17.8Z" />
      <path d="M12 3v18" />
    </svg>
  );
}

/** Open foldable: wide unfolded dual display with subtle center hinge markers. */
export function FoldOpenIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M12 4.5v2" />
      <path d="M12 17.5v2" />
      <path d="M9.5 16.5h5" />
    </svg>
  );
}
