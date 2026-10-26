import { createContext, useContext, type RefObject } from "react";

/**
 * How the open tab lays out. In the compact layout the whole detail is one scroll
 * container, so a tab flows in it (no scroller of its own) and a card measures its
 * viewport against `scrollRoot`. Everywhere else a tab fills its pane and scrolls itself.
 */
export interface PrFlow {
  flow: boolean;
  scrollRoot: RefObject<HTMLElement | null>;
}

const NO_ROOT: RefObject<HTMLElement | null> = { current: null };
const PrFlowContext = createContext<PrFlow>({ flow: false, scrollRoot: NO_ROOT });

export const PrFlowProvider = PrFlowContext.Provider;

export function usePrFlow(): PrFlow {
  return useContext(PrFlowContext);
}
