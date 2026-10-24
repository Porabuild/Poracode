import { describe, expect, it, vi } from "vitest";
import type { RemoteWebSocketClientMessage } from "@/shared/remote";
import type { AgentVision } from "@/shared/agentVision";
import {
  handleAgentVisionServerMessage,
  setAgentVisionSocketSender,
  subscribeAgentVisionStream,
} from "./agentVisionStream";

describe("Agent Vision stream subscriptions", () => {
  it("shares a watch between panel and popout, fences owners, and restores it on reconnect", () => {
    const first = vi.fn<(message: RemoteWebSocketClientMessage) => boolean>(() => true);
    const next = vi.fn<(message: RemoteWebSocketClientMessage) => boolean>(() => true);
    const panel = vi.fn<(vision: AgentVision | null) => void>();
    const popout = vi.fn<(vision: AgentVision | null) => void>();
    setAgentVisionSocketSender("host", first);
    const stopPanel = subscribeAgentVisionStream("host", "thread", panel);
    const stopPopout = subscribeAgentVisionStream("host", "thread", popout);
    expect(first).toHaveBeenCalledTimes(1);
    const watch = first.mock.calls[0]![0];
    if (watch.type !== "agent-vision-watch") throw new Error("Expected watch");
    const frame = { type: "agent-vision-frame" as const, watchId: watch.watchId, vision: null };
    handleAgentVisionServerMessage("another-host", frame);
    expect(panel).not.toHaveBeenCalled();
    handleAgentVisionServerMessage("host", frame);
    expect(panel).toHaveBeenCalledWith(null);
    expect(popout).toHaveBeenCalledWith(null);
    stopPanel();
    expect(first).toHaveBeenCalledTimes(1);
    setAgentVisionSocketSender("host", null);
    expect(popout).toHaveBeenCalledTimes(2);
    setAgentVisionSocketSender("host", next);
    expect(next).toHaveBeenCalledWith(watch);
    stopPopout();
    expect(next).toHaveBeenLastCalledWith({ type: "agent-vision-unwatch", watchId: watch.watchId });
    setAgentVisionSocketSender("host", null);
  });
});
