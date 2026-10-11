import { z } from "zod";
import { projectLocationSchema } from "../../contracts";
import type { LspMessagePayload, LspStartPayload, LspStopPayload } from "../../lsp";
import { definePayloadProcedure, omittedResultSchema } from "../core";

const lspStartPayloadSchema = z.object({
  sessionId: z.string().min(1),
  projectLocation: projectLocationSchema,
  languageId: z.string().min(1),
});

export const lspProcedures = {
  lspStart: definePayloadProcedure<LspStartPayload, void, "supervisor">(
    "lspStart",
    "supervisor",
    lspStartPayloadSchema,
    omittedResultSchema,
  ),
  lspStop: definePayloadProcedure<LspStopPayload, void, "supervisor">(
    "lspStop",
    "supervisor",
    z.custom<LspStopPayload>(),
  ),
  lspSendMessage: definePayloadProcedure<LspMessagePayload, unknown, "supervisor">(
    "lspSendMessage",
    "supervisor",
    z.custom<LspMessagePayload>(),
  ),
} as const;
