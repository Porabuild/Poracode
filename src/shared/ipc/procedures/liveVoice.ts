import {
  connectThreadVoicePayloadSchema,
  disconnectThreadVoicePayloadSchema,
  type ConnectThreadVoicePayload,
  type ConnectThreadVoiceResult,
  type DisconnectThreadVoicePayload,
} from "../../contracts/liveVoice";
import { definePayloadProcedure } from "../core";

/** Desktop-only signaling; deliberately absent from the remote procedure allowlist. */
export const liveVoiceProcedures = {
  connectThreadVoice: definePayloadProcedure<
    ConnectThreadVoicePayload,
    ConnectThreadVoiceResult,
    "supervisor"
  >("connectThreadVoice", "supervisor", connectThreadVoicePayloadSchema),
  disconnectThreadVoice: definePayloadProcedure<DisconnectThreadVoicePayload, void, "supervisor">(
    "disconnectThreadVoice",
    "supervisor",
    disconnectThreadVoicePayloadSchema,
  ),
} as const;
