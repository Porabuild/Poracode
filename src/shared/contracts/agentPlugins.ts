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

export const agentPluginPackageSchema = z.object({
  target: z.string().min(1),
  id: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  /** Registry version an update would install, resolved on an explicit update check. */
  latestVersion: z.string().min(1).optional(),
  status: z.enum(["active", "failed", "configured"]),
  outdated: z.boolean(),
  /** The provider is applying an update to this package right now. */
  updating: z.boolean().optional(),
  server: z.boolean(),
  terminal: z.boolean(),
});
export type AgentPluginPackage = z.infer<typeof agentPluginPackageSchema>;

export const manageAgentPluginsResultSchema = z.object({
  packages: z.array(agentPluginPackageSchema),
});
export type ManageAgentPluginsResult = z.infer<typeof manageAgentPluginsResultSchema>;
