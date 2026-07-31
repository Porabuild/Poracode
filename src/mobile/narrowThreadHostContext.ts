import { createContext, useContext } from "react";

const NarrowThreadHostContext = createContext(false);

export const NarrowThreadHostProvider = NarrowThreadHostContext.Provider;

/** True when NarrowShell owns the persistent thread layer for this route. */
export function useNarrowThreadHost(): boolean {
  return useContext(NarrowThreadHostContext);
}
