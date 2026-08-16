import { createContext, useContext, useId, type ReactNode } from "react";

const MobilePageActionScopeContext = createContext("unscoped");

/** Gives each PageLayout instance isolated destinations for its portaled mobile controls. */
export function MobilePageActionScope(props: { children: ReactNode }) {
  const scope = useId();
  return (
    <MobilePageActionScopeContext.Provider value={scope}>
      {props.children}
    </MobilePageActionScopeContext.Provider>
  );
}

export function useMobilePageActionScope(): string {
  return useContext(MobilePageActionScopeContext);
}
