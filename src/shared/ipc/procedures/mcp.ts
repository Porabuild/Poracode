import { z } from "zod";
import type { DetectMcpServersResult } from "../../contracts";
import { definePayloadProcedure } from "../core";

export const detectMcpServersPayloadSchema = z.object({
  /** Absolute project path to scan for project-level MCP configs. */
  projectPath: z.string().optional(),
});
export type DetectMcpServersPayload = z.infer<typeof detectMcpServersPayloadSchema>;

export const mcpProcedures = {
  /** Read-only scan of other tools' MCP configs (global + optional project). */
  getDetectedMcpServers: definePayloadProcedure<
    DetectMcpServersPayload,
    DetectMcpServersResult,
    "main-local"
  >("getDetectedMcpServers", "main-local", detectMcpServersPayloadSchema),
} as const;
