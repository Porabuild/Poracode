import { afterEach, describe, expect, it, vi } from "vitest";
import { gatherIceCandidates } from "./webrtc";
afterEach(() => vi.useRealTimers());
function peer() {
  return Object.assign(new EventTarget(), {
    iceGatheringState: "gathering",
  }) as unknown as RTCPeerConnection;
}
describe("one-shot WebRTC signaling", () => {
  it("waits until ICE gathering completes", async () => {
    const connection = peer(),
      abort = new AbortController();
    let complete = false;
    const waiting = gatherIceCandidates(connection, abort.signal).then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);
    Object.assign(connection, { iceGatheringState: "complete" });
    connection.dispatchEvent(new Event("icegatheringstatechange"));
    await waiting;
    expect(complete).toBe(true);
  });
  it("cancels gathering when media is released", async () => {
    const abort = new AbortController(),
      waiting = gatherIceCandidates(peer(), abort.signal);
    abort.abort();
    await expect(waiting).rejects.toThrow("cancelled");
  });
  it("times out an incomplete candidate set", async () => {
    vi.useFakeTimers();
    const waiting = gatherIceCandidates(peer(), new AbortController().signal).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await waiting).toBeInstanceOf(Error);
  });
});
