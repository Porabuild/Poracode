import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { createDeviceFoldRuntime } from "./deviceFold";
import type { DeviceHubHandle, DeviceHubRuntime } from "./DeviceHubRuntime";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function helperFixture(ackOk: boolean) {
  const received: Buffer[] = [];
  const server = createServer((request, response) => {
    if (request.url?.includes("/config")) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          width: 2007,
          height: 2853,
          screenId: 3,
          supportsHingeAngle: true,
          // Fractional mid-animation angle: the vendor boundary must accept
          // and normalize it instead of failing the whole config read.
          hingeAngle: 89.6,
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  servers.push(server);
  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket) => {
    socket.on("message", (data, binary) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      received.push(bytes);
      if (!binary || bytes[0] !== 0x0f) return;
      const angle = (JSON.parse(bytes.subarray(1).toString("utf8")) as { angle: number }).angle;
      socket.send(
        Buffer.concat([
          Buffer.from([0x8f]),
          Buffer.from(
            JSON.stringify(ackOk ? { ok: true, angle } : { ok: false, angle, error: "hinge busy" }),
          ),
        ]),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const hub: DeviceHubHandle = {
    origin: `http://127.0.0.1:${port}`,
    token: "fixture-token",
    signal: new AbortController().signal,
    release: vi.fn<() => Promise<void>>(async () => {}),
  };
  const acquire = vi.fn<() => Promise<DeviceHubHandle>>(async () => hub);
  const runtime = createDeviceFoldRuntime({
    prepare: async () => {},
    platforms: () => ["ios"],
    acquire,
    ensureIosHelper: async () => {},
  } as unknown as DeviceHubRuntime);
  return { runtime, hub, received, acquire, signal: new AbortController().signal };
}

describe("serve-sim hinge wire protocol", () => {
  it("sends tag 0x0f with the exact angle and reads helper config fields", async () => {
    const { runtime, hub, received, acquire, signal } = await helperFixture(true);
    const helper = await runtime.acquireHelper("UDID-1", "boot-1", signal);
    // The fold channel must join the same pooled hub generation as live
    // preview (device+boot), never a boot-less second hub.
    expect(acquire).toHaveBeenCalledWith(signal, "ios", {
      clientDeviceId: "UDID-1",
      bootId: "boot-1",
    });
    await helper.setHingeAngle(90, signal);
    expect(received).toHaveLength(1);
    expect(received[0]![0]).toBe(0x0f);
    expect(JSON.parse(received[0]!.subarray(1).toString("utf8"))).toEqual({ angle: 90 });
    await expect(helper.readConfig(signal)).resolves.toMatchObject({
      screenId: 3,
      supportsHingeAngle: true,
      hingeAngle: 90,
    });
    await helper.release();
    expect(hub.release).toHaveBeenCalledOnce();
  });

  it("surfaces an ack refusal as a typed fold error", async () => {
    const { runtime, signal } = await helperFixture(false);
    const helper = await runtime.acquireHelper("UDID-1", "boot-1", signal);
    await expect(helper.setHingeAngle(0, signal)).rejects.toMatchObject({
      code: "device_fold_failed",
    });
    await helper.release();
  });
});
