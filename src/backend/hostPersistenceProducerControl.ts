import {
  addRuntimePersistenceHealthListener,
  setRuntimePersistenceInFlightWindowBytes,
  type RuntimeProducerSignal,
} from "@/host/db";
import { canonicalFlowSeqOf, type SupervisorEvent } from "@/shared/ipc";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";

/**
 * B1 producer backpressure plane: forwards persistence-health transitions from
 * the bounded persistence controller to the supervisor, re-raises the current
 * signal when a (re)started supervisor advertises its flow-control capability,
 * and carries the host's canonical credit window and admission acks. Extracted
 * from `BackendHostCore` so the host core keeps one responsibility per
 * collaborator and the file does not grow with this wiring.
 *
 * Credit/ack contract (parent integration): the host composition grants a
 * window once per supervisor generation via {@link setCanonicalCreditWindow}
 * and calls {@link acknowledgeCanonicalFlow} with the *original* event
 * immediately after `persistSupervisorEvent(event)` returns its outcome. The
 * ack is never sent before that outcome: only then is the envelope's flow
 * sequence known to be admitted or explicitly refused, which is what lets the
 * supervisor release the in-flight bytes (including kernel/receiver buffers)
 * without ever freeing a sequence the host did not resolve.
 */
export class HostPersistenceProducerControl {
  private lastSignal: RuntimeProducerSignal | null = null;
  private creditWindowBytes: number | null = null;
  private unsubscribe: (() => void) | null;

  constructor(private readonly supervisorClient: SupervisorClient) {
    this.unsubscribe = addRuntimePersistenceHealthListener({
      onSignal: (signal) => this.apply(signal),
    });
  }

  /** Last signal sent (diagnostics/tests); null when persistence never pressured. */
  getLastSignal(): RuntimeProducerSignal | null {
    return this.lastSignal;
  }

  /** Currently granted canonical credit window, if any (diagnostics/tests). */
  getCanonicalCreditWindow(): number | null {
    return this.creditWindowBytes;
  }

  /**
   * Bind both sides of the flow contract to the current supervisor's advertised
   * bound. Reserve host headroom before granting sender credit. Re-advertising
   * after a restart replaces the old window, including a legacy peer's absence
   * of credit support; the client fences the actual grant by boot generation.
   */
  refreshPeerCapabilities(): void {
    const peer = this.supervisorClient.getPeerCanonicalCapabilities();
    const windowBytes =
      typeof peer.maxInFlightBytes === "number" &&
      Number.isSafeInteger(peer.maxInFlightBytes) &&
      peer.maxInFlightBytes > 0
        ? peer.maxInFlightBytes
        : null;
    const canGrant =
      peer.supportsCanonicalCredit &&
      Boolean(peer.generation) &&
      windowBytes !== null &&
      typeof peer.maxEnvelopeBytes === "number" &&
      Number.isSafeInteger(peer.maxEnvelopeBytes) &&
      peer.maxEnvelopeBytes > 0 &&
      peer.maxEnvelopeBytes <= windowBytes;
    // Updating headroom can synchronously emit a pressure transition. Such a
    // transition must carry this peer's credit, never the previous boot's.
    this.creditWindowBytes = canGrant ? windowBytes : null;
    setRuntimePersistenceInFlightWindowBytes(windowBytes);
    this.raise(this.lastSignal);
  }

  /**
   * Host policy hook: grant the supervisor's canonical credit window (or
   * `null` to fall back to the static advertisement). Applied to the current
   * supervisor generation; a restart re-advertises and {@link resend} re-raises
   * the window with the new generation.
   */
  setCanonicalCreditWindow(bytes: number | null): void {
    this.creditWindowBytes = bytes;
    this.raise(this.lastSignal);
  }

  /**
   * Exact Core acknowledgment hook. Call after `persistSupervisorEvent(event)`
   * has returned for the same event instance (publish, publish-partial, or
   * withhold all resolve the envelope). Non-canonical events are ignored.
   */
  acknowledgeCanonicalFlow(event: SupervisorEvent): void {
    const flowSeq = canonicalFlowSeqOf(event);
    if (flowSeq === undefined) return;
    this.supervisorClient.acknowledgeCanonicalFlow(flowSeq);
  }

  /** Re-raise the current signal after a supervisor (re)advertises. */
  resend(): void {
    this.raise(this.lastSignal);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private apply(signal: RuntimeProducerSignal): void {
    this.lastSignal = signal;
    this.raise(signal);
  }

  private raise(signal: RuntimeProducerSignal | null): void {
    const credit =
      this.creditWindowBytes !== null ? { canonicalCreditBytes: this.creditWindowBytes } : {};
    if (signal === null || signal.kind === "resume") {
      this.supervisorClient.setEventBackpressured(false, undefined, credit);
      return;
    }
    if (signal.kind === "stop") {
      const threadIds =
        signal.threadIds && signal.threadIds.length > 0 ? signal.threadIds : undefined;
      this.supervisorClient.setEventBackpressured(true, "host-persistence-refusing", {
        ...(threadIds ? { threadIds } : {}),
        ...credit,
      });
      return;
    }
    this.supervisorClient.setEventBackpressured(true, "host-persistence-degraded", credit);
  }
}
