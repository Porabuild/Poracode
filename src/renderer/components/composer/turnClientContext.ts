import { createContext, useContext } from "react";
import type { TurnClientContext } from "@/shared/contracts";

/**
 * Captures per-turn client context at the moment the user submits. Surfaces
 * that know something the agent should (the chat sidebar's active browser tab)
 * provide one; every other surface sends no context. Implementations must
 * settle promptly and never reject.
 */
export type TurnClientContextCapture = () => Promise<TurnClientContext | undefined>;

export const TurnClientContextSource = createContext<TurnClientContextCapture | undefined>(
  undefined,
);

export function useTurnClientContextCapture(): TurnClientContextCapture | undefined {
  return useContext(TurnClientContextSource);
}
