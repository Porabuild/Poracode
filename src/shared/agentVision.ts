import { z } from "zod";

// Additive, ephemeral read surface: existing remote peers and persisted data remain valid.
export const AGENT_VISION_VERSION = 1;
export const AGENT_VISION_STREAM_VERSION = 1;
export const AGENT_VISION_FRAME_INTERVAL_MS = Math.ceil(1000 / 15);
export const agentVisionSchema = z.object({
  version: z.literal(AGENT_VISION_VERSION),
  streamVersion: z.literal(AGENT_VISION_STREAM_VERSION).optional(),
  source: z.enum(["browser", "chrome", "computer"]),
  toolName: z.string(),
  status: z.enum(["running", "idle", "error"]),
  updatedAt: z.number(),
  target: z.string().optional(),
  image: z
    .string()
    .max(3 * 1024 * 1024)
    .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/u)
    .optional(),
  capturedAt: z.number().optional(),
});
export type AgentVision = z.infer<typeof agentVisionSchema>;
export type AgentVisionFrame = Pick<AgentVision, "image" | "target">;
export const agentVisionResponseSchema = agentVisionSchema.nullable();
export const agentVisionStreamFrameSchema = z.object({
  type: z.literal("agent-vision-frame"),
  watchId: z.string().min(1).max(128),
  vision: agentVisionResponseSchema,
});
