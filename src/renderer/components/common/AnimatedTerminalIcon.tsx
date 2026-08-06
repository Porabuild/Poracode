import type { SVGProps } from "react";

interface AnimatedTerminalIconProps extends SVGProps<SVGSVGElement> {
  isBusy?: boolean | undefined;
}

/**
 * Lucide's `square-terminal`, hand-inlined only so the cursor stroke can breathe
 * while the terminal is busy — `<SquareTerminal />` offers no handle on an
 * individual path.
 *
 * Keep the geometry byte-identical to upstream. It is tempting to shift these
 * coordinates onto the odd values that let a 1px stroke snap to a single pixel
 * column at small sizes, but this icon always sits beside stock lucide icons
 * (folder, archive, trash) that cannot be snapped the same way — and one crisp
 * glyph among softly-antialiased neighbours reads far worse than a uniformly
 * soft set. Sharpness at small sizes is a whole-icon-set decision, not one this
 * component should make alone.
 */
export function AnimatedTerminalIcon({ isBusy, className, ...props }: AnimatedTerminalIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {isBusy && (
        <style>{`
          @keyframes terminal-cursor-breath {
            0%, 100% { opacity: 0.15; }
            50% { opacity: 1; }
          }
          .anim-cursor-breath {
            animation: terminal-cursor-breath 1s infinite ease-in-out;
          }
        `}</style>
      )}
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" className={isBusy ? "anim-cursor-breath" : undefined} />
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    </svg>
  );
}
