import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePreview } from "@/shared/devicePreview";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { withThreadDeviceClient } from "./deviceClient";
import { createDevicePreviewTransport } from "./devicePreviewTransport";

const dispatch = vi.hoisted(() => ({
  invoke: vi.fn<(...args: Parameters<typeof withThreadDeviceClient>) => Promise<unknown>>(),
  input: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  video: vi.fn<(...args: unknown[]) => Promise<Response>>(),
}));
vi.mock("./deviceClient", () => ({
  withThreadDeviceClient: (...args: Parameters<typeof withThreadDeviceClient>) =>
    dispatch.invoke(...args),
}));
vi.mock("./devicePreviewSockets", () => ({
  openDeviceInputSocket: (...args: unknown[]) => dispatch.input(...args),
  openDeviceVideoResponse: (...args: unknown[]) => dispatch.video(...args),
}));
afterEach(() => vi.resetAllMocks());

function fixture(platform: "android" | "ios" = "android", access: "view" | "control" = "view") {
  const preview: DevicePreview = {
    version: 1,
    id: randomUUID(),
    generation: randomUUID(),
    sessionId: randomUUID(),
    platform,
    clientDeviceId: platform === "android" ? "emulator-5554" : randomUUID(),
    access,
    mode: "h264",
    expiresAt: Date.now() + 60_000,
  };
  const base = `https://parent.example/api/environments/child/proxy/api/threads/host-thread/devices/${preview.sessionId}/preview/v1/vendor/${platform === "android" ? "serve-emu" : "serve-sim"}`;
  const owner = {
    endpoint: "https://parent.example/api/environments/child/proxy/",
    devicePreviewBaseUrl: vi.fn<() => string>(() => base),
    devicePreviewMetadata: vi.fn<() => Promise<Response>>(async () => new Response("{}")),
    devicePreviewSocketUrl: vi.fn<() => Promise<string>>(
      async () => "wss://parent.example/bound-feature-channel",
    ),
  };
  let current = owner;
  let thread = "host-thread";
  dispatch.invoke.mockImplementation((_thread, callback) =>
    callback(current as unknown as RemoteDesktopClient, thread),
  );
  dispatch.input.mockResolvedValue({ fixture: "input" });
  dispatch.video.mockResolvedValue(new Response("video"));
  const lifetime = new AbortController();
  const transport = createDevicePreviewTransport(
    "local-thread",
    "host-thread",
    owner as unknown as RemoteDesktopClient,
    preview,
    lifetime.signal,
  );
  return {
    preview,
    base,
    owner,
    lifetime,
    transport,
    replace: (client: typeof owner, id = "host-thread") => {
      current = client;
      thread = id;
    },
  };
}

describe("public Hub client maintained transport seam", () => {
  it("resolves current host credentials for each allowed request and never forwards SDK headers", async () => {
    const f = fixture();
    const headers = { authorization: "Bearer sdk-not-authority", cookie: "sdk-not-authority" };
    await f.transport.fetch(`${f.base}/api?device=${f.preview.clientDeviceId}`, { headers });
    expect(f.owner.devicePreviewMetadata).toHaveBeenCalledWith(
      "host-thread",
      f.preview,
      "android-api",
      expect.any(AbortSignal),
    );
    const rotated = {
      ...f.owner,
      devicePreviewMetadata: vi.fn<() => Promise<Response>>(async () => new Response("{}")),
    };
    f.replace(rotated);
    await f.transport.fetch(`${f.base}/api/devices`);
    expect(rotated.devicePreviewMetadata).toHaveBeenCalledWith(
      "host-thread",
      f.preview,
      "android-devices",
      expect.any(AbortSignal),
    );
    expect(f.owner.devicePreviewMetadata).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(rotated.devicePreviewMetadata.mock.calls)).not.toContain(
      "sdk-not-authority",
    );
  });

  it("rejects endpoint, target, query, path and method escapes without network dispatch", async () => {
    const f = fixture();
    for (const raw of [
      "http://127.0.0.1:5555/api",
      `${f.base}/../../api`,
      `${f.base}/api?device=foreign`,
      `${f.base}/api?device=${f.preview.clientDeviceId}&device=${f.preview.clientDeviceId}`,
      `${f.base}/api?token=foreign`,
      `${f.base}/api#fragment`,
      f.base.replace("parent.example", "untrusted@parent.example") + "/api",
    ])
      await expect(f.transport.fetch(raw)).rejects.toMatchObject({
        code: "invalid_device_preview_resource",
      });
    expect(
      (await f.transport.fetch(`${f.base}/exec`, { method: "POST", body: "arbitrary" })).status,
    ).toBe(403);
    for (const optional of ["/logs", "/exec", "/config", "/api/settings", "/api/devices/boot"])
      expect((await f.transport.fetch(`${f.base}${optional}`)).status).toBe(404);
    expect(f.owner.devicePreviewMetadata).not.toHaveBeenCalled();
    expect(f.owner.devicePreviewSocketUrl).not.toHaveBeenCalled();
  });

  it("uses only paired selected Android input/media and gates the socket again by view consent", async () => {
    const f = fixture();
    const signal = new AbortController().signal;
    const raw =
      f.base.replace("https:", "wss:") + `/ws?device=${f.preview.clientDeviceId}&frame-meta=1`;
    expect(await f.transport.createWebSocket(raw, signal)).toEqual({ fixture: "input" });
    expect(f.owner.devicePreviewSocketUrl).toHaveBeenCalledWith(
      "host-thread",
      f.preview,
      "android",
      expect.any(AbortSignal),
    );
    expect(dispatch.input).toHaveBeenCalledWith(
      "wss://parent.example/bound-feature-channel",
      expect.any(AbortSignal),
      false,
    );
    expect(dispatch.input.mock.calls[0]![0]).not.toBe(raw);
  });

  it("gives iOS view only the dedicated video channel and permits typed input only with control", async () => {
    const f = fixture("ios");
    const helper = `${f.base}/helper/${f.preview.clientDeviceId}`;
    await f.transport.fetch(`${helper}/stream.avcc`);
    expect(f.owner.devicePreviewSocketUrl).toHaveBeenCalledWith(
      "host-thread",
      f.preview,
      "ios-video",
      expect.any(AbortSignal),
    );
    expect(dispatch.video).toHaveBeenCalledWith(
      "wss://parent.example/bound-feature-channel",
      expect.any(AbortSignal),
    );
    await expect(
      f.transport.createWebSocket(
        f.base.replace("https:", "wss:") + "/helper/ws",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(dispatch.input).not.toHaveBeenCalled();
    const control = fixture("ios", "control");
    await control.transport.createWebSocket(
      control.base.replace("https:", "wss:") + "/helper/ws",
      new AbortController().signal,
    );
    expect(dispatch.input).toHaveBeenCalledWith(
      "wss://parent.example/bound-feature-channel",
      expect.any(AbortSignal),
      true,
    );
  });

  it("refuses a changed thread/host and cancellation before opening any new transport", async () => {
    const f = fixture();
    f.replace({ ...f.owner, endpoint: "https://different.example" });
    await expect(f.transport.fetch(`${f.base}/api`)).rejects.toMatchObject({ status: 410 });
    f.replace(f.owner, "replacement-thread");
    await expect(f.transport.fetch(`${f.base}/api`)).rejects.toMatchObject({ status: 410 });
    f.replace(f.owner);
    f.lifetime.abort();
    await expect(f.transport.fetch(`${f.base}/api`)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.owner.devicePreviewMetadata).not.toHaveBeenCalled();
    expect(f.owner.devicePreviewSocketUrl).not.toHaveBeenCalled();
  });
});
