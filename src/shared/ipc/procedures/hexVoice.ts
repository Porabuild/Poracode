import {
  hexVoiceRequestSchema,
  hexVoiceResponseSchema,
  type HexVoiceRequest,
  type HexVoiceResponse,
} from "../../contracts/hexVoice";
import { definePayloadProcedure } from "../core";

export const hexVoiceProcedures = {
  hexVoice: definePayloadProcedure<HexVoiceRequest, HexVoiceResponse, "supervisor">(
    "hexVoice",
    "supervisor",
    hexVoiceRequestSchema,
    hexVoiceResponseSchema,
  ),
} as const;
