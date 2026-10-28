import type { SVGProps } from "react";

export function PoracodeGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="300 290 460 460" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M352,300 H556 A152,152 0 0 1 556,604 H472 V730 H352 Z M472,392 H548 A60,60 0 0 1 548,512 H472 Z"
      />
      <circle cx="636" cy="694" r="46" fill="var(--accent)" />
    </svg>
  );
}
