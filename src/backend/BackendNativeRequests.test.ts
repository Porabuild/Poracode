import { afterEach, expect, it, vi } from "vitest";
import type { BackendHostOutboundMessage } from "@/shared/backendHostProtocol";
import { BackendNativeRequests } from "./BackendNativeRequests";

afterEach(() => vi.useRealTimers());

it("registers reverse work before a synchronous native reply", async () => {
  const requests = new BackendNativeRequests((message) => {
    if (message.kind !== "native-request") throw new Error("Unexpected fixture message");
    requests.resolve({ requestId: message.id, ok: true, data: "synthetic-result" });
  });
  await expect(requests.request({ operation: "browser-state", payload: {} })).resolves.toBe(
    "synthetic-result",
  );
  await requests.drain();
});

it("settles a throwing send and does not leave a native wait in the drain", async () => {
  const requests = new BackendNativeRequests(() => {
    throw new Error("Synthetic send failure");
  });
  await expect(requests.request({ operation: "browser-state", payload: {} })).rejects.toThrow(
    "Synthetic send failure",
  );
  await requests.drain();
});

it("keeps a native timeout bounded and ignores its late reply", async () => {
  vi.useFakeTimers();
  let sent: BackendHostOutboundMessage | undefined;
  const requests = new BackendNativeRequests((message) => {
    sent = message;
  });
  const reply = requests.request({ operation: "browser-state", payload: {} });
  const result = reply.catch((error: unknown) => error);
  let joined = false;
  const draining = requests.drain().then(() => {
    joined = true;
  });
  await vi.advanceTimersByTimeAsync(59_999);
  expect(joined).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual(
    expect.objectContaining({ message: expect.stringMatching(/timed out/i) }),
  );
  await draining;
  if (sent?.kind !== "native-request") throw new Error("Missing fixture native request");
  const requestId = sent.id;
  expect(() => requests.resolve({ requestId, ok: true, data: "too-late" })).not.toThrow();
  expect(joined).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels active waits and refuses new native work without sending it", async () => {
  const send = vi.fn<(message: BackendHostOutboundMessage) => void>();
  const requests = new BackendNativeRequests(send);
  const pending = requests.request({ operation: "browser-state", payload: {} });
  requests.cancel(new Error("Synthetic parent loss"));
  await expect(pending).rejects.toThrow("Synthetic parent loss");
  await requests.drain();
  await expect(requests.request({ operation: "browser-state", payload: {} })).rejects.toThrow(
    "Synthetic parent loss",
  );
  expect(send).toHaveBeenCalledOnce();
});
