import { WebSocket } from "ws";
import { dbGetThread } from "@/host/db";
import { AGENT_VISION_FRAME_INTERVAL_MS, type AgentVision } from "@/shared/agentVision";
import type { AuthenticatedRemoteSession } from "../auth";
import type { RemoteServerContext } from "./context";

/** Pull only the next frame; slow viewers never accumulate stale images. */
export function watchAgentVision(
  ctx: RemoteServerContext,
  ws: WebSocket,
  session: AuthenticatedRemoteSession,
  threadId: string,
  watchId: string,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: AgentVision | null | undefined;
  const live = () =>
    !stopped &&
    !ctx.stopping &&
    ws.readyState === WebSocket.OPEN &&
    ctx.clients.get(ws) === session &&
    (ctx.auth.accessSessionExpiresAtMs(session.sessionId) ?? 0) > Date.now();
  async function next() {
    if (!live()) return;
    const started = Date.now();
    let interval = AGENT_VISION_FRAME_INTERVAL_MS;
    try {
      if (ws.bufferedAmount < 1_500_000) {
        const vision = await ctx.runIngressWork(
          () => ctx.options.readAgentVision!(threadId, true, true),
          ws,
        );
        if (!live()) return;
        if (ws.bufferedAmount >= 1_500_000) {
          timer = setTimeout(() => void next(), AGENT_VISION_FRAME_INTERVAL_MS);
          return;
        }
        if (
          previous === undefined ||
          vision?.image !== previous?.image ||
          vision?.updatedAt !== previous?.updatedAt ||
          vision?.source !== previous?.source ||
          vision?.toolName !== previous?.toolName ||
          vision?.status !== previous?.status ||
          vision?.target !== previous?.target
        ) {
          previous = vision;
          ctx.sendRaw(ws, JSON.stringify({ type: "agent-vision-frame", watchId, vision }));
        }
        if (!vision || (vision.status !== "running" && Date.now() - vision.updatedAt > 30_000))
          interval = 1000;
      }
    } catch {
      interval = 1000;
    }
    if (live())
      timer = setTimeout(() => void next(), Math.max(0, interval - (Date.now() - started)));
  }
  if (
    session.scopes.includes("session:read") &&
    ctx.options.readAgentVision &&
    dbGetThread(threadId)
  )
    void next();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
