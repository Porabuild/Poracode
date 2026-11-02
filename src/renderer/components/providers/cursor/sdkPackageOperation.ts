import { create } from "zustand";
import type { AgentStatus } from "@/shared/contracts";
import { agentEnvForStatus, agentEnvKey } from "@/shared/machines";

/**
 * One `@cursor/sdk` npm install serves every Cursor kind in an environment —
 * the main `cursor` kind and each `cursor:<profile>` kind — so an install or
 * update started on one settings surface is in flight for all of them. Keeping
 * the pending state in a shared store (keyed by environment) instead of inside
 * `SdkPackageRow` means it survives navigating between the main Cursor page
 * and profile pages: a remounted row still shows the spinner and blocks a
 * second launch while the slower kinds finish re-detecting.
 */
interface CursorSdkPackageOperationStore {
  pendingEnvKeys: ReadonlySet<string>;
  begin: (envKey: string) => void;
  end: (envKey: string) => void;
}

export const useCursorSdkPackageOperations = create<CursorSdkPackageOperationStore>((set) => ({
  pendingEnvKeys: new Set<string>(),
  begin: (envKey) =>
    set((state) => {
      if (state.pendingEnvKeys.has(envKey)) return state;
      const pendingEnvKeys = new Set(state.pendingEnvKeys);
      pendingEnvKeys.add(envKey);
      return { pendingEnvKeys };
    }),
  end: (envKey) =>
    set((state) => {
      if (!state.pendingEnvKeys.has(envKey)) return state;
      const pendingEnvKeys = new Set(state.pendingEnvKeys);
      pendingEnvKeys.delete(envKey);
      return { pendingEnvKeys };
    }),
}));

/** Environment bucket for the shared operation state; statuses without an env land in "native". */
export function cursorSdkPackageEnvKey(status: AgentStatus | undefined): string {
  return status ? agentEnvKey(agentEnvForStatus(status)) : agentEnvKey({ kind: "native" });
}
