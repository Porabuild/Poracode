import type { ThreadConfig } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { isRemoteCommandOutcomeUncertainError } from "./threadCommandOutcomeActions";

/** One captured config lifecycle for sends, launches and command-palette input. */
export async function withThreadConfigSubmission<T>(
  threadId: string,
  config: ThreadConfig,
  dispatch: () => Promise<T>,
  /** A retained uncertain operation needs its own authoritative failure evidence. */
  isDefiniteFailure: (error: unknown) => boolean = (error) =>
    !isRemoteCommandOutcomeUncertainError(error),
): Promise<T> {
  const store = useAppStore.getState();
  const submission = store.markThreadConfigSubmitted(threadId, config);
  let restore = false;
  try {
    return await dispatch();
  } catch (error) {
    restore = isDefiniteFailure(error);
    throw error;
  } finally {
    store.finishThreadConfigSubmission(threadId, submission, restore);
  }
}
