import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  canLeadCrew,
  crewBindingFromSavedCrew,
  type CrewMemberSelection,
  type SavedCrew,
  type ThreadCrewBinding,
} from "@/shared/crew";
import type { ThreadPresentationMode } from "@/shared/contracts";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import { isLeadEdited } from "./crewComposerModel";

/** What became of applying a saved crew: its lead landed, the pick path refused it, or the lead is not offered. */
export type SavedCrewLeadResult = "applied" | "refused" | "unavailable";

/** The draft's provider/model pick path, shared by the picker and the roster's lead row. Returns whether the draft was committed. */
export type CrewLeadPick = (
  next: { agentKind: string; model: string; presentationMode?: ThreadPresentationMode },
  overrides?: {
    crew?: ThreadCrewBinding | null;
    effort?: string;
    fast?: boolean;
    contextSize?: string;
    /** An automatic restore, not a user edit: a refused family edit stays silent. */
    suppressFailureToast?: boolean;
  },
) => boolean;

export interface SavedCrewLeadInput {
  /** The saved crew the draft is bound to; absent for an unsaved or deleted crew. */
  activeSavedCrew: SavedCrew | undefined;
  lead: CrewMemberSelection | undefined;
  leadProviders: ProviderModelMenuProvider[];
  presentationMode: ThreadPresentationMode;
  /** False until the remembered draft config, settings and the provider catalog have landed and the lead can head a crew. */
  canFollow: boolean;
  /** The draft's "edited here" latch. A restore is not an edit, so it is cleared again. */
  hasLocalEditRef: RefObject<boolean>;
  /** Set once the draft was put on its saved crew's lead; the remembered-config restores keep off it. */
  restoredRef: RefObject<boolean>;
  pickRef: RefObject<CrewLeadPick>;
}

/**
 * Keeps a new draft on its saved crew's lead. The roster is refreshed when the
 * draft is restored (draftCrewFromConfig); the lead follows here until the
 * first local edit, so a lead change made for one thread never carries into
 * the next draft. An unavailable lead, a late catalog or a late settings
 * hydration simply re-evaluate on the next render.
 */
export function useSavedCrewLead(
  input: SavedCrewLeadInput,
): (saved: SavedCrew) => SavedCrewLeadResult {
  const {
    activeSavedCrew,
    lead,
    leadProviders,
    presentationMode,
    canFollow,
    hasLocalEditRef,
    restoredRef,
    pickRef,
  } = input;
  const applied = useRef<{ crew: SavedCrew; presentationMode: ThreadPresentationMode } | undefined>(
    undefined,
  );

  // Applies a saved crew to the draft as it was saved: its roster and its own
  // lead. "unavailable" means the saved lead is not offered; "refused" means
  // the pick path did not commit it.
  function applySavedCrew(saved: SavedCrew, restore = false): SavedCrewLeadResult {
    const binding = crewBindingFromSavedCrew(saved);
    const target = leadProviders.find((provider) => provider.kind === saved.lead.agentKind);
    const targetModel = target?.capabilities.models.find(
      (candidate) => candidate.id === saved.lead.model,
    );
    if (!target || !targetModel || !canLeadCrew(target.capabilities, presentationMode)) {
      return "unavailable";
    }
    const committed = pickRef.current(
      { agentKind: saved.lead.agentKind, model: saved.lead.model, presentationMode },
      {
        crew: binding,
        effort: saved.lead.effort ?? "",
        fast: saved.lead.fast ?? false,
        ...(saved.lead.contextSize ? { contextSize: saved.lead.contextSize } : {}),
        ...(restore ? { suppressFailureToast: true } : {}),
      },
    );
    if (restore) {
      // The pick path latches a local edit before it resolves. A restore is not
      // one, so the latch clears again, and only a lead that actually landed
      // keeps the remembered-config restores off.
      hasLocalEditRef.current = false;
      if (committed) restoredRef.current = true;
    }
    return committed ? "applied" : "refused";
  }
  const applySavedCrewRef = useRef(applySavedCrew);
  useEffect(() => {
    applySavedCrewRef.current = applySavedCrew;
  });

  useEffect(() => {
    if (!activeSavedCrew || !lead || !canFollow || hasLocalEditRef.current) return;
    const previous = applied.current;
    if (
      previous &&
      previous.crew === activeSavedCrew &&
      previous.presentationMode === presentationMode
    ) {
      return;
    }
    if (!isLeadEdited(lead, activeSavedCrew)) return;
    // One attempt per saved-crew version and surface: a lead the pick path
    // refuses, or a saved carrier the model cannot hold, stays a visible
    // difference instead of a retry on every render.
    if (applySavedCrewRef.current(activeSavedCrew, true) !== "unavailable") {
      applied.current = { crew: activeSavedCrew, presentationMode };
    }
  }, [activeSavedCrew, canFollow, hasLocalEditRef, lead, presentationMode]);

  return applySavedCrew;
}
