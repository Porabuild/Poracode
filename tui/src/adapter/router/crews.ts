import { canLeadCrew, savedCrewSchema, type SavedCrew } from "@/shared/crew";
import type { AgentStatus } from "@/shared/contracts";

export const CREW_PROVIDER_ID = "poracode";

export function usableCrews(
  crews: unknown,
  statuses: readonly AgentStatus[],
  isUsable: (status: AgentStatus) => boolean,
): SavedCrew[] {
  if (!Array.isArray(crews)) return [];
  return crews.flatMap((value) => {
    const parsed = savedCrewSchema.safeParse(value);
    if (!parsed.success) return [];
    const lead = statuses.find((status) => status.kind === parsed.data.lead.agentKind);
    if (!lead || !isUsable(lead) || !canLeadCrew(lead.capabilities, "gui")) return [];
    return [parsed.data];
  });
}
