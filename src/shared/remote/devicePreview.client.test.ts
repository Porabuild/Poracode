import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ENVIRONMENT_AUTHORIZATION_HEADER } from "../environments";
import type { DevicePreview } from "../devicePreview";
import { RemoteDesktopClient } from "./client";
import { RemoteClientError } from "./clientErrors";
import {
  RemoteEnvironmentClient,
  REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR,
} from "./clientEnvironments";
import { supportsDeviceLivePreview } from "./clientDevicePreview";
import {
  remoteEnvironmentCapabilitiesSchema,
  type RemoteEnvironmentDescriptor,
} from "./protocol/core";
import {
  accessTokenResponse,
  errorResponse,
  jsonResponse,
  scriptedFetch,
  testAuthority,
  testChildLifecycle,
  testEnvironmentEndpoint,
  TEST_ENVIRONMENT_ID,
} from "./clientEnvironments.testSupport";

function preview(platform: "android" | "ios" = "android"): DevicePreview {
  return {
    version: 1,
    id: randomUUID(),
    generation: randomUUID(),
    sessionId: randomUUID(),
    platform,
    clientDeviceId: platform === "android" ? "emulator-5554" : randomUUID(),
    access: "view",
    mode: "h264",
    expiresAt: Date.now() + 60_000,
  };
}
function ticket(value: string) {
  return jsonResponse({
    version: 1,
    ticket: `dwp1_${value.repeat(43)}`,
    expiresAt: Date.now() + 30_000,
  });
}

