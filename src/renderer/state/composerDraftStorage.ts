import { z } from "zod";
import { promptSegmentSchema } from "@/shared/contracts";
import { storableAttachment } from "@/renderer/components/composer/useAttachments";
import type { DraftContent } from "./slices/types";

// New client-local boundary. Earlier versions kept drafts only in memory;
// there is no legacy durable payload to migrate.
const PREFIX = "poracode-composer-draft-v1:";
const draftSchema = z.object({
  segments: z.array(promptSegmentSchema),
  attachments: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      name: z.string(),
      mimeType: z.string().optional(),
      isImage: z.boolean(),
      selector: z.string().optional(),
      sourceUrl: z.string().optional(),
    }),
  ),
});
type DraftKind = "project" | "thread";

/** Each composer has its own record: another window cannot overwrite unrelated drafts. */
export function createComposerDraftStorage(storage: Storage, lifecycle: Window) {
  const pending = new Map<string, DraftContent>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function key(kind: DraftKind, id: string) {
    // Remote projections already include the server identity in their IDs.
    return PREFIX + JSON.stringify([kind, id]);
  }

  function stopTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lifecycle.removeEventListener("pagehide", flush);
    lifecycle.document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  function flush() {
    stopTimer();
    for (const [name, content] of pending) {
      try {
        storage.setItem(name, JSON.stringify(content));
      } catch (error) {
        console.error("[poracode] failed to persist composer draft", error);
      }
    }
    pending.clear();
  }

  function onVisibilityChange() {
    if (lifecycle.document.visibilityState === "hidden") flush();
  }

  return {
    load(kind: DraftKind): Record<string, DraftContent> {
      const drafts: Record<string, DraftContent> = {};
      try {
        for (let index = 0; index < storage.length; index++) {
          const name = storage.key(index);
          if (!name?.startsWith(PREFIX)) continue;
          try {
            const identity: unknown = JSON.parse(name.slice(PREFIX.length));
            if (
              !Array.isArray(identity) ||
              identity.length !== 2 ||
              identity[0] !== kind ||
              typeof identity[1] !== "string"
            )
              continue;
            const parsed = draftSchema.safeParse(JSON.parse(storage.getItem(name) ?? "null"));
            if (parsed.success) {
              Object.defineProperty(drafts, identity[1], {
                value: parsed.data,
                enumerable: true,
                configurable: true,
                writable: true,
              });
            }
          } catch {
            // One interrupted or incompatible record must not hide other drafts.
          }
        }
      } catch (error) {
        console.error("[poracode] failed to load composer drafts", error);
      }
      return drafts;
    },
    save(kind: DraftKind, id: string, content: DraftContent) {
      pending.set(key(kind, id), {
        segments: content.segments,
        attachments: content.attachments.map(storableAttachment),
      });
      if (timer !== undefined) return;
      // Bound the amount of uncheckpointed typing without serializing on each keypress.
      timer = setTimeout(flush, 250);
      lifecycle.addEventListener("pagehide", flush);
      lifecycle.document.addEventListener("visibilitychange", onVisibilityChange);
    },
    remove(kind: DraftKind, id: string) {
      const name = key(kind, id);
      pending.delete(name);
      if (pending.size === 0) stopTimer();
      try {
        storage.removeItem(name);
      } catch (error) {
        console.error("[poracode] failed to remove composer draft", error);
      }
    },
    flush,
  };
}

let instance: ReturnType<typeof createComposerDraftStorage> | undefined;
export function composerDraftStorage() {
  if (typeof window === "undefined") return undefined;
  return (instance ??= createComposerDraftStorage(localStorage, window));
}
