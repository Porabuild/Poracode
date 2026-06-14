import { create } from "zustand";
import { LC_SELECTOR_LANG } from "@/renderer/components/thread/ChatPane/parts/items/SelectorBadge";

export interface BrowserAttachItem {
  id: string;
  threadId: string;
  attachmentPath: string;
  attachmentName: string;
  mimeType: string;
  selector: string;
  sourceUrl: string;
  createdAt: number;
}

interface BrowserAttachInboxState {
  itemsByThread: Record<string, BrowserAttachItem[]>;
  enqueue(item: Omit<BrowserAttachItem, "id" | "createdAt">): void;
  drain(threadId: string): BrowserAttachItem[];
}

const MAX_QUEUED_ATTACHMENTS_PER_THREAD = 50;

export const useBrowserAttachInbox = create<BrowserAttachInboxState>((set, get) => ({
  itemsByThread: {},
  enqueue: (item) => {
    const id = crypto.randomUUID();
    const next: BrowserAttachItem = { ...item, id, createdAt: Date.now() };
    set((state) => {
      const list = state.itemsByThread[item.threadId] ?? [];
      const merged = [...list, next];
      const capped =
        merged.length > MAX_QUEUED_ATTACHMENTS_PER_THREAD
          ? merged.slice(merged.length - MAX_QUEUED_ATTACHMENTS_PER_THREAD)
          : merged;
      return {
        itemsByThread: { ...state.itemsByThread, [item.threadId]: capped },
      };
    });
  },
  drain: (threadId) => {
    const items = get().itemsByThread[threadId];
    if (!items || items.length === 0) return [];
    set((state) => {
      const next = { ...state.itemsByThread };
      delete next[threadId];
      return { itemsByThread: next };
    });
    return items;
  },
}));

export function buildLcSelectorFence(item: {
  selector: string;
  sourceUrl: string;
  attachmentName: string;
}): string {
  const payload = JSON.stringify({
    selector: item.selector,
    url: item.sourceUrl,
    name: item.attachmentName,
  });
  return `\n\n\`\`\`${LC_SELECTOR_LANG}\n${payload}\n\`\`\`\n`;
}

/**
 * Plain-text equivalent of {@link buildLcSelectorFence} for terminal-native
 * (CLI) threads. The `lc-selector` fence is parsed only by the GUI chat
 * `SelectorBadge` renderer; a CLI agent reading raw terminal text needs a human
 * sentence instead. Callers add their own surrounding whitespace (the composer
 * separates it from the typed message; the terminal-insert path collapses it).
 */
export function buildSelectorPlainText(item: { selector: string; sourceUrl: string }): string {
  return `Selected element \`${item.selector}\` from ${item.sourceUrl}`;
}
