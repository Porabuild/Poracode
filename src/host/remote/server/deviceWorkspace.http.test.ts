import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { DeviceWorkspaceService } from "@/host/devices/DeviceWorkspaceService";
import type { DeviceDriver } from "@/host/devices/NativeDeviceDriver";
import {
  deviceFrameSchema,
  deviceInventorySchema,
  deviceSessionSchema,
} from "@/shared/deviceWorkspace";
import { RemoteAccessServer } from "../RemoteAccessServer";
import { RemoteAuthStore } from "../auth";
import { remoteHostDescribeSchema } from "@/shared/hostControlProtocol";
import {
  remoteAccessTokenResultSchema,
  remoteEnvironmentCapabilitiesSchema,
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
  type RemoteAccessScope,
} from "@/shared/remote";

const servers: RemoteAccessServer[] = [];
const services: DeviceWorkspaceService[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  await Promise.all(services.splice(0).map((service) => service.dispose()));
});

async function setup(composed = true, scopes: RemoteAccessScope[] = ["session:read"]) {
  const png = await sharp({ create: { width: 20, height: 40, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
  const driver: DeviceDriver = {
    discover: async () => ({
      platforms: [
        { platform: "ios", status: "unsupported_host" },
        { platform: "android", status: "ready" },
      ],
      devices: [
        {
          id: "android:fixture",
          name: "Fixture",
          platform: "android",
          state: "running",
          input: true,
          accessibility: true,
          controls: {
            version: 1,
            bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
            actions: ["read", "appearance"],
          },
        },
      ],
    }),
    capture: async () => ({ png }),
    inspect: async () => ({ version: 1, format: "android-uiautomator-xml", text: "<hierarchy/>" }),
    input: vi.fn<DeviceDriver["input"]>(async () => {}),
    control: vi.fn<NonNullable<DeviceDriver["control"]>>(async () => ({
      version: 1,
      appearance: "dark",
    })),
    start: async () => {},
    release: async () => {},
    dispose: async () => {},
  };
  const devices = new DeviceWorkspaceService((id) => id === "thread-1", driver);
  services.push(devices);
  const auth = new RemoteAuthStore();
  const server = new RemoteAccessServer({
    appVersion: "test",
    identity: { desktopId: "device-test-host", label: "Fixture" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: async () => undefined,
    truncateThreadRuntime: () => {},
    ownsSupervisorPersistence: false,
    authStore: auth,
    ...(composed ? { deviceWorkspace: devices } : {}),
  });
  servers.push(server);
  const info = await server.start();
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const exchanged = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "pairing-token", credential, scopes }),
  });
  expect(exchanged.status).toBe(200);
  const tokens = remoteAccessTokenResultSchema.parse(await exchanged.json());
  const token = tokens.accessToken;
  async function request(path: string, method = "GET", body?: unknown, bearer = token) {
    return fetch(new URL(path, info.httpBaseUrl), {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  return { devices, driver, request, info, token, refreshToken: tokens.refreshToken, auth, server };
}

describe("device workspace authenticated routes and compatibility", () => {
  it("requires a control lease and exact nested version for human settings over real HTTP", async () => {
    const { request, driver } = await setup(true, ["session:read", "session:operate"]);
    const inventory = deviceInventorySchema.parse(await (await request("/api/devices")).json());
    const attach = async (access: "view" | "control") =>
      deviceSessionSchema.parse(
        await (
          await request("/api/threads/thread-1/devices", "POST", {
            version: 1,
            generation: inventory.generation,
            deviceId: "android:fixture",
            access,
            agentAccess: "none",
          })
        ).json(),
      );
    const viewer = await attach("view");
    const action = { kind: "control", version: 1, control: { type: "appearance", value: "dark" } };
    expect(
      (await request(`/api/threads/thread-1/devices/${viewer.id}/actions`, "POST", action)).status,
    ).toBe(403);
    const controller = await attach("control");
    const path = `/api/threads/thread-1/devices/${controller.id}/actions`;
    expect((await request(path, "POST", { ...action, version: 2 })).status).toBe(400);
    expect(driver.control).not.toHaveBeenCalled();
    const result = await request(path, "POST", action);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      version: 1,
      delivered: true,
      controls: { version: 1, appearance: "dark" },
    });
    expect(driver.control).toHaveBeenCalledExactlyOnceWith(
      "android:fixture",
      action.control,
      inventory.devices[0]!.controls!.bootId,
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });
  it("negotiates only composed services and preserves old capability readers", async () => {
    const { request } = await setup();
    const descriptor = (await (await request("/.well-known/poracode/environment")).json()) as {
      capabilities: Record<string, unknown>;
    };
    expect(descriptor.capabilities.deviceWorkspace).toEqual({ versions: [1] });
    const previousReader = remoteEnvironmentCapabilitiesSchema.omit({ deviceWorkspace: true });
    expect(previousReader.parse(descriptor.capabilities)).not.toHaveProperty("deviceWorkspace");
    expect(remoteEnvironmentCapabilitiesSchema.parse({})).not.toHaveProperty("deviceWorkspace");
    // The pre-feature strict host-control reader must still accept what this
    // composed host emits; device negotiation belongs only in the descriptor.
    const hostDescription = await request("/api/host/describe");
    expect(hostDescription.status).toBe(200);
    const host = remoteHostDescribeSchema.parse(await hostDescription.json());
    expect(host.capabilities).not.toHaveProperty("deviceWorkspace");
    const legacy = await setup(false);
    const old = (await (await legacy.request("/.well-known/poracode/environment")).json()) as {
      capabilities: Record<string, unknown>;
    };
    expect(old.capabilities).not.toHaveProperty("deviceWorkspace");
    expect((await legacy.request("/api/devices")).status).toBe(501);
  });

  it("lets viewers capture but refuses control, cross-thread handles and unknown versions", async () => {
    const { request, driver } = await setup();
    const inventory = deviceInventorySchema.parse(await (await request("/api/devices")).json());
    expect(inventory.platforms).toContainEqual({ platform: "ios", status: "unsupported_host" });
    const input = {
      version: 1,
      generation: inventory.generation,
      deviceId: "android:fixture",
      access: "view",
      agentAccess: "none",
    };
    expect(
      (await request("/api/threads/thread-1/devices", "POST", { ...input, version: 2 })).status,
    ).toBe(400);
    expect(
      (await request("/api/threads/thread-1/devices", "POST", { ...input, access: "control" }))
        .status,
    ).toBe(403);
    const attached = await request("/api/threads/thread-1/devices", "POST", input);
    expect(attached.status).toBe(200);
    const session = deviceSessionSchema.parse(await attached.json());
    const frame = await request(`/api/threads/thread-1/devices/${session.id}/frame`);
    expect(frame.headers.get("cache-control")).toBe("no-store");
    expect(deviceFrameSchema.parse(await frame.json()).width).toBe(20);
    expect((await request(`/api/threads/other-thread/devices/${session.id}/frame`)).status).toBe(
      410,
    );
    expect(
      (
        await request(`/api/threads/thread-1/devices/${session.id}/actions`, "POST", {
          kind: "key",
          key: "home",
        })
      ).status,
    ).toBe(403);
    expect(driver.input).not.toHaveBeenCalled();
    expect(
      (await request(`/api/threads/thread-1/devices/${session.id}/detach`, "POST")).status,
    ).toBe(200);
    expect((await request(`/api/threads/thread-1/devices/${session.id}/frame`)).status).toBe(410);
  });

  it("requires bearer authentication even for read-only discovery", async () => {
    const { info } = await setup();
    expect((await fetch(new URL("/api/devices", info.httpBaseUrl))).status).toBe(401);
  });
  it("keeps the same lease and agent grant through token refresh, but denies a revoked session", async () => {
    const { request, info, devices, driver, token, refreshToken, auth, server } = await setup(
      true,
      ["session:read", "session:operate"],
    );
    const principal = auth.authenticateBearerToken(token).sessionId;
    const inventory = deviceInventorySchema.parse(await (await request("/api/devices")).json());
    const attached = await request("/api/threads/thread-1/devices", "POST", {
      version: 1,
      generation: inventory.generation,
      deviceId: "android:fixture",
      access: "control",
      agentAccess: "control",
    });
    expect(attached.status).toBe(200);
    const session = deviceSessionSchema.parse(await attached.json());
    const path = `/api/threads/thread-1/devices/${session.id}`;
    expect(devices.agentSession("thread-1", true).session.id).toBe(session.id);
    const refreshed = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "refresh_token", refreshToken }),
    });
    expect(refreshed.status).toBe(200);
    const rotated = remoteAccessTokenResultSchema.parse(await refreshed.json());
    expect(auth.authenticateBearerToken(rotated.accessToken).sessionId).toBe(principal);
    expect((await request(`${path}/frame`)).status).toBe(401);
    expect((await request(`${path}/frame`, "GET", undefined, rotated.accessToken)).status).toBe(
      200,
    );
    expect(
      (await request(`${path}/actions`, "POST", { kind: "key", key: "home" }, rotated.accessToken))
        .status,
    ).toBe(200);
    const grant = devices.agentSession("thread-1", true);
    expect(grant).toMatchObject({ principal, session: { id: session.id } });
    await devices.action("thread-1", grant.principal, grant.session.id, {
      kind: "key",
      key: "back",
    });
    expect(driver.input).toHaveBeenCalledTimes(2);
    expect(server.revokeAccessSession(principal)).toBe(true);
    expect((await request(`${path}/frame`, "GET", undefined, rotated.accessToken)).status).toBe(
      401,
    );
    expect(() => devices.agentSession("thread-1", true)).toThrow("Invalid access session.");
    await expect(
      devices.action("thread-1", grant.principal, grant.session.id, { kind: "key", key: "home" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(driver.input).toHaveBeenCalledTimes(2);
  });
  it("permits the device detach method in an actual browser preflight", async () => {
    const { info } = await setup();
    const response = await fetch(
      new URL("/api/threads/thread-1/devices/lease/detach", info.httpBaseUrl),
      {
        method: "OPTIONS",
        headers: {
          origin: "http://127.0.0.1:5173",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization",
        },
      },
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")?.split(/,\s*/u)).toContain("POST");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
  });
});
