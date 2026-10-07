import { createContext, useContext } from "react";
import type { BuiltInMcpServerId } from "@/shared/contracts";

/**
 * Tools inherent to a client surface. Drafts enable them without writing a
 * standing desktop preference; composers omit their plugin controls. Host
 * restrictions and provider availability remain authoritative.
 */
export const ImplicitMcpServersContext = createContext<readonly BuiltInMcpServerId[]>([]);

export function useImplicitMcpServers(): readonly BuiltInMcpServerId[] {
  return useContext(ImplicitMcpServersContext);
}
