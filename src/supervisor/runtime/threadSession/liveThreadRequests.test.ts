import { expect, it, vi } from "vitest";
import type { RuntimeEvent, ThreadServerRequestId } from "@/shared/contracts";
import { LiveThreadRequests } from "./liveThreadRequests";

const threadId = "thread";
function requestOpened(requestId: ThreadServerRequestId): RuntimeEvent {
  return {
    threadId,
    type: "request.opened",
    requestId,
    requestType: "tool_call_approval",
    payload: { summary: "Confirm", options: [{ optionId: "deny", label: "Deny" }] },
  } as RuntimeEvent;
}
function fixture() {
  const requests = new LiveThreadRequests();
  const resolve = vi.fn<(id: ThreadServerRequestId, reply: unknown) => Promise<void>>(
    async () => undefined,
  );
  const handle = { resolveServerRequest: resolve };
  const read = async () => {
    const result = await requests.run(handle, { action: "list", threadId });
    if (result.action !== "list") throw new Error("Expected live requests");
    return result.requests;
  };
  const reply = (requestToken: string, optionId = "deny") =>
    requests.run(handle, {
      threadId,
      action: "reply",
      requestId: "42",
      requestToken,
      reply: { kind: "options", optionIds: [optionId] },
    });
  return { requests, resolve, handle, read, reply };
}

it("binds replies to the exact live incarnation and retains native numeric request IDs", async () => {
  const { requests, handle, read, reply, resolve } = fixture();
  requests.observe(handle, requestOpened(42));
  const old = (await read())[0]!;
  requests.observe(handle, requestOpened(42));
  const current = (await read())[0]!;
  await expect(reply(old.requestToken)).rejects.toThrow(/no longer pending/u);
  await expect(reply(current.requestToken, "allow")).rejects.toThrow(/unavailable/u);
  expect(resolve).not.toHaveBeenCalled();
  await expect(reply(current.requestToken)).resolves.toEqual({ action: "reply", submitted: true });
  expect(resolve).toHaveBeenCalledExactlyOnceWith(42, { optionId: "deny" });
  await expect(reply(current.requestToken)).rejects.toThrow(/no longer pending/u);
});

it("invalidates a token when the native app takes the request", async () => {
  const { requests, handle, read, reply, resolve } = fixture();
  requests.observe(handle, requestOpened(42));
  const { requestToken } = (await read())[0]!;
  await requests.submit(handle, 42, async () => undefined);
  await expect(reply(requestToken)).rejects.toThrow(/no longer pending/u);
  expect(resolve).not.toHaveBeenCalled();
});

it("keeps a replacement request when the earlier reply finishes", async () => {
  const { requests, handle, read, reply, resolve } = fixture();
  requests.observe(handle, requestOpened(42));
  const { requestToken } = (await read())[0]!;
  const pending = Promise.withResolvers<void>();
  resolve.mockReturnValueOnce(pending.promise);
  const submitting = reply(requestToken);
  await expect(requests.submit(handle, 42, async () => undefined)).rejects.toThrow(/already/u);
  requests.observe(handle, requestOpened(42));
  pending.resolve();
  await submitting;
  expect(await read()).toEqual([
    expect.objectContaining({ requestToken: expect.not.stringMatching(requestToken) }),
  ]);
});

it("allows retry after a failed submission when the request is still open", async () => {
  const { requests, handle, read, reply, resolve } = fixture();
  requests.observe(handle, requestOpened(42));
  const { requestToken } = (await read())[0]!;
  resolve.mockRejectedValueOnce(new Error("Provider declined the reply"));
  await expect(reply(requestToken)).rejects.toThrow("Provider declined the reply");
  expect(await read()).toEqual([expect.objectContaining({ requestToken })]);
  await expect(reply(requestToken)).resolves.toEqual({ action: "reply", submitted: true });
  expect(await read()).toEqual([]);
});

it("does not revive a native submission that was resolved before its error arrived", async () => {
  const { requests, handle, read } = fixture();
  requests.observe(handle, requestOpened(42));
  const pending = Promise.withResolvers<void>();
  const submitting = requests.submit(handle, 42, () => pending.promise);
  requests.observe(handle, {
    type: "request.resolved",
    threadId,
    requestId: "42",
    outcome: "declined",
  });
  pending.reject(new Error("Reply acknowledgement was lost"));
  await expect(submitting).rejects.toThrow("Reply acknowledgement was lost");
  expect(await read()).toEqual([]);
});
