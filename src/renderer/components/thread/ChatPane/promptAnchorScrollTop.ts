import { useAppStore } from "@/renderer/state/appStore";

/**
 * Scroll offset at which the thread's anchored prompt sits flush with the top
 * of the transcript, or null when no prompt is anchored or its row is not
 * rendered. Read on scroll and resize, so it reads the store without
 * subscribing.
 */
export function promptAnchorScrollTop(scrollElement: HTMLElement, threadId: string): number | null {
  const anchorId = useAppStore.getState().chatPromptAnchorIds[threadId];
  if (!anchorId) return null;
  for (const row of scrollElement.querySelectorAll<HTMLElement>("[data-chat-virtual-row]")) {
    if (row.dataset.itemId !== anchorId) continue;
    return (
      scrollElement.scrollTop +
      row.getBoundingClientRect().top -
      scrollElement.getBoundingClientRect().top
    );
  }
  return null;
}
