import { z } from "zod";
import { baseAgentKind } from "./agentInstance";

/**
 * Importing an existing CLI conversation into a Poracode thread. Discovery
 * reads the provider's own transcript files (Codex rollouts, Claude Code
 * project logs) and never writes to them; the import replays their text into a
 * new thread whose `sessionRef` resumes the original provider session — so the
 * agent keeps the full history (tool calls, file contents) even though the
 * chat pane only replays the text.
 */

export const importedSessionProviderSchema = z.string().min(1);
export type ImportedSessionProvider = z.infer<typeof importedSessionProviderSchema>;

/**
 * Which provider's transcripts an agent kind can own: the base account and
 * every profile of that driver. Any other kind cannot take an imported session.
 */
export function importedSessionProviderForAgentKind(kind: string): ImportedSessionProvider {
  return baseAgentKind(kind);
}

export const threadImportedFromSchema = z.object({
  provider: importedSessionProviderSchema,
  /** Absolute path of the transcript the thread was imported from. */
  path: z.string().min(1),
  importedAt: z.string().min(1),
});
export type ThreadImportedFrom = z.infer<typeof threadImportedFromSchema>;

export const importableSessionSchema = z.object({
  /**
   * `<provider>:<providerSessionId>` — stable across scans, used as a React
   * key. A session copied into a profile home shares its original's id and
   * the scan lists whichever copy was written last.
   */
  id: z.string().min(1),
  provider: importedSessionProviderSchema,
  /**
   * Account the session belongs to (`codex`, `codex:work`, `claude:work`, …):
   * the home it was found in, or for Claude the profile whose login owns it
   * even when the transcript sits in another home.
   */
  agentKind: z.string().min(1),
  providerSessionId: z.string().min(1),
  path: z.string().min(1),
  /** Working directory recorded in the transcript, when it records one. */
  cwd: z.string().optional(),
  startedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  /** First user message, trimmed — the list's title line when there is no title. */
  preview: z.string(),
  /** Name the provider's own UI shows for the session, when it has one. */
  title: z.string().min(1).optional(),
  /** Model the provider recorded for the session, when the head carried one. */
  model: z.string().min(1).optional(),
  /**
   * Whether `cwd` still exists on disk. A session whose folder is gone cannot
   * auto-create a project, so the UI makes the user pick a target instead.
   */
  cwdExists: z.boolean(),
  /** Thread already imported from this session, when one exists. */
  importedThreadId: z.string().optional(),
});
export type ImportableSession = z.infer<typeof importableSessionSchema>;

export const listImportableSessionsPayloadSchema = z.object({
  /** Keep only sessions recorded against this working directory. */
  cwd: z.string().min(1).optional(),
  provider: importedSessionProviderSchema.optional(),
  /** Keep only sessions belonging to this agent kind (account or profile). */
  agentKind: z.string().min(1).optional(),
  /** Matched case-insensitively against the session's title and folder. */
  query: z.string().min(1).optional(),
});
export type ListImportableSessionsPayload = z.infer<typeof listImportableSessionsPayloadSchema>;

/**
 * Every value the discovery pass saw, whatever the page limit cut. The filter
 * dropdowns are built from this: a folder whose sessions are all old would
 * otherwise disappear from the list of folders you can pick.
 */
export interface ImportSessionFacets {
  providers: ImportedSessionProvider[];
  accounts: string[];
  folders: string[];
}

export interface ListImportableSessionsResult {
  sessions: ImportableSession[];
  facets: ImportSessionFacets;
  /** Whether more sessions survived the filters than the page limit could hold. */
  truncated: boolean;
}

export const importSessionTranscriptPayloadSchema = z.object({
  /** Thread the renderer already created; the transcript is replayed into it. */
  threadId: z.string().min(1),
  provider: importedSessionProviderSchema,
  path: z.string().min(1),
  /**
   * Agent kind the thread runs under. When the transcript lives outside that
   * kind's home it is copied there first, so the provider can resume it.
   */
  targetAgentKind: z.string().min(1).optional(),
});
export type ImportSessionTranscriptPayload = z.infer<typeof importSessionTranscriptPayloadSchema>;

export const importSessionTranscriptResultSchema = z.object({
  messageCount: z.number().int().nonnegative(),
  /** Transcript the thread resumes from — the copy, when one was made. */
  path: z.string().min(1),
  /**
   * Set when another thread already holds this session, in which case nothing
   * was replayed. The caller should roll its own thread back and point the
   * user at this one: two windows importing the same session at the same
   * moment would otherwise each build a thread and each fail the other's
   * duplicate check, leaving the user with two errors and no threads.
   */
  existingThreadId: z.string().min(1).optional(),
});
export type ImportSessionTranscriptResult = z.infer<typeof importSessionTranscriptResultSchema>;
