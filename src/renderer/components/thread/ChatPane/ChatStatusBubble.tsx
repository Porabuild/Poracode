import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { floatingBubblePillClass } from "@/renderer/components/layout/floatingGlass";

/** The live thread-status pill portaled into the composer bubble row's leading slot. */
export function ChatStatusBubble({ slot, children }: { slot: HTMLElement; children: ReactNode }) {
  return createPortal(
    <div
      data-chat-status-bubble=""
      className={`${floatingBubblePillClass} whitespace-nowrap px-3 text-muted [font-variant-numeric:tabular-nums]`}
    >
      {children}
    </div>,
    slot,
  );
}
