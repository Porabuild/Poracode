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
import { pickCheaperHelperModel } from "@/shared/modelTier";
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
  /** Context lengths the model offers; empty unless there is a choice (2+). */
  readonly contextSizes: readonly { readonly id: string; readonly label: string }[];
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
        contextSizes: modelContextSizes(status, option.id),
      }));
    });
}

function modelContextSizes(
  status: AgentStatus,
  model: string,
): { readonly id: string; readonly label: string }[] {
  const ids = status.capabilities.modelContextSizes?.[model] ?? [];
  const sizes = (status.capabilities.contextSizes ?? []).filter((size) => ids.includes(size.id));
  return sizes.length > 1 ? sizes : [];
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

/** The cheapest available model that is not the lead's own, preferring the lead's provider. */
export function defaultHelperSelection(
  choices: readonly CrewModelChoice[],
  lead: Pick<CrewMemberSelection, "agentKind" | "model">,
): CrewMemberSelection | undefined {
  const choice = pickCheaperHelperModel(choices, lead);
  return choice ? { agentKind: choice.agentKind, model: choice.model } : undefined;
}

export const SIDEKICK_ROLE = {
  id: "sidekick",
  label: "Sidekick",
  brief:
    "Explores the codebase, implements the lead's task end to end, runs the narrowest checks, and reports what changed with evidence.",
} as const;

export function newCrewBinding(helper: CrewMemberSelection): ThreadCrewBinding {
  return {
    version: CREW_BINDING_VERSION,
    policy: "crew-only",
    roles: [{ ...SIDEKICK_ROLE, selection: helper }],
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
    const helper = defaultHelperSelection(input.helperChoices, sessionLead);
    if (!helper) return { error: "No helper models are available for a crew." };
    return { binding: newCrewBinding(helper), lead: sessionLead };
  }
  const crew = input.saved.find((candidate) => candidate.id === pickedModel);
  if (!crew) return { error: "That crew is no longer available." };
  return { binding: crewBindingFromSavedCrew(crew), lead: crew.lead };
}
