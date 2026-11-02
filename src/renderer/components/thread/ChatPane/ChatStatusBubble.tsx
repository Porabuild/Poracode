import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  floatingGlassBubbleClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";

/** The live thread-status pill portaled into the composer bubble row's leading slot. */
export function ChatStatusBubble({ slot, children }: { slot: HTMLElement; children: ReactNode }) {
  return createPortal(
    <div
      data-chat-status-bubble=""
      className={`${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} flex h-7 items-center whitespace-nowrap rounded-full px-3 text-xs font-medium text-muted [font-variant-numeric:tabular-nums]`}
    >
      {children}
    </div>,
    slot,
  );
}