describe("negotiated feature-only preview transport", () => {
  it("preserves the exact pre-preview capability reader and ignores unsupported versions/modes", () => {
    const live = { versions: [1], livePreview: { versions: [1], modes: ["h264"] } };
    // This is the cleared snapshot-v1 reader: z.object strips unknown fields.
    const previous = z.object({ versions: z.array(z.number().int().positive()).min(1) });
    expect(previous.parse(live)).toEqual({ versions: [1] });
    expect(supportsDeviceLivePreview({} as RemoteEnvironmentDescriptor)).toBe(false);
    const supports = (value: unknown) =>
      supportsDeviceLivePreview({
        capabilities: remoteEnvironmentCapabilitiesSchema.parse(value),
      } as RemoteEnvironmentDescriptor);
    expect(supports({ deviceWorkspace: live })).toBe(true);
    for (const capabilities of [
      {},
      { deviceWorkspace: { versions: [1] } },
      { deviceWorkspace: { versions: [2], livePreview: live.livePreview } },
      { deviceWorkspace: { versions: [1], livePreview: { versions: [2], modes: ["h264"] } } },
      { deviceWorkspace: { versions: [1], livePreview: { versions: [1], modes: ["future"] } } },
    ])
      expect(supports(capabilities)).toBe(false);
  });

  it("uses authenticated enumerated metadata/POST close paths without exposing helper endpoints", async () => {
    const scripted = scriptedFetch([
      () =>
        jsonResponse({
          size: { width: 100, height: 200 },
          stream: { transport: "websocket", token: "private" },
          url: "http://127.0.0.1:1",
          execToken: "private",
        }),
      () => jsonResponse({ ok: true }),
    ]);
    const client = new RemoteDesktopClient(
      testEnvironmentEndpoint(),
      "child-access",
      scripted.fetchImpl,
    );
    const value = preview();
    const metadata = await client.devicePreviewMetadata(
      "thread/a",
      value,
      "android-api",
      new AbortController().signal,
    );
    expect(await metadata.json()).toEqual({
      size: { width: 100, height: 200 },
      stream: { transport: "websocket" },
    });
    expect(metadata.headers.get("cache-control")).toBe("no-store");
    await client.closeDevicePreview("thread/a", value);
    expect(scripted.requests.map((request) => request.url.pathname)).toEqual([
      `/api/environments/${TEST_ENVIRONMENT_ID}/proxy/api/threads/thread%2Fa/devices/${value.sessionId}/preview/v1/vendor/serve-emu/api`,
      `/api/environments/${TEST_ENVIRONMENT_ID}/proxy/api/threads/thread%2Fa/devices/${value.sessionId}/preview/v1/close`,
    ]);
    expect(scripted.requests[0]!.url.searchParams.get("previewId")).toBe(value.id);
    expect(scripted.requests[0]!.headers.authorization).toBe("Bearer child-access");
    expect(scripted.requests[1]).toMatchObject({
      method: "POST",
      body: { version: 1, previewId: value.id },
    });
  });

  it("keeps lease identity through child token refresh and mints a fresh feature ticket on reconnect", async () => {
    const scripted = scriptedFetch([
      () => errorResponse(401, "invalid_access_token"),
      () => accessTokenResponse("rotated-child", "rotated-refresh"),
      () => ticket("a"),
      () => ticket("b"),
    ]);
    const lifecycle = testChildLifecycle();
    const client = new RemoteDesktopClient(
      "https://host.example",
      "old-child",
      scripted.fetchImpl,
      { tokenLifecycle: lifecycle.lifecycle },
    );
    const value = preview();
    const first = new URL(
      await client.devicePreviewSocketUrl(
        "thread-a",
        value,
        "android",
        new AbortController().signal,
      ),
    );
    const second = new URL(
      await client.devicePreviewSocketUrl(
        "thread-a",
        value,
        "android",
        new AbortController().signal,
      ),
    );
    expect(first.protocol).toBe("wss:");
    expect(first.pathname).toBe(second.pathname);
    expect(first.searchParams.get("ticket")).not.toBe(second.searchParams.get("ticket"));
    expect(first.searchParams.get("device")).toBe(value.clientDeviceId);
    expect(scripted.requests[1]!.url.pathname).toBe("/oauth/token");
    expect(scripted.requests[2]!.headers.authorization).toBe("Bearer rotated-child");
    expect(scripted.requests[2]!.body).toEqual({
      version: 1,
      previewId: value.id,
      channel: "android",
    });
    expect(scripted.requests[3]!.headers.authorization).toBe("Bearer rotated-child");
  });

  it("pairs independent parent and child grants per exact channel/open even when mints finish out of order", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    const scripted = scriptedFetch([() => first.promise, () => second.promise, () => ticket("c")]);
    const parent = testAuthority();
    const client = new RemoteEnvironmentClient(
      testEnvironmentEndpoint(),
      "child-access",
      scripted.fetchImpl,
      {
        environmentId: TEST_ENVIRONMENT_ID,
        parentAuthority: parent.authority,
      },
    );
    const value = preview("ios");
    const video = client.devicePreviewSocketUrl(
      "thread-a",
      value,
      "ios-video",
      new AbortController().signal,
    );
    const input = client.devicePreviewSocketUrl(
      "thread-a",
      { ...value, access: "control" },
      "ios",
      new AbortController().signal,
    );
    second.resolve(ticket("b"));
    const inputUrl = new URL(await input);
    first.resolve(ticket("a"));
    const videoUrl = new URL(await video);
    expect(inputUrl.searchParams.get("parentTicket")).toBe("parent-ws-1");
    expect(videoUrl.searchParams.get("parentTicket")).toBe("parent-ws-2");
    expect(inputUrl.searchParams.get("ticket")).toBe(`dwp1_${"b".repeat(43)}`);
    expect(videoUrl.searchParams.get("ticket")).toBe(`dwp1_${"a".repeat(43)}`);
    expect(videoUrl.pathname.endsWith("/vendor/serve-sim/helper/video-ws")).toBe(true);
    expect(videoUrl.pathname.startsWith(`/api/environments/${TEST_ENVIRONMENT_ID}/proxy/`)).toBe(
      true,
    );
    const reconnect = new URL(
      await client.devicePreviewSocketUrl(
        "thread-a",
        value,
        "ios-video",
        new AbortController().signal,
      ),
    );
    expect(reconnect.searchParams.get("parentTicket")).toBe("parent-ws-3");
    expect(
      scripted.requests.every(
        (request) =>
          request.headers[ENVIRONMENT_AUTHORIZATION_HEADER] === "Bearer parent-access" &&
          request.headers.authorization === "Bearer child-access",
      ),
    ).toBe(true);
  });

  it("does not open a channel after cancellation, expired tickets or parent revocation", async () => {
    const held = Promise.withResolvers<{ ticket: string; expiresAt: string }>();
    const mintWebSocketTicket = vi.fn<() => Promise<{ ticket: string; expiresAt: string }>>(
      () => held.promise,
    );
    const parent = testAuthority({ mintWebSocketTicket });
    const scripted = scriptedFetch([() => ticket("a")]);
    const client = new RemoteEnvironmentClient(
      testEnvironmentEndpoint(),
      "child-access",
      scripted.fetchImpl,
      {
        environmentId: TEST_ENVIRONMENT_ID,
        parentAuthority: parent.authority,
      },
    );
    const abort = new AbortController();
    const pending = client.devicePreviewSocketUrl("thread-a", preview(), "android", abort.signal);
    const rejected = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(mintWebSocketTicket).toHaveBeenCalledTimes(1));
    abort.abort();
    held.resolve({ ticket: "parent-late", expiresAt: "2099-01-01T00:00:00.000Z" });
    expect(await rejected).toMatchObject({ status: 499 });
    const rejectedParent = testAuthority({
      mintWebSocketTicket: async () => {
        throw new RemoteClientError("Revoked", 401, "invalid_access_token");
      },
    });
    const next = new RemoteEnvironmentClient(
      testEnvironmentEndpoint(),
      "child-access",
      scriptedFetch([() => ticket("b")]).fetchImpl,
      {
        environmentId: TEST_ENVIRONMENT_ID,
        parentAuthority: rejectedParent.authority,
      },
    );
    await expect(
      next.devicePreviewSocketUrl("thread-a", preview(), "android", new AbortController().signal),
    ).rejects.toMatchObject({ code: REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR });
    const expired = new RemoteDesktopClient(
      "https://host.example",
      "child-access",
      scriptedFetch([
        () =>
          jsonResponse({ version: 1, ticket: `dwp1_${"c".repeat(43)}`, expiresAt: Date.now() - 1 }),
      ]).fetchImpl,
    );
    await expect(
      expired.devicePreviewSocketUrl(
        "thread-a",
        preview(),
        "android",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("refuses changed renewed identities and platform mismatches before selecting another route", async () => {
    const value = preview();
    const scripted = scriptedFetch([() => jsonResponse({ ...value, platform: "ios" })]);
    const client = new RemoteDesktopClient(
      "https://host.example",
      "child-access",
      scripted.fetchImpl,
    );
    await expect(
      client.renewDevicePreview("thread-a", value, new AbortController().signal),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      client.devicePreviewSocketUrl("thread-a", value, "ios-video", new AbortController().signal),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      client.devicePreviewMetadata("thread-a", value, "ios-config", new AbortController().signal),
    ).rejects.toMatchObject({ status: 400 });
    expect(scripted.requests).toHaveLength(1);
  });
});
