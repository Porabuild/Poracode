import {
  manageAgentCredentialsPayloadSchema,
  type ManageAgentCredentialsPayload,
  type ManageAgentCredentialsResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

/**
 * Credential management for agents that authenticate per upstream AI provider.
 * The supervisor owns the agent's credential store, so the renderer lists and
 * removes through it rather than shelling out.
 */
export const agentCredentialProcedures = {
  manageAgentCredentials: definePayloadProcedure<
    ManageAgentCredentialsPayload,
    ManageAgentCredentialsResult,
    "supervisor"
  >("manageAgentCredentials", "supervisor", manageAgentCredentialsPayloadSchema),
} as const;
