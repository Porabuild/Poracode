import { z } from "zod";
import { agentEnvSchema } from "../machines";

/** Native provider package management, separate from Poracode's plugin packages. */
export const manageAgentPluginsPayloadSchema = z
  .object({
    agentKind: z.string().min(1).max(128),
    env: agentEnvSchema,
    action: z.enum(["list", "check", "install", "update", "remove"]),
    target: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, ctx) => {
    if (["install", "update", "remove"].includes(value.action) && !value.target)
      ctx.addIssue({ code: "custom", message: "A package target is required.", path: ["target"] });
  });
export type ManageAgentPluginsPayload = z.infer<typeof manageAgentPluginsPayloadSchema>;
export interface AgentPluginPackage {
  target: string;
  id?: string;
  version?: string;
  status: "active" | "failed" | "configured";
  outdated: boolean;
  server: boolean;
  terminal: boolean;
}
export interface ManageAgentPluginsResult {
  packages: AgentPluginPackage[];
}
