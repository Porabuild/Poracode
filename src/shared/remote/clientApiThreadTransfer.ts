import {
  threadTransferResultSchema,
  threadTransferUploadResultSchema,
  type ThreadTransferCommand,
  type ThreadTransferResultOf,
} from "../threadTransfer";
import { RemoteClientHistoryApi } from "./clientApiHistory";
import { RemoteClientError } from "./clientErrors";
import { parseResponse } from "./clientParse";

/** Packaging and restoring run Git over the whole checkout; give them the clone budget. */
const THREAD_TRANSFER_LONG_STEP_TIMEOUT_MS = 10 * 60_000;
const LONG_STEPS: ReadonlySet<ThreadTransferCommand["kind"]> = new Set([
  "plan",
  "export",
  "commit",
]);
const MUTATING_STEPS: ReadonlySet<ThreadTransferCommand["kind"]> = new Set(["export", "commit"]);

/**
 * Thread transfer steps (capabilities.threadTransfer v1). Both requests go
 * through `requestJson`, so token refresh, certificate pins and the
 * environment proxy apply exactly as for every other call.
 */
export abstract class RemoteClientThreadTransferApi extends RemoteClientHistoryApi {
  async threadTransfer<Command extends ThreadTransferCommand>(
    command: Command,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<ThreadTransferResultOf<Command["kind"]>> {
    const result = parseResponse(
      threadTransferResultSchema,
      await this.requestJson("/api/thread-transfers/command", {
        method: "POST",
        body: command,
        ...(LONG_STEPS.has(command.kind)
          ? { timeoutMs: THREAD_TRANSFER_LONG_STEP_TIMEOUT_MS }
          : {}),
        ...(MUTATING_STEPS.has(command.kind) ? { mutation: true } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      }),
      "thread transfer",
    );
    if (result.kind !== command.kind) {
      throw new RemoteClientError(
        "The host answered a different transfer step.",
        502,
        "invalid_response",
      );
    }
    return result as ThreadTransferResultOf<Command["kind"]>;
  }

  /** Appends one chunk to a staged transfer; resolves with the bytes the host now holds. */
  async uploadThreadTransferChunk(
    input: {
      readonly transferId: string;
      readonly offset: number;
      readonly total: number;
      readonly sha256: string;
      readonly data: Uint8Array;
    },
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<number> {
    const query = new URLSearchParams({
      offset: String(input.offset),
      total: String(input.total),
      sha256: input.sha256,
    });
    const result = parseResponse(
      threadTransferUploadResultSchema,
      await this.requestJson(
        `/api/thread-transfers/${encodeURIComponent(input.transferId)}/package?${query.toString()}`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          rawBody: input.data,
          mutation: true,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      ),
      "thread transfer upload",
    );
    return result.received;
  }
}
