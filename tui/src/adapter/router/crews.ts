import {
  CREW_BINDING_VERSION,
  canLeadCrew,
  crewBindingFromSavedCrew,
  savedCrewSchema,
  type CrewMemberSelection,
  type SavedCrew,
  type ThreadCrewBinding,
} from "@/shared/crew";
import type { AgentStatus } from "@/shared/contracts";
import { guiModelEfforts, guiModels } from "./helpers";

export const CREW_PROVIDER_ID = "poracode";
export const NEW_CREW_MODEL_ID = "new-crew";

export type CrewModelChoice = {
  readonly agentKind: string;
  readonly providerLabel: string;
  readonly model: string;
  readonly label: string;
  readonly efforts: readonly string[];
  readonly supportsFast: boolean;
};

export type CrewPick = { readonly binding: ThreadCrewBinding; readonly lead: CrewMemberSelection };

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

export function crewModelChoices(
  statuses: readonly AgentStatus[],
  isUsable: (status: AgentStatus) => boolean,
  options: { readonly leadsOnly?: boolean } = {},
): CrewModelChoice[] {
  return statuses
    .filter((status) => isUsable(status))
    .filter((status) => !options.leadsOnly || canLeadCrew(status.capabilities, "gui"))
    .flatMap((status) => {
      const fastModels =
        status.capabilities.presentationCapabilities?.gui?.fastModels ??
        status.capabilities.fastModels ??
        [];
      return guiModels(status).map((option) => ({
        agentKind: status.kind,
        providerLabel: status.label,
        model: option.id,
        label: option.label,
        efforts: guiModelEfforts(status, option.id),
        supportsFast: fastModels.includes(option.id),
      }));
    });
}

export function crewModelLabel(
  choices: readonly CrewModelChoice[],
  selection: CrewMemberSelection,
): string {
  return (
    choices.find(
      (choice) => choice.agentKind === selection.agentKind && choice.model === selection.model,
    )?.label ?? selection.model
  );
}

export function defaultHelperSelection(
  choices: readonly CrewModelChoice[],
  leadKind: string,
): CrewMemberSelection | undefined {
  const choice = choices.find((value) => value.agentKind !== leadKind) ?? choices[0];
  return choice ? { agentKind: choice.agentKind, model: choice.model } : undefined;
}

export function newCrewBinding(helper: CrewMemberSelection): ThreadCrewBinding {
  return {
    version: CREW_BINDING_VERSION,
    policy: "crew-only",
    roles: [
      {
        id: "builder",
        label: "Builder",
        brief: "Implements changes and runs tests",
        selection: helper,
      },
    ],
  };
}

export function resolveCrewPick(input: {
  readonly pickedModel: string;
  readonly sessionCrew: ThreadCrewBinding | null | undefined;
  readonly sessionLead: CrewMemberSelection | undefined;
  readonly saved: readonly SavedCrew[];
  readonly leadChoices: readonly CrewModelChoice[];
  readonly helperChoices: readonly CrewModelChoice[];
}): CrewPick | { readonly error: string } {
  const { pickedModel, sessionCrew, sessionLead } = input;
  const keepsSession =
    sessionCrew &&
    sessionLead &&
    (pickedModel === NEW_CREW_MODEL_ID || sessionCrew.crewId === pickedModel);
  if (keepsSession) return { binding: sessionCrew, lead: sessionLead };
  if (pickedModel === NEW_CREW_MODEL_ID) {
    if (
      !sessionLead ||
      !input.leadChoices.some(
        (choice) =>
          choice.agentKind === sessionLead.agentKind && choice.model === sessionLead.model,
      )
    )
      return { error: "Pick a model that can lead a crew first, then choose New crew." };
    const helper = defaultHelperSelection(input.helperChoices, sessionLead.agentKind);
    if (!helper) return { error: "No helper models are available for a crew." };
    return { binding: newCrewBinding(helper), lead: sessionLead };
  }
  const crew = input.saved.find((candidate) => candidate.id === pickedModel);
  if (!crew) return { error: "That crew is no longer available." };
  return { binding: crewBindingFromSavedCrew(crew), lead: crew.lead };
}
