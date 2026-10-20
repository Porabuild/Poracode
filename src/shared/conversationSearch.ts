import { z } from "zod";

// Additive read capability: old hosts omit it and clients do not issue searches.
// cs1 cursors and this version cover query semantics, excerpts and item identity.
export const CONVERSATION_SEARCH_VERSION = 1 as const;
export const CONVERSATION_SEARCH_LIMIT = 50;
export const CONVERSATION_SEARCH_EXCERPT_CHARS = 320;

export const conversationSearchQuerySchema = z.object({
  version: z.literal("1"),
  query: z.string().trim().min(1).max(500),
  projectId: z.string().min(1).max(200).optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(CONVERSATION_SEARCH_LIMIT).optional(),
});
export type ConversationSearchQuery = z.infer<typeof conversationSearchQuerySchema>;

export const conversationSearchEntrySchema = z.object({
  threadId: z.string().min(1),
  itemId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().max(300),
  projectName: z.string().max(200),
  archived: z.boolean(),
  role: z.enum(["user", "assistant"]),
  excerpt: z.string().max(CONVERSATION_SEARCH_EXCERPT_CHARS),
});
export type ConversationSearchEntry = z.infer<typeof conversationSearchEntrySchema>;

export const conversationSearchPageSchema = z.object({
  version: z.literal(CONVERSATION_SEARCH_VERSION),
  entries: z.array(conversationSearchEntrySchema).max(CONVERSATION_SEARCH_LIMIT),
  nextCursor: z.string().max(1024).nullable(),
  // Results cover the committed prefix. True explicitly discloses index lag.
  indexing: z.boolean(),
});
export type ConversationSearchPage = z.infer<typeof conversationSearchPageSchema>;
