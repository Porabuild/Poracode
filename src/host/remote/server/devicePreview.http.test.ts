import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { DeviceHubHandle, DeviceHubRuntime } from "@/host/devices/DeviceHubRuntime";
import type { DeviceDriver } from "@/host/devices/NativeDeviceDriver";
import { DeviceWorkspaceService } from "@/host/devices/DeviceWorkspaceService";
import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
  devicePreviewSchema,
  devicePreviewTicketSchema,
  type DevicePreview,
  type DevicePreviewChannel,
} from "@/shared/devicePreview";
import { deviceSessionSchema } from "@/shared/deviceWorkspace";
import {
  remoteAccessTokenResultSchema,
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { baseOptions, startParentHost } from "../environments/environmentProxyTestFixtures";
import { RemoteAccessServer } from "../RemoteAccessServer";
import { RemoteAuthStore, RemoteHttpError } from "../auth";
import { PrincipalAdmissionController } from "./principalAdmission";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(
  platform: "android" | "ios" = "android",
  access: "view" | "control" = "view",
) {
  const privateToken = "fixture-helper-only";
  const helperRequests: {
    path: string;
    authorization: string | undefined;
    cookie: string | undefined;
  }[] = [];
  const input: { data: Buffer; binary: boolean }[] = [];
  const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  let stream: ServerResponse | undefined;
  let streamClosed = 0;
  const helper = createServer((req, res) => {
    helperRequests.push({
      path: req.url!,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
    });
    if (req.headers.authorization !== `Bearer ${privateToken}`) {
      res.writeHead(401).end();
      return;
    }
    if (req.url?.endsWith("/stream.avcc")) {
      stream = res;
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.flushHeaders();
      res.once("close", () => streamClosed++);
      return;
    }
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        size: { width: 100, height: 200 },
        width: 100,
        height: 200,
        secret: "discarded",
        url: "http://127.0.0.1:1/private",
      }),
    );
  });
  helper.on("upgrade", (req, socket, head) => {
    helperRequests.push({
      path: req.url!,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
    });
    if (req.headers.authorization !== `Bearer ${privateToken}`) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit("connection", ws, req));
  });
  sockets.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    ws.on("message", (data, binary) => input.push({ data: Buffer.from(data as Buffer), binary }));
    ws.on("error", () => {});
    if (platform === "android")
      ws.send(
        JSON.stringify({
          type: "video-session",
          size: { width: 100, height: 200 },
          private: "discarded",
        }),
      );
    else {
      ws.send(
        Buffer.concat([
          Buffer.from([0x82]),
          Buffer.from(JSON.stringify({ width: 100, height: 200, private: "discarded" })),
        ]),
      );
      ws.send(Buffer.from([0x83]));
    }
  });
  await new Promise<void>((resolve) => helper.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
    helper.closeAllConnections();
    await new Promise<void>((resolve) => helper.close(() => resolve()));
  });
  const origin = `http://127.0.0.1:${(helper.address() as AddressInfo).port}`;
  const releases = vi.fn<() => Promise<void>>(async () => {});
  const runtime = {
    prepare: async () => {},
    platforms: () => [platform],
    dispose: async () => {},
    acquire: async (): Promise<DeviceHubHandle> => {
      const controller = new AbortController();
      let released = false;
      return {
        origin,
        token: privateToken,
        signal: controller.signal,
        release: async () => {
          if (!released) {
            released = true;
            controller.abort();
            await releases();
          }
        },
      };
    },
  };
  const nativeId = platform === "android" ? "emulator-5554" : randomUUID();
  const driver: DeviceDriver = {
    discover: async () => ({
      platforms: [{ platform, status: "ready" }],
      devices: [
        {
          id: `${platform}:Fixture`,
          platform,
          name: "Fixture",
          state: "running",
          input: true,
          accessibility: true,
        },
      ],
    }),
    streamTarget: async () => ({
      clientDeviceId: nativeId,
      bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
    }),
    capture: vi.fn<DeviceDriver["capture"]>(async () => {
      throw new Error("Unexpected snapshot during live transport test");
    }),
    inspect: async () => ({ version: 1, format: "android-uiautomator-xml", text: "<hierarchy/>" }),
    input: vi.fn<() => Promise<void>>(async () => {}),
    start: vi.fn<() => Promise<void>>(async () => {}),
    release: vi.fn<() => Promise<void>>(async () => {}),
    dispose: async () => {},
  };
  const devices = new DeviceWorkspaceService(
    (id) => id === "thread-a",
    driver,
    Date.now,
    runtime as unknown as DeviceHubRuntime,
  );
  cleanups.push(() => devices.dispose());
  await devices.preparePreview();
  const auth = new RemoteAuthStore();
  const server = new RemoteAccessServer(baseOptions({ authStore: auth, deviceWorkspace: devices }));
  cleanups.push(() => server.dispose());
  const info = await server.start();
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const tokens = remoteAccessTokenResultSchema.parse(
    await (
      await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grantType: "pairing-token",
          credential,
          scopes: ["session:read", "session:operate"],
        }),
      })
    ).json(),
  );
  let bearer = tokens.accessToken;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    return fetch(new URL(path, info.httpBaseUrl), {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  await devices.discover();
  const session = deviceSessionSchema.parse(
    await (
      await request("/api/threads/thread-a/devices", "POST", {
        version: 1,
        generation: devices.generation,
        deviceId: `${platform}:Fixture`,
        access,
        agentAccess: "none",
      })
    ).json(),
  );
  const root = `/api/threads/thread-a/devices/${session.id}/preview/v1`;
  const open = async () =>
    devicePreviewSchema.parse(
      await (await request(root, "POST", { version: 1, generation: devices.generation })).json(),
    );
  async function ticket(preview: DevicePreview, channel: DevicePreviewChannel) {
    const response = await request(`${root}/websocket-ticket`, "POST", {
      version: 1,
      previewId: preview.id,
      channel,
    });
    return devicePreviewTicketSchema.parse(await response.json()).ticket;
  }
  function url(value: DevicePreview, grant: string, channel: DevicePreviewChannel) {
    const suffix =
      channel === "android"
        ? "serve-emu/ws"
        : channel === "ios"
          ? "serve-sim/helper/ws"
          : "serve-sim/helper/video-ws";
    const socket = new URL(`${root}/vendor/${suffix}`, info.httpBaseUrl);
    socket.protocol = "ws:";
    socket.searchParams.set("ticket", grant);
    socket.searchParams.set("device", value.clientDeviceId);
    return socket;
  }
  async function connect(
    value: DevicePreview,
    grant: string,
    channel: DevicePreviewChannel,
    socketUrl = url(value, grant, channel),
    autoCredit = true,
  ) {
    const ws = new WebSocket(socketUrl, {
      headers: { cookie: "client-cookie", authorization: "client-header-must-not-reach-helper" },
    });
    cleanups.push(async () => {
      if (ws.readyState !== WebSocket.CLOSED)
        await new Promise<void>((resolve) => {
          ws.once("close", resolve);
          ws.terminate();
        });
    });
    const messages: { data: Buffer; binary: boolean }[] = [];
    ws.on("message", (data, binary) =>
      messages.push({ data: Buffer.from(data as Buffer), binary }),
    );
    ws.on("error", () => {});
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    if (autoCredit)
      ws.send(
        JSON.stringify({
          type: "device-preview-credit",
          version: 1,
          bytes: DEVICE_PREVIEW_MAX_BUFFER_BYTES,
          packets: DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
        }),
      );
    return { ws, messages };
  }
  return {
    devices,
    auth,
    server,
    info,
    driver,
    request,
    session,
    root,
    open,
    ticket,
    url,
    connect,
    releases,
    helperRequests,
    input,
    stream: () => stream,
    streamClosed: () => streamClosed,
    helperSocketCount: () => sockets.clients.size,
    rotate: async () => {
      const refreshed = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "refresh_token", refreshToken: tokens.refreshToken }),
      });
      bearer = remoteAccessTokenResultSchema.parse(await refreshed.json()).accessToken;
      return auth.authenticateBearerToken(bearer).sessionId;
    },
    principal: auth.authenticateBearerToken(bearer).sessionId,
  };
}

