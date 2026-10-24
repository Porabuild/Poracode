import type { AgentVision } from "@/shared/agentVision";
import { AGENT_VISION_STREAM_VERSION } from "@/shared/agentVision";
import type { RemoteWebSocketClientMessage, RemoteWebSocketServerMessage } from "@/shared/remote";

type Sender = (message: RemoteWebSocketClientMessage) => boolean;
interface Watch {
  ownerId: string;
  threadId: string;
  watchId: string;
  listeners: Set<(vision: AgentVision | null) => void>;
}
const senders = new Map<string, Sender>();
const watches = new Map<string, Watch>();

export function hasAgentVisionStream(ownerId: string): boolean {
  return senders.has(ownerId);
}

function start(watch: Watch) {
  senders.get(watch.ownerId)?.({
    type: "agent-vision-watch",
    version: AGENT_VISION_STREAM_VERSION,
    threadId: watch.threadId,
    watchId: watch.watchId,
  });
}

export function setAgentVisionSocketSender(ownerId: string, next: Sender | null): void {
  const previous = senders.get(ownerId);
  if (previous === next) return;
  if (next) senders.set(ownerId, next);
  else senders.delete(ownerId);
  for (const watch of watches.values()) {
    if (watch.ownerId !== ownerId) continue;
    previous?.({ type: "agent-vision-unwatch", watchId: watch.watchId });
    if (next) start(watch);
    else for (const listener of watch.listeners) listener(null);
  }
}

export function subscribeAgentVisionStream(
  ownerId: string,
  threadId: string,
  listener: (vision: AgentVision | null) => void,
): () => void {
  const key = JSON.stringify([ownerId, threadId]);
  let watch = watches.get(key);
  if (!watch) {
    watch = { ownerId, threadId, watchId: crypto.randomUUID(), listeners: new Set([listener]) };
    watches.set(key, watch);
    start(watch);
  }
  const current = watch;
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size > 0 || watches.get(key) !== current) return;
    senders.get(ownerId)?.({ type: "agent-vision-unwatch", watchId: current.watchId });
    watches.delete(key);
  };
}

export function handleAgentVisionServerMessage(
  ownerId: string,
  message: RemoteWebSocketServerMessage,
): boolean {
  if (message.type !== "agent-vision-frame") return false;
  for (const watch of watches.values()) {
    if (watch.ownerId === ownerId && watch.watchId === message.watchId)
      for (const listener of watch.listeners) listener(message.vision);
  }
  return true;
}
