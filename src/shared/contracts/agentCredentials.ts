import { z } from "zod";
import { agentEnvSchema } from "../machines";

/**
 * Per-upstream-provider credential management for agents that authenticate
 * against several AI providers rather than a single account (OpenCode stores
 * one credential per provider in its shared `auth.json`).
 */
export const manageAgentCredentialsPayloadSchema = z
  .object({
    agentKind: z.string().min(1).max(128),
    env: agentEnvSchema,
    action: z.enum(["list", "remove"]),
    /** Credential to sign out of; required for `remove`. */
    credentialId: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "remove" && !value.credentialId)
      ctx.addIssue({
        code: "custom",
        message: "A credential is required.",
        path: ["credentialId"],
      });
  });
export type ManageAgentCredentialsPayload = z.infer<typeof manageAgentCredentialsPayloadSchema>;

export interface ManageAgentCredentialsResult {
  /** The connected providers left after the action, ready for display. */
  providers: import("./agent").AgentConnectedProvider[];
}