describe("real authenticated preview HTTP/WS boundary with pinned-wire fake helpers", () => {
  it("negotiates without changing strict host-control, sanitizes metadata and closes only exact preview resources", async () => {
    const f = await fixture();
    const descriptor = await (await f.request("/.well-known/poracode/environment")).json();
    expect(descriptor.capabilities.deviceWorkspace).toEqual({
      versions: [1],
      livePreview: { versions: [1], modes: ["h264"] },
    });
    expect((await (await f.request("/api/host/describe")).json()).capabilities).not.toHaveProperty(
      "deviceWorkspace",
    );
    const first = await f.open();
    const metadata = await f.request(
      `${f.root}/vendor/serve-emu/api?previewId=${first.id}&device=${first.clientDeviceId}`,
    );
    expect(metadata.headers.get("cache-control")).toBe("no-store");
    expect(await metadata.json()).toEqual({
      size: { width: 100, height: 200 },
      stream: { transport: "websocket" },
    });
    expect(
      (await f.request(`${f.root}/close`, "POST", { version: 2, previewId: first.id })).status,
    ).toBe(400);
    expect(
      (await f.request(`${f.root}/close`, "POST", { version: 1, previewId: first.id })).status,
    ).toBe(200);
    expect(f.releases).toHaveBeenCalledTimes(1);
    expect(f.driver.release).not.toHaveBeenCalled();
    const next = await f.open();
    expect(next.id).not.toBe(first.id);
    expect(
      (await f.request(`${f.root}/close`, "POST", { version: 1, previewId: first.id })).status,
    ).toBe(410);
    expect(
      (await f.request(`${f.root}/renew`, "POST", { version: 1, previewId: next.id })).status,
    ).toBe(200);
    expect(f.releases).toHaveBeenCalledTimes(1);
    expect(() => f.devices.agentSession("thread-a")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("preserves view/control separation, consumes tickets once and never forwards client credentials to the helper", async () => {
    const f = await fixture();
    const preview = await f.open();
    const grant = await f.ticket(preview, "android");
    const channel = await f.connect(preview, grant, "android");
    await vi.waitFor(() => expect(channel.messages.length).toBeGreaterThanOrEqual(2));
    const epoch = JSON.parse(channel.messages[0]!.data.toString()).epoch as string;
    expect(JSON.parse(channel.messages[1]!.data.toString())).toEqual({
      type: "video-session",
      size: { width: 100, height: 200 },
    });
    channel.ws.send(
      JSON.stringify({ version: 1, epoch, binary: false, data: '{"type":"reset-video"}' }),
    );
    await vi.waitFor(() => expect(f.input).toHaveLength(1));
    expect(JSON.parse(f.input[0]!.data.toString())).toEqual({ type: "reset-video", ack: false });
    const closed = new Promise<void>((resolve) => channel.ws.once("close", resolve));
    channel.ws.send(
      JSON.stringify({
        version: 1,
        epoch,
        binary: false,
        data: '{"type":"key","keycode":29,"action":"down"}',
      }),
    );
    await closed;
    expect(f.input).toHaveLength(1);
    expect(
      f.helperRequests.every(
        (request) =>
          request.authorization === "Bearer fixture-helper-only" && request.cookie === undefined,
      ),
    ).toBe(true);
    const reused = new WebSocket(f.url(preview, grant, "android"));
    const status = await new Promise<number>((resolve) => {
      reused.once("unexpected-response", (_req, res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      reused.on("error", () => {});
    });
    reused.terminate();
    expect(status).toBe(401);
  });

  it("preserves existing browser preflight and foreign-origin rejection for preview close", async () => {
    const f = await fixture();
    const preview = await f.open();
    const preflight = await fetch(new URL(`${f.root}/close`, f.info.httpBaseUrl), {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": `authorization, content-type, ${REMOTE_PROTOCOL_VERSION_HEADER}`,
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")?.split(/,\s*/u)).toContain("POST");
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(
      (
        await f.request(
          `${f.root}/close`,
          "POST",
          { version: 1, previewId: preview.id },
          { origin: "https://untrusted.invalid" },
        )
      ).status,
    ).toBe(403);
    expect(f.releases).not.toHaveBeenCalled();
    expect(
      (await f.request(`${f.root}/renew`, "POST", { version: 1, previewId: preview.id })).status,
    ).toBe(200);
  });

  it("requires independent fresh parent and child tickets on the environment proxy and joins parent revocation", async () => {
    const f = await fixture();
    const parent = await startParentHost(cleanups);
    parent.targets.connect("env-a", Number(new URL(f.info.httpBaseUrl).port));
    const preview = await f.open();
    const mintParent = () =>
      parent.gateway.mintWebSocketTicket({
        parentAccessToken: parent.parentAccessToken,
        environmentId: "env-a",
      }).ticket;
    const proxyUrl = (child: string, parentTicket?: string) => {
      const target = f.url(preview, child, "android");
      const result = new URL(
        `/api/environments/env-a/proxy${target.pathname}${target.search}`,
        parent.info.httpBaseUrl,
      );
      result.protocol = "ws:";
      if (parentTicket !== undefined) result.searchParams.set("parentTicket", parentTicket);
      return result;
    };
    async function rejected(socketUrl: URL) {
      const socket = new WebSocket(socketUrl);
      socket.on("error", () => {});
      try {
        return await new Promise<number>((resolve, reject) => {
          socket.once("unexpected-response", (_req, response) => {
            response.resume();
            resolve(response.statusCode!);
          });
          socket.once("open", () => reject(new Error("Unauthorized preview socket opened")));
          socket.once("error", reject);
        });
      } finally {
        socket.terminate();
      }
    }
    const child = await f.ticket(preview, "android");
    expect(await rejected(proxyUrl(child))).toBe(401);
    expect(await rejected(proxyUrl(child, parent.parentAccessToken))).toBe(401);
    expect(await rejected(proxyUrl("dwp1_invalid", mintParent()))).toBe(401);
    const firstParent = mintParent();
    const first = await f.connect(preview, child, "android", proxyUrl(child, firstParent));
    await vi.waitFor(() => expect(first.messages.length).toBeGreaterThanOrEqual(2));
    const firstClosed = new Promise<void>((resolve) => first.ws.once("close", resolve));
    first.ws.close();
    await firstClosed;
    expect(await rejected(proxyUrl(await f.ticket(preview, "android"), firstParent))).toBe(401);
    expect(await rejected(proxyUrl(child, mintParent()))).toBe(401);
    const nextChild = await f.ticket(preview, "android");
    const next = await f.connect(preview, nextChild, "android", proxyUrl(nextChild, mintParent()));
    await vi.waitFor(() => expect(next.messages.length).toBeGreaterThanOrEqual(2));
    expect(
      f.helperRequests.every(
        (request) =>
          !request.path.includes("parentTicket") &&
          request.authorization === "Bearer fixture-helper-only" &&
          request.cookie === undefined,
      ),
    ).toBe(true);
    const nextClosed = new Promise<void>((resolve) => next.ws.once("close", resolve));
    expect(
      parent.server.revokeAccessSession(
        parent.authenticateParent(parent.parentAccessToken).sessionId,
      ),
    ).toBe(true);
    await nextClosed;
    expect(
      (await f.request(`${f.root}/renew`, "POST", { version: 1, previewId: preview.id })).status,
    ).toBe(200);
    expect(f.driver.release).not.toHaveBeenCalled();
  });

  it("keeps the same preview through refresh but retires input/media after session revocation", async () => {
    const f = await fixture("android", "control");
    const preview = await f.open();
    expect(await f.rotate()).toBe(f.principal);
    const channel = await f.connect(preview, await f.ticket(preview, "android"), "android");
    await vi.waitFor(() => expect(channel.messages.length).toBeGreaterThanOrEqual(2));
    const epoch = JSON.parse(channel.messages[0]!.data.toString()).epoch as string;
    channel.ws.send(
      JSON.stringify({
        version: 1,
        epoch,
        binary: false,
        data: '{"type":"touch","action":"down","x":0.2,"y":0.3}',
      }),
    );
    await vi.waitFor(() => expect(f.input).toHaveLength(1));
    const closed = new Promise<void>((resolve) => channel.ws.once("close", resolve));
    expect(f.server.revokeAccessSession(f.principal)).toBe(true);
    channel.ws.send(
      JSON.stringify({
        version: 1,
        epoch,
        binary: false,
        data: '{"type":"text","text":"must not be delivered"}',
      }),
    );
    await closed;
    await vi.waitFor(() => expect(f.input).toHaveLength(2));
    expect(JSON.parse(f.input[1]!.data.toString())).toMatchObject({ type: "touch", action: "up" });
    expect(f.input.some((packet) => packet.data.toString().includes("must not be delivered"))).toBe(
      false,
    );
  });

  it("fences replacement input and capture behind the old lease's held preview cleanup", async () => {
    const f = await fixture("android", "control");
    const first = await f.open();
    const owner = await f.devices.previewConnection(
      "thread-a",
      f.principal,
      f.session.id,
      first.id,
    );
    const held = Promise.withResolvers<void>();
    const stop = vi.fn<() => Promise<void>>(() => held.promise);
    owner.ownResource("video", stop);
    const retiring = f.devices.detach("thread-a", f.principal, f.session.id);
    let action: Promise<void> | undefined;
    let opening: Promise<unknown> | undefined;
    try {
      await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
      expect(f.driver.release).not.toHaveBeenCalled();
      const next = await f.devices.attach(
        "thread-a",
        f.principal,
        {
          version: 1,
          generation: f.devices.generation,
          deviceId: f.session.device.id,
          access: "control",
          agentAccess: "none",
        },
        () => {
          f.auth.authenticateSession(f.principal, ["session:read", "session:operate"]);
        },
      );
      action = f.devices
        .action("thread-a", f.principal, next.id, { kind: "key", key: "home" })
        .then(() => {});
      let reopened = false;
      opening = f.devices
        .openPreview(
          "thread-a",
          f.principal,
          next.id,
          { version: 1, generation: next.generation },
          new AbortController().signal,
        )
        .then(() => {
          reopened = true;
        });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(f.driver.input).not.toHaveBeenCalled();
      expect(reopened).toBe(false);
      expect(f.releases).not.toHaveBeenCalled();
      held.resolve();
      await retiring;
      await action;
      await opening;
      expect(f.driver.input).toHaveBeenCalledTimes(1);
      expect(reopened).toBe(true);
      expect(f.releases).toHaveBeenCalledTimes(1);
      expect(f.driver.release).not.toHaveBeenCalled();
    } finally {
      held.resolve();
      await Promise.allSettled([
        retiring,
        ...(action ? [action] : []),
        ...(opening ? [opening] : []),
      ]);
    }
  });

  it("joins the stalled helper socket when accumulated reader credit exceeds its fixed window", async () => {
    const f = await fixture();
    const preview = await f.open();
    const channel = await f.connect(
      preview,
      await f.ticket(preview, "android"),
      "android",
      undefined,
      false,
    );
    await vi.waitFor(() => expect(channel.messages).toHaveLength(1));
    expect(f.helperSocketCount()).toBe(1);
    const closed = new Promise<void>((resolve) => channel.ws.once("close", resolve));
    const credit = JSON.stringify({
      type: "device-preview-credit",
      version: 1,
      bytes: DEVICE_PREVIEW_MAX_BUFFER_BYTES,
      packets: DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
    });
    channel.ws.send(credit);
    channel.ws.send(credit);
    await closed;
    await vi.waitFor(() => expect(f.helperSocketCount()).toBe(0));
    expect(f.input).toHaveLength(0);
    expect(
      (await f.request(`${f.root}/renew`, "POST", { version: 1, previewId: preview.id })).status,
    ).toBe(200);
  });

  it.each(["touch-down", "key-up"] as const)(
    "tracks only admitted presses when work admission denies %s",
    async (kind) => {
      const f = await fixture("android", "control");
      const preview = await f.open();
      const channel = await f.connect(preview, await f.ticket(preview, "android"), "android");
      await vi.waitFor(() => expect(channel.messages.length).toBeGreaterThanOrEqual(2));
      const epoch = JSON.parse(channel.messages[0]!.data.toString()).epoch as string;
      const send = (value: unknown) =>
        channel.ws.send(
          JSON.stringify({ version: 1, epoch, binary: false, data: JSON.stringify(value) }),
        );
      if (kind === "key-up") {
        send({ type: "key", keycode: 29, action: "down" });
        await vi.waitUntil(() => f.input.length === 1);
      }
      const denied = vi
        .spyOn(PrincipalAdmissionController.prototype, "tryAdmitWork")
        .mockImplementationOnce(() => {
          throw new RemoteHttpError("principal_busy", "Fixture principal is at capacity.", 429);
        });
      try {
        const closed = new Promise<void>((resolve) => channel.ws.once("close", resolve));
        send(
          kind === "key-up"
            ? { type: "key", keycode: 29, action: "up" }
            : { type: "touch", action: "down", x: 0.2, y: 0.3 },
        );
        await closed;
        await vi.waitFor(() => expect(f.helperSocketCount()).toBe(0));
        expect(denied).toHaveBeenCalledTimes(1);
        expect(f.input.map((packet) => JSON.parse(packet.data.toString()))).toEqual(
          kind === "key-up"
            ? [
                { type: "key", keycode: 29, action: "down", ack: false, record: false },
                { type: "key", keycode: 29, action: "up", ack: false, record: false },
              ]
            : [],
        );
      } finally {
        denied.mockRestore();
      }
    },
  );

  it("denies wrong-thread tickets and stale geometry without reaching input", async () => {
    const f = await fixture("android", "control");
    const preview = await f.open();
    const wrongThread = f.root.replace("thread-a", "thread-b");
    expect(
      (
        await f.request(`${wrongThread}/websocket-ticket`, "POST", {
          version: 1,
          previewId: preview.id,
          channel: "android",
        })
      ).status,
    ).toBe(410);
    expect(
      (
        await f.request(`${f.root}/websocket-ticket`, "POST", {
          version: 1,
          previewId: preview.id,
          channel: "ios",
        })
      ).status,
    ).toBe(400);
    const channel = await f.connect(preview, await f.ticket(preview, "android"), "android");
    await vi.waitFor(() => expect(channel.messages.length).toBeGreaterThanOrEqual(2));
    const closed = new Promise<void>((resolve) => channel.ws.once("close", resolve));
    channel.ws.send(
      JSON.stringify({
        version: 1,
        epoch: randomUUID(),
        binary: false,
        data: '{"type":"key","keycode":29}',
      }),
    );
    await closed;
    expect(f.input).toHaveLength(0);
  });

  it("keeps iOS video input-free and joins upstream AVCC cancellation while preserving the lease", async () => {
    const f = await fixture("ios");
    const preview = await f.open();
    expect(
      (
        await f.request(`${f.root}/websocket-ticket`, "POST", {
          version: 1,
          previewId: preview.id,
          channel: "ios",
        })
      ).status,
    ).toBe(403);
    const channel = await f.connect(preview, await f.ticket(preview, "ios-video"), "ios-video");
    await vi.waitFor(() => expect(f.stream()).toBeDefined());
    const packet = Buffer.from([0, 0, 0, 3, 1, 7, 8]);
    f.stream()!.write(packet.subarray(0, 2));
    f.stream()!.write(packet.subarray(2));
    await vi.waitFor(() =>
      expect(Buffer.concat(channel.messages.map((message) => message.data))).toEqual(packet),
    );
    const closed = new Promise<void>((resolve) => channel.ws.once("close", resolve));
    channel.ws.send(Buffer.from([0x06, 1]));
    await closed;
    await vi.waitFor(() => expect(f.streamClosed()).toBe(1));
    expect(f.input).toHaveLength(0);
    expect(
      (await f.request(`${f.root}/renew`, "POST", { version: 1, previewId: preview.id })).status,
    ).toBe(200);
    expect(f.driver.release).not.toHaveBeenCalled();
  });

  it.each(["oversized", "truncated"] as const)(
    "joins an %s upstream AVCC failure without retaining capture transport",
    async (kind) => {
      const f = await fixture("ios");
      const preview = await f.open();
      const channel = await f.connect(preview, await f.ticket(preview, "ios-video"), "ios-video");
      await vi.waitFor(() => expect(f.stream()).toBeDefined());
      const closed = new Promise<void>((resolve) => channel.ws.once("close", resolve));
      if (kind === "oversized") f.stream()!.write(Buffer.from([0x7f, 0xff, 0xff, 0xff]));
      else f.stream()!.end(Buffer.from([0, 0, 0, 3, 1]));
      await closed;
      await vi.waitFor(() => expect(f.streamClosed()).toBe(1));
      expect(
        (await f.request(`${f.root}/close`, "POST", { version: 1, previewId: preview.id })).status,
      ).toBe(200);
      expect(f.releases).toHaveBeenCalledTimes(1);
      expect(f.driver.release).not.toHaveBeenCalled();
    },
  );
});
