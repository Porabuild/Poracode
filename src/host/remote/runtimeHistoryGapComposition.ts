import { getRuntimeThreadGapNotice, lookupRuntimeNotice } from "@/host/db";
import type {
  RuntimeHistoryGapAcknowledgeResult,
  RuntimeHistoryGapDescriptor,
  RuntimeHistoryNotice,
} from "@/shared/runtimeHistoryNotice";
import type { RemoteAccessServerOptions } from "./remoteAccessServerTypes";

/**
 * The ONE B1 runtime-gap composition both host compositions share.
 *
 * - {@link createRuntimeHistoryGapPort} exposes the backend host's durable
 *   descriptor/notice/acknowledgement surface to the remote server. The port
 *   exists only when the host owns the durable store, which is exactly what
 *   makes the server advertise `capabilities.runtimeHistoryNotices`.
 * - {@link createRuntimeGapAcknowledgedHook} is the publication-only
 *   post-commit recovery signal. It NEVER routes the acknowledgement through
 *   supervisor-event persistence (a persistence-owning publisher would treat
 *   `thread-reset` as an authoritative rebase and erase committed transcript
 *   bytes); it only asks clients to resynchronize authoritative history.
 */

export interface RuntimeHistoryGapBackendHost {
  getThreadRuntimeGap(threadId: string): RuntimeHistoryGapDescriptor | null;
  acknowledgeThreadRuntimeGap(
    threadId: string,
    token: string,
  ): Promise<RuntimeHistoryGapAcknowledgeResult>;
}

export interface RuntimeHistoryGapServer {
  broadcastResyncRequired(reason: string): void;
}

export function createRuntimeHistoryGapPort(
  host: RuntimeHistoryGapBackendHost,
): NonNullable<RemoteAccessServerOptions["runtimeHistoryGap"]> {
  return {
    read: (threadId) => host.getThreadRuntimeGap(threadId),
    readNotice: (threadId: string): RuntimeHistoryNotice | null =>
      getRuntimeThreadGapNotice(threadId),
    lookupNotice: (threadId: string) => lookupRuntimeNotice(threadId),
    acknowledge: (threadId, token) => host.acknowledgeThreadRuntimeGap(threadId, token),
  };
}

/** The one resync reason string both compositions publish. */
export const RUNTIME_GAP_ACKNOWLEDGED_RESYNC_REASON =
  "Runtime history gap acknowledged; resynchronize from the host.";

export function createRuntimeGapAcknowledgedHook(
  getServer: () => RuntimeHistoryGapServer | null,
): (threadId: string) => void {
  return () => {
    getServer()?.broadcastResyncRequired(RUNTIME_GAP_ACKNOWLEDGED_RESYNC_REASON);
  };
}
