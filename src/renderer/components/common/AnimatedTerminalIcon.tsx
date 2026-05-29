import type { SVGProps } from "react";

interface AnimatedTerminalIconProps extends SVGProps<SVGSVGElement> {
  isBusy?: boolean | undefined;
}

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
      <rect width="20" height="20" x="2" y="2" rx="2" />
      <path d="m7 8 3 3-3 3" />
      <path d="m12 14 h4" className={isBusy ? "anim-cursor-breath" : undefined} />
    </svg>
  );
}
