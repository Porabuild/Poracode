import type { SVGProps } from "react";

/** WSL text icon for WSL projects. */
export function TuxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 16" fill="currentColor" {...props}>
      <text
        x="20"
        y="13"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        WSL
      </text>
    </svg>
  );
}
