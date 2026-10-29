import { useShallow } from "zustand/shallow";
import { threadCrewBinding, type ThreadConfigCrew } from "@/shared/crew";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { crewModelLabelOf } from "./crewComposerModel";
import type { CrewMentionItem } from "@/renderer/components/composer/MentionInput";

const EMPTY_CREW_MENTIONS: readonly CrewMentionItem[] = [];

/**
 * Roles of the config's active crew as "@"-mention items (label + model label
 * detail). Empty without a usable binding, so the popover shows no Crew section.
 */
export function useCrewMentionItems(
  config: { crew?: ThreadConfigCrew | null | undefined } | undefined,
): readonly CrewMentionItem[] {
  const statuses = useAgentStatusesStore(
    useShallow((state) => [...state.agentStatuses, ...state.wslAgentStatuses]),
  );
  const binding = threadCrewBinding(config);
  if (!binding) return EMPTY_CREW_MENTIONS;
  return binding.roles.map((role) => ({
    label: role.label,
    detail: crewModelLabelOf(statuses, role.selection),
  }));
}
