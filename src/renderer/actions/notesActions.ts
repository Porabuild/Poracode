import { useAppStore } from "@/renderer/state/appStore";
import type { ComposerSeedOptions } from "@/renderer/state/slices/draftSlice";
import { openNewThread } from "./threadActions";

/**
 * Start a new thread seeded with `text` (a to-do item or selected note text).
 * Opens a draft composer pre-filled with the text so the user can review/edit
 * the prompt and pick a model/mode before launching — it does not auto-send.
 */
export function newThreadFromText(
  projectId: string,
  text: string,
  options?: ComposerSeedOptions,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  useAppStore.getState().setComposerSeed(projectId, trimmed, options);
  openNewThread(projectId);
}
