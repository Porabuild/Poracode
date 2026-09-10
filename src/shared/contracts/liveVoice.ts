import { z } from "zod";
import { threadConfigSchema } from "./config";

/** Ephemeral WebRTC signaling. Never persist session descriptions or media. */
export const connectThreadVoicePayloadSchema = z.object({
  threadId: z.string().min(1),
  connectionId: z.string().uuid(),
  offerSdp: z.string().min(1).max(64_000),
  config: threadConfigSchema,
});
export type ConnectThreadVoicePayload = z.infer<typeof connectThreadVoicePayloadSchema>;

export const disconnectThreadVoicePayloadSchema = z.object({
  threadId: z.string().min(1),
  connectionId: z.string().uuid(),
});
export type DisconnectThreadVoicePayload = z.infer<typeof disconnectThreadVoicePayloadSchema>;

export interface ConnectThreadVoiceResult {
  answerSdp: string;
}

/** Provider-normalized control events; audio travels over the peer connection. */
export type LiveVoiceEvent =
  | { connectionId: string; type: "closed" }
  | { connectionId: string; type: "error"; message: string }
  | {
      connectionId: string;
      type: "transcript";
      role: "user" | "assistant";
      text: string;
      final: boolean;
    };
