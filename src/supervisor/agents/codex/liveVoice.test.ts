import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexLiveVoice } from "./liveVoice";
import { supportsCodexLiveVoice } from "./probe";
import type { CodexAppServerRpc } from "./appServerRpc";
import type { RuntimeEvent } from "@/shared/contracts";
import type { LiveVoiceEvent } from "@/shared/contracts/liveVoice";

const id = "1d15cb50-19ab-481d-9bea-a40fa1f50e54";
function harness() {
  let voice!: CodexLiveVoice;
  const request = vi
    .fn<(method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>>()
    .mockImplementation(async (method: string) => {
      if (method === "thread/realtime/stop")
        queueMicrotask(() =>
          voice.handleNotification("thread/realtime/closed", {
            threadId: "remote",
            reason: "requested",
          }),
        );
      return method === "account/read"
        ? { account: { type: "chatgpt", planType: "team" }, requiresOpenaiAuth: true }
        : {};
    });
  const emit = vi.fn<(event: LiveVoiceEvent) => void>();
  const emitRuntime = vi.fn<(events: RuntimeEvent[]) => void>();
  voice = new CodexLiveVoice(
    { request: request as CodexAppServerRpc["request"] },
    "local",
    emit,
    emitRuntime,
  );
  const notify = (method: string, params = {}) =>
    voice.handleNotification(`thread/realtime/${method}`, { threadId: "remote", ...params });
  return { request, emit, emitRuntime, voice, notify };
}
async function requested(h: ReturnType<typeof harness>) {
  await vi.waitFor(() =>
    expect(h.request).toHaveBeenCalledWith("thread/realtime/start", expect.any(Object)),
  );
}
afterEach(() => vi.useRealTimers());

describe("Codex subscription voice", () => {
  it("waits for the requested close before reconnecting after a stop acknowledgement", async () => {
    const h = harness();
    const first = h.voice.connect("remote", id, "offer");
    await requested(h);
    h.notify("started", { realtimeSessionId: id });
    h.notify("sdp", { sdp: "answer" });
    await first;
    h.request.mockResolvedValueOnce({});
    const stopping = h.voice.disconnect(id);
    const nextId = "2d15cb50-19ab-481d-9bea-a40fa1f50e54";
    const next = h.voice.connect("remote", nextId, "new-offer");
    h.notify("closed", { reason: "transport_closed" });
    await Promise.resolve();
    expect(h.request.mock.calls.filter((call) => call[0] === "thread/realtime/start")).toHaveLength(
      1,
    );
    h.notify("closed", { reason: "requested" });
    await stopping;
    await vi.waitFor(() =>
      expect(
        h.request.mock.calls.filter((call) => call[0] === "thread/realtime/start"),
      ).toHaveLength(2),
    );
    h.notify("started", { realtimeSessionId: nextId });
    h.notify("started", { realtimeSessionId: id });
    h.notify("sdp", { sdp: "new-answer" });
    await expect(next).resolves.toEqual({ answerSdp: "new-answer" });
    await h.voice.disconnect(nextId);
  });

  it("blocks reconnect when teardown never confirms its notification barrier", async () => {
    vi.useFakeTimers();
    const h = harness();
    const first = h.voice.connect("remote", id, "offer");
    await vi.advanceTimersByTimeAsync(0);
    h.notify("started", { realtimeSessionId: id });
    h.notify("sdp", { sdp: "answer" });
    await first;
    h.request.mockResolvedValueOnce({});
    const stopping = h.voice.disconnect(id);
    await vi.advanceTimersByTimeAsync(5_000);
    await stopping;
    await expect(h.voice.connect("remote", "new", "offer")).rejects.toThrow("unavailable");
  });

  it("negotiates WebRTC v3 on the existing thread and waits for its SDP", async () => {
    const h = harness();
    const result = h.voice.connect("remote", id, "offer");
    await requested(h);
    expect(h.request).toHaveBeenCalledWith("thread/realtime/start", {
      threadId: "remote",
      realtimeSessionId: id,
      version: "v3",
      outputModality: "audio",
      transport: { type: "webrtc", sdp: "offer" },
    });
    h.notify("started", { realtimeSessionId: id, version: "v3" });
    h.notify("sdp", { sdp: "answer" });
    await expect(result).resolves.toEqual({ answerSdp: "answer" });
    await h.voice.disconnect(id);
  });

  it("rejects API-key auth without starting a separately billed session", async () => {
    const h = harness();
    h.request.mockResolvedValue({ account: { type: "apiKey" } });
    await expect(h.voice.connect("remote", id, "offer")).rejects.toThrow("subscription sign-in");
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation before the first asynchronous preparation finishes", async () => {
    const h = harness();
    const result = h.voice.connect("remote", id, "offer");
    const rejected = result.catch((error: unknown) => error);
    const expectedMessage = "cancelled";
    await h.voice.disconnect(id);
    expect(await rejected).toEqual(
      expect.objectContaining({ message: expect.stringContaining(expectedMessage) }),
    );
    expect(h.request).not.toHaveBeenCalled();
  });

  it("does not start after cancellation during model/settings sync", async () => {
    const h = harness();
    let finish!: () => void;
    const prepare = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const result = h.voice.connect("remote", id, "offer", prepare);
    const rejected = result.catch((error: unknown) => error);
    const expectedMessage = "cancelled";
    await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
    await h.voice.disconnect(id);
    finish();
    expect(await rejected).toEqual(
      expect.objectContaining({ message: expect.stringContaining(expectedMessage) }),
    );
    expect(h.request.mock.calls.map((call) => call[0])).toEqual(["account/read"]);
  });

  it("treats asynchronous startup failure as failure even after an empty acknowledgement", async () => {
    const h = harness();
    const result = h.voice.connect("remote", id, "offer");
    const rejected = result.catch((error: unknown) => error);
    const expectedMessage = "The voice connection failed";
    await requested(h);
    h.notify("error", { message: "Voice unavailable for account" });
    expect(await rejected).toEqual(
      expect.objectContaining({ message: expect.stringContaining(expectedMessage) }),
    );
    expect(h.emit).toHaveBeenCalledWith({
      connectionId: id,
      type: "error",
      message: "The voice connection failed. Try again.",
    });
    expect(h.request).toHaveBeenCalledWith("thread/realtime/stop", { threadId: "remote" }, 5_000);
  });

  it("ignores another thread and stale start identities", async () => {
    const h = harness();
    const result = h.voice.connect("remote", id, "offer");
    await requested(h);
    const settled = vi.fn<(result: unknown) => void>();
    void result.then(settled);
    h.voice.handleNotification("thread/realtime/error", {
      threadId: "other",
      message: "wrong thread",
    });
    h.notify("started", { realtimeSessionId: "old" });
    h.notify("sdp", { sdp: "wrong answer" });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    h.notify("started", { realtimeSessionId: id });
    h.notify("sdp", { sdp: "right answer" });
    await expect(result).resolves.toEqual({ answerSdp: "right answer" });
    await h.voice.disconnect("old");
    expect(h.request).not.toHaveBeenCalledWith(
      "thread/realtime/stop",
      expect.anything(),
      expect.anything(),
    );
    await h.voice.disconnect(id);
  });

  it("drains final transcripts while stop is pending", async () => {
    const h = harness();
    const result = h.voice.connect("remote", id, "offer");
    await requested(h);
    h.notify("started", { realtimeSessionId: id });
    h.notify("sdp", { sdp: "answer" });
    await result;
    let finish!: () => void;
    h.request.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const stopping = h.voice.disconnect(id);
    h.notify("transcript/done", { role: "user", text: "Keep this final sentence." });
    expect(h.emitRuntime).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.started",
          itemType: "user_message",
          payload: expect.objectContaining({
            content: [{ kind: "text", text: "Keep this final sentence." }],
          }),
        }),
      ]),
    );
    finish();
    h.notify("closed", { reason: "requested" });
    await stopping;
    expect(h.emit).toHaveBeenLastCalledWith({ connectionId: id, type: "closed" });
  });

  it("times out a start that never supplies SDP and stops it", async () => {
    const h = harness();
    vi.useFakeTimers();
    const result = h.voice.connect("remote", id, "offer");
    const rejected = result.catch((error: unknown) => error);
    const expectedMessage = "timed out";
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await rejected).toEqual(
      expect.objectContaining({ message: expect.stringContaining(expectedMessage) }),
    );
    expect(h.request).toHaveBeenCalledWith("thread/realtime/stop", { threadId: "remote" }, 5_000);
  });
});

describe("Codex voice discovery", () => {
  const account = { account: { type: "chatgpt", planType: "team" } };
  const voices = { voices: { v1: ["cove"] } };
  it("requires a compatible CLI and a subscription account", () => {
    expect(
      supportsCodexLiveVoice({ userAgent: "poracode/0.153.4 (Windows)" }, account, voices),
    ).toBe(true);
    expect(
      supportsCodexLiveVoice({ userAgent: "poracode/0.149.0 (Windows)" }, account, voices),
    ).toBe(false);
    expect(
      supportsCodexLiveVoice({ userAgent: "poracode/0.130.0 (Windows)" }, account, voices),
    ).toBe(false);
    expect(
      supportsCodexLiveVoice(
        { userAgent: "poracode/0.153.4" },
        { account: { type: "apiKey" } },
        voices,
      ),
    ).toBe(false);
    expect(supportsCodexLiveVoice({}, account, voices)).toBe(false);
    expect(supportsCodexLiveVoice({ userAgent: "poracode/0.153.4" }, account, undefined)).toBe(
      false,
    );
  });
});
