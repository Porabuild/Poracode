import { msg } from "@/shared/messages";

/** Signaling sends one complete SDP; the provider does not accept trickled candidates. */
export async function gatherIceCandidates(
  peer: RTCPeerConnection,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error(msg("voice.cancelled"));
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", changed);
      signal.removeEventListener("abort", cancelled);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const cancelled = () => finish(new Error(msg("voice.cancelled")));
    const timer = setTimeout(() => finish(new Error(msg("voice.connectionTimeout"))), 8_000);
    peer.addEventListener("icegatheringstatechange", changed);
    signal.addEventListener("abort", cancelled, { once: true });
    changed();
  });
}
