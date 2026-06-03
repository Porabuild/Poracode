import { z } from "zod";

export const themeModeSchema = z.enum(["system", "light", "dark"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const agentKindSchema = z.string().min(1);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const terminalPositionSchema = z.enum(["right", "bottom"]);
export type TerminalPosition = z.infer<typeof terminalPositionSchema>;

export const threadRemoveActionSchema = z.enum(["archive", "delete"]);
export type ThreadRemoveAction = z.infer<typeof threadRemoveActionSchema>;

export const newThreadModeSchema = z.enum(["page", "panel"]);
export type NewThreadMode = z.infer<typeof newThreadModeSchema>;

export const gitReviewModeSchema = z.enum(["panel", "page"]);
export type GitReviewMode = z.infer<typeof gitReviewModeSchema>;

export const liveInputModeSchema = z.enum(["terminal", "server"]);
export type LiveInputMode = z.infer<typeof liveInputModeSchema>;

export const threadPresentationModeSchema = z.enum(["terminal", "gui"]);
export type ThreadPresentationMode = z.infer<typeof threadPresentationModeSchema>;

export const threadModeSchema = z.enum(["agent", "plan", "autopilot"]);
export type ThreadMode = z.infer<typeof threadModeSchema>;

export const threadStatusSchema = z.enum([
  "inactive",
  "launching",
  "working",
  "idle",
  "finished",
  "needs_approval",
  "needs_reply",
  "error",
]);
export type ThreadStatus = z.infer<typeof threadStatusSchema>;

/**
 * "Turn-active" — the agent is mid-turn from the user's perspective. Spans
 * from the first input until the agent fully finishes and the thread settles
 * back to idle/finished. Mid-turn pauses (needs_approval, needs_reply) and
 * user steers stay inside the same turn, so they don't close the turn-timing
 * window.
 */
export function isThreadTurnActive(status: ThreadStatus): boolean {
  return (
    status === "launching" ||
    status === "working" ||
    status === "needs_approval" ||
    status === "needs_reply"
  );
}

export const threadAttentionSchema = z.enum([
  "none",
  "working",
  "needs_approval",
  "needs_reply",
  "error",
]);
export type ThreadAttention = z.infer<typeof threadAttentionSchema>;

export const notificationFilterSchema = z.enum(["unfocused", "all"]);
export type NotificationFilter = z.infer<typeof notificationFilterSchema>;

export const authStateSchema = z.enum(["authenticated", "missing", "unknown"]);
export type AuthState = z.infer<typeof authStateSchema>;

export const projectLocationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("windows"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("wsl"),
    distro: z.string().min(1),
    linuxPath: z.string().min(1),
    uncPath: z.string().min(1),
  }),
  z.object({
    kind: z.literal("posix"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("ssh"),
    host: z.string().min(1),
    path: z.string().min(1),
  }),
]);
export type ProjectLocation = z.infer<typeof projectLocationSchema>;

export const sessionRefSchema = z.object({
  providerSessionId: z.string().min(1),
  discoveredAt: z.string().min(1),
});
export type SessionRef = z.infer<typeof sessionRefSchema>;

export const labeledOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  tooltipDescription: z.string().min(1).optional(),
});
export type LabeledOption = z.infer<typeof labeledOptionSchema>;
