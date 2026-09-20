import {
  connectThreadVoicePayloadSchema,
  disconnectThreadVoicePayloadSchema,
  type ConnectThreadVoicePayload,
  type ConnectThreadVoiceResult,
  type DisconnectThreadVoicePayload,
} from "../../contracts/liveVoice";
import { definePayloadProcedure, omittedResultSchema } from "../core";
import { z } from "zod";

/** Desktop-only signaling; now allowlisted as a loopback HTTP passthrough (V6 B.2). */
export const liveVoiceProcedures = {
  connectThreadVoice: definePayloadProcedure<
    ConnectThreadVoicePayload,
    ConnectThreadVoiceResult,
    "supervisor"
  >(
    "connectThreadVoice",
    "supervisor",
    connectThreadVoicePayloadSchema,
    z.object({ answerSdp: z.string() }),
  ),
  disconnectThreadVoice: definePayloadProcedure<DisconnectThreadVoicePayload, void, "supervisor">(
    "disconnectThreadVoice",
    "supervisor",
    disconnectThreadVoicePayloadSchema,
    omittedResultSchema,
  ),
} as const;
