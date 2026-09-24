import {
  importSessionTranscriptPayloadSchema,
  listImportableSessionsPayloadSchema,
  type ImportSessionTranscriptPayload,
  type ImportSessionTranscriptResult,
  type ListImportableSessionsPayload,
  type ListImportableSessionsResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const sessionImportProcedures = {
  listImportableSessions: definePayloadProcedure<
    ListImportableSessionsPayload,
    ListImportableSessionsResult,
    "main-local"
  >("listImportableSessions", "main-local", listImportableSessionsPayloadSchema),
  importSessionTranscript: definePayloadProcedure<
    ImportSessionTranscriptPayload,
    ImportSessionTranscriptResult,
    "main-local"
  >("importSessionTranscript", "main-local", importSessionTranscriptPayloadSchema),
} as const;
