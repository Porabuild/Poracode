import type { MessageItemPayload, ModelSwitchItemPayload } from "./contracts";

/** Structural item shape shared by renderer store rows and persisted items. */
export interface TurnModelItem {
  type: string;
  payload?: unknown;
}

/**
 * The model that answered the latest turn in `items`, for the current
 * provider era: the latest `model_switch` divider's target, else the model
 * recorded on the latest user message. Returns `undefined` when neither is
 * recorded (a transcript that predates per-turn model recording, or no turn
 * since the last provider handoff — models before a handoff belong to a
 * different provider and are not comparable).
 */
export function lastTurnModelFromItems(items: readonly TurnModelItem[]): string | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    if (item.type === "provider_handoff") return undefined;
    if (item.type === "model_switch") {
      const toModel = (item.payload as ModelSwitchItemPayload | undefined)?.toModel;
      if (toModel) return toModel;
    }
    if (item.type === "user_message") {
      const model = (item.payload as MessageItemPayload | undefined)?.model;
      if (model) return model;
    }
  }
  return undefined;
}
