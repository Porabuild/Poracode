import {
  importSessionTranscriptPayloadSchema,
  listImportableSessionsPayloadSchema,
  type ImportSessionTranscriptPayload,
  type ImportSessionTranscriptResult,
  type ListImportableSessionsPayload,
  type ListImportableSessionsResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

/** Desktop-local: transcripts live on the supervisor host and are not remote-routable. */
export const sessionImportProcedures = {
  listImportableSessions: definePayloadProcedure<
    ListImportableSessionsPayload,
    ListImportableSessionsResult,
    "supervisor"
  >("listImportableSessions", "supervisor", listImportableSessionsPayloadSchema),
  importSessionTranscript: definePayloadProcedure<
    ImportSessionTranscriptPayload,
    ImportSessionTranscriptResult,
    "supervisor"
  >("importSessionTranscript", "supervisor", importSessionTranscriptPayloadSchema),
} as const;
