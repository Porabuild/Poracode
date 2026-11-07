import { createContext, useContext } from "react";
import type { TurnClientContext } from "@/shared/contracts";

/**
 * Captures per-turn client context at the moment the user submits. Surfaces
 * that know something the agent should (the chat sidebar's active browser tab)
 * provide one; every other surface sends no context. Implementations must
 * settle promptly. Required context may reject to cancel the send and retain
 * the user's draft; advisory context should resolve undefined on failure.
 */
export type TurnClientContextCapture = () => Promise<TurnClientContext | undefined>;

export const TurnClientContextSource = createContext<TurnClientContextCapture | undefined>(
  undefined,
);

export function useTurnClientContextCapture(): TurnClientContextCapture | undefined {
  return useContext(TurnClientContextSource);
}

/** Observe rejection immediately while independent draft persistence is pending. */
export async function captureTurnClientContext(
  capture?: TurnClientContextCapture,
): Promise<{ context: TurnClientContext | undefined } | { error: unknown }> {
  try {
    return { context: await capture?.() };
  } catch (error) {
    return { error };
  }
}
