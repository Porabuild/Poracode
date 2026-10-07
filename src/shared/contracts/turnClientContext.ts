import { z } from "zod";

/** Bounds for client-captured page metadata; clients truncate before sending. */
export const TURN_CLIENT_CONTEXT_TITLE_MAX_LENGTH = 300;
export const TURN_CLIENT_CONTEXT_URL_MAX_LENGTH = 2048;

/** The tab that was active in the user's own browser window at submit time. */
export const turnClientBrowserTabSchema = z.object({
  tabId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  title: z.string().max(TURN_CLIENT_CONTEXT_TITLE_MAX_LENGTH).optional(),
  url: z.string().max(TURN_CLIENT_CONTEXT_URL_MAX_LENGTH).optional(),
});
export type TurnClientBrowserTab = z.infer<typeof turnClientBrowserTabSchema>;

/**
 * Optional, per-turn context a client surface captured when the user
 * submitted this message. It is advisory, untrusted metadata: the supervisor
 * renders it for the provider only (never into the painted user message, the
 * thread title or persisted state) and applies it to exactly the turn it was
 * submitted with — a queued or staged turn keeps its own snapshot.
 *
 * Additive on every input payload. A host that predates it strips the unknown
 * key and the turn simply runs without context; nothing reports delivery, so
 * no capability gate is required (see `.agents/docs/versioning.md`).
 */
export const turnClientContextSchema = z.object({
  /**
   * The user is working in a web browser, so the browser — not the desktop
   * app — is their primary focus. `activeTab` is absent when the client could
   * not read its window's active tab in time.
   */
  browserFocus: z
    .object({
      activeTab: turnClientBrowserTabSchema.optional(),
    })
    .optional(),
});
export type TurnClientContext = z.infer<typeof turnClientContextSchema>;
