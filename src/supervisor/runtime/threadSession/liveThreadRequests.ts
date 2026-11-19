import { randomUUID } from "node:crypto";
import type { RuntimeEvent, ThreadServerRequestId } from "@/shared/contracts";
import type {
  AppThreadRequestsPayload,
  AppThreadRequestsResult,
} from "@/shared/contracts/appThreadRequests";
import type { StructuredSessionHandle } from "../../agents/base";
import { buildAppThreadReply } from "./appThreadReply";

type RecordView = Extract<AppThreadRequestsResult, { action: "list" }>["requests"][number];
type Pending = { view: RecordView; replying: boolean };

export type RequestHandle = Pick<StructuredSessionHandle, "resolveServerRequest">;

export class LiveThreadRequests {
  private readonly pending = new WeakMap<RequestHandle, Map<string, Pending>>();

  observe(handle: RequestHandle, event: RuntimeEvent): void {
    if (event.type === "turn.completed") {
      this.pending.delete(handle);
    } else if (event.type === "request.resolved") {
      this.pending.get(handle)?.delete(String(event.requestId));
    } else if (event.type === "request.opened") {
      const entries = this.pending.get(handle) ?? new Map<string, Pending>();
      entries.set(String(event.requestId), {
        view: {
          requestId: event.requestId,
          requestToken: randomUUID(),
          requestType: event.requestType,
          payload: structuredClone(event.payload),
        },
        replying: false,
      });
      this.pending.set(handle, entries);
    }
  }

  async submit<T>(
    handle: RequestHandle | undefined,
    requestId: ThreadServerRequestId,
    resolve: () => Promise<T>,
  ): Promise<T> {
    const entries = handle && this.pending.get(handle);
    const key = String(requestId);
    const pending = entries?.get(key);
    if (!pending) return resolve();
    if (pending.replying) {
      throw new Error("A reply is already being submitted for this request.");
    }
    pending.replying = true;
    try {
      const result = await resolve();
      if (entries?.get(key) === pending) entries.delete(key);
      return result;
    } finally {
      // A failure leaves the token usable only if no provider event retired it.
      pending.replying = false;
    }
  }

  async run(
    handle: RequestHandle | undefined,
    input: AppThreadRequestsPayload["input"],
    forwarded?: RequestHandle,
  ): Promise<AppThreadRequestsResult> {
    const targets = [handle, forwarded].flatMap((candidate) => {
      const entries = candidate && this.pending.get(candidate);
      return candidate?.resolveServerRequest && entries ? [{ handle: candidate, entries }] : [];
    });
    if (input.action === "list") {
      return {
        action: "list",
        requests: targets.flatMap(({ entries }) =>
          [...entries.values()].filter(({ replying }) => !replying).map(({ view }) => view),
        ),
      };
    }
    for (const { handle: owner, entries } of targets) {
      const pending = entries.get(input.requestId);
      if (!pending || pending.view.requestToken !== input.requestToken) continue;
      const resolve = owner.resolveServerRequest?.bind(owner);
      if (!resolve) continue;
      const { requestId, ...request } = pending.view;
      const reply = buildAppThreadReply(request, input.reply);
      await this.submit(owner, requestId, () => resolve(requestId, reply));
      return { action: "reply", submitted: true };
    }
    throw new Error("This live request is no longer pending. Read the pending requests again.");
  }
}
