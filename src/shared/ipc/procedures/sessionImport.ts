import {
  importSessionTranscriptPayloadSchema,
  listImportableSessionsPayloadSchema,
  listImportableSessionsResultSchema,
  type ImportSessionTranscriptPayload,
  type ImportSessionTranscriptResult,
  type ListImportableSessionsPayload,
  type ListImportableSessionsResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

/**
 * Transcripts live on the supervisor's host. Listing is remote-routable; remote
 * clients import through the `import-session` thread command, so the replay
 * procedure stays local.
 */
export const sessionImportProcedures = {
  listImportableSessions: definePayloadProcedure<
    ListImportableSessionsPayload,
    ListImportableSessionsResult,
    "supervisor"
  >(
    "listImportableSessions",
    "supervisor",
    listImportableSessionsPayloadSchema,
    listImportableSessionsResultSchema,
  ),
  importSessionTranscript: definePayloadProcedure<
    ImportSessionTranscriptPayload,
    ImportSessionTranscriptResult,
    "supervisor"
  >("importSessionTranscript", "supervisor", importSessionTranscriptPayloadSchema),
} as const;
