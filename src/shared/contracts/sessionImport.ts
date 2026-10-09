import { z } from "zod";

/**
 * Importing an existing CLI conversation into a Poracode thread. Agents that
 * declare `AgentAdapter.sessionImport` expose their on-disk transcripts; the
 * supervisor reads them (never writes) and replays their text into a new
 * thread whose `sessionRef` resumes the original provider session.
 */

export const threadImportedFromSchema = z.object({
  /** Absolute path of the transcript the thread was imported from. */
  path: z.string().min(1),
  importedAt: z.string().min(1),
});
export type ThreadImportedFrom = z.infer<typeof threadImportedFromSchema>;

export const importableSessionSchema = z.object({
  /** `<agentKind>:<providerSessionId>`, stable across scans. */
  id: z.string().min(1),
  /** Agent (base kind or profile) whose transcript store holds the session. */
  agentKind: z.string().min(1),
  /** Resumable provider session id. */
  providerSessionId: z.string().min(1),
  path: z.string().min(1),
  cwd: z.string().optional(),
  startedAt: z.string().optional(),
  updatedAt: z.string(),
  /** First user message, compacted to one line. */
  preview: z.string(),
  title: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  /** Whether `cwd` still exists; a missing folder needs a fallback project. */
  cwdExists: z.boolean(),
});
export type ImportableSession = z.infer<typeof importableSessionSchema>;

export const listImportableSessionsPayloadSchema = z.object({
  agentKind: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  /** Matched with {@link matchesImportQuery} on the server and in the UI alike. */
  query: z.string().min(1).optional(),
});
export type ListImportableSessionsPayload = z.infer<typeof listImportableSessionsPayloadSchema>;

/** Filter values that still have sessions under the other active filters. */
export interface ImportSessionFacets {
  agentKinds: string[];
  folders: string[];
}

export interface ListImportableSessionsResult {
  sessions: ImportableSession[];
  facets: ImportSessionFacets;
  /** More sessions matched than the page holds, or the scan hit its file/byte bounds. */
  truncated: boolean;
  /** A newer request replaced this one before it finished; the result is empty. */
  superseded?: true;
}

export const importSessionTranscriptPayloadSchema = z.object({
  /** Thread the renderer already created; the transcript is replayed into it. */
  threadId: z.string().min(1),
  agentKind: z.string().min(1),
  path: z.string().min(1),
  /** Session id the thread resumes; the transcript must still carry it. */
  providerSessionId: z.string().min(1),
});
export type ImportSessionTranscriptPayload = z.infer<typeof importSessionTranscriptPayloadSchema>;

export interface ImportSessionTranscriptResult {
  messageCount: number;
}

/**
 * The single search predicate for import. The scan applies it before paging
 * and the panel re-applies it to the page while a debounced rescan is in
 * flight, so a match never appears and then vanishes.
 */
export function matchesImportQuery(
  session: Pick<ImportableSession, "title" | "preview" | "cwd">,
  query: string | undefined,
): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) return true;
  return [session.title, session.preview, session.cwd].some((field) =>
    field?.toLowerCase().includes(needle),
  );
}
