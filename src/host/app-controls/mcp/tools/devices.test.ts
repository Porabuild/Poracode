import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceWorkspaceService } from "@/host/devices/DeviceWorkspaceService";
import type { DeviceDriver } from "@/host/devices/NativeDeviceDriver";
import {
  DEVICE_WORKSPACE_AGENT_KEY_ENV,
  deviceThreadProof,
} from "@/shared/deviceWorkspaceAgentProof";
import { StreamableHttpMcpIngress } from "@/host/mcp/StreamableHttpMcpIngress";
import { deviceTools } from "./devices";
import type { AppControlsToolContext } from "./types";
import { normalizeSharedSettings } from "@/shared/settings";

const stops: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

describe("device tool plugin access and caller proof", () => {
  it("rejects unsigned, tampered, wrong-thread and previous-host proofs over real MCP HTTP", async () => {
    const driver: DeviceDriver = {
      discover: async () => ({
        platforms: [],
        devices: [
          {
            id: "android:fixture",
            name: "Fixture",
            platform: "android",
            state: "running",
            input: true,
            accessibility: true,
          },
        ],
      }),
      start: vi.fn<DeviceDriver["start"]>(async () => {}),
      input: vi.fn<DeviceDriver["input"]>(async () => {}),
      capture: vi.fn<DeviceDriver["capture"]>(async () => {
        throw new Error("unexpected capture");
      }),
      inspect: vi.fn<DeviceDriver["inspect"]>(async () => ({
        version: 1,
        format: "android-uiautomator-xml",
        text: "<hierarchy/>",
      })),
      release: async () => {},
      dispose: async () => {},
    };
    const devices = new DeviceWorkspaceService(() => true, driver);
    stops.push(() => devices.dispose());
    const inventory = await devices.discover();
    await devices.attach(
      "thread-B",
      "viewer-principal",
      {
        version: 1,
        generation: inventory.generation,
        deviceId: "android:fixture",
        access: "control",
        agentAccess: "control",
      },
      () => {},
    );
    const key = devices.supervisorExtraEnv()[DEVICE_WORKSPACE_AGENT_KEY_ENV]!;
    let settings = normalizeSharedSettings({});
    const ingress = new StreamableHttpMcpIngress<AppControlsToolContext>({
      bindHost: "127.0.0.1",
      serverInfo: { name: "device-test", version: "1" },
      instructions: "fixture",
      tools: deviceTools.specs,
      isKnownToolName: (name) => name in deviceTools.handlers,
      buildContext: (identity) =>
        ({
          identity,
          getThread: () => ({ id: identity.threadId }),
          deviceWorkspace: devices,
          settings: { read: () => settings },
        }) as unknown as AppControlsToolContext,
      dispatchTool: async (name, args, context) => deviceTools.handlers[name]!(args, context),
      formatToolResult: (_name, result) => ({
        content: [{ type: "text", text: JSON.stringify(result) }],
      }),
    });
    stops.push(() => ingress.dispose());
    const info = await ingress.start();
    async function call(
      threadId: string,
      proof?: string,
      name = "control_device",
      action?: Record<string, unknown>,
    ) {
      const url = new URL("/mcp", info.url);
      url.searchParams.set("thread", threadId);
      if (proof) url.searchParams.set("deviceProof", proof);
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name,
            arguments: action ?? (name === "control_device" ? { kind: "key", key: "home" } : {}),
          },
        }),
      });
      return response.json() as Promise<{ result: { isError?: boolean } }>;
    }
    const ownProof = deviceThreadProof(key, "thread-A");
    const targetProof = deviceThreadProof(key, "thread-B");
    expect(
      (
        await call("thread-B", targetProof, "control_device", {
          kind: "control",
          version: 1,
          control: { type: "powerOff" },
        })
      ).result.isError,
    ).toBe(true);
    expect(driver.input).not.toHaveBeenCalled();
    for (const proof of [
      undefined,
      ownProof,
      `${targetProof.slice(0, -1)}!`,
      deviceThreadProof("previous-host-generation", "thread-B"),
    ]) {
      expect((await call("thread-B", proof)).result.isError).toBe(true);
    }
    // Even a valid caller credential cannot turn another thread's grant into its own.
    expect((await call("thread-A", ownProof)).result.isError).toBe(true);
    expect(driver.input).not.toHaveBeenCalled();
    expect((await call("thread-B", targetProof)).result.isError).not.toBe(true);
    expect(driver.input).toHaveBeenCalledOnce();
    settings = normalizeSharedSettings({
      installedPlugins: {
        devices: {
          version: "1.0.0",
          enabled: false,
          disabledSkillIds: [],
          disabledMcpServerNames: [],
        },
      },
    });
    for (const name of deviceTools.specs.map((spec) => spec.name))
      expect((await call("thread-B", targetProof, name)).result.isError).toBe(true);
    expect(driver.input).toHaveBeenCalledOnce();
    expect(driver.inspect).not.toHaveBeenCalled();
    settings = normalizeSharedSettings({});
    expect((await call("thread-B", targetProof, "inspect_device")).result.isError).not.toBe(true);
    expect(driver.inspect).toHaveBeenCalledOnce();
    const lease = devices.agentSession("thread-B");
    await devices.detach("thread-B", lease.principal, lease.session.id);
    expect((await call("thread-B", targetProof)).result.isError).toBe(true);
    expect(driver.input).toHaveBeenCalledOnce();
  });
  it("checks plugin disablement again before queued device input runs", async () => {
    const inputStarted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const driver: DeviceDriver = {
      discover: async () => ({
        platforms: [],
        devices: [
          {
            id: "android:fixture",
            name: "Fixture",
            platform: "android",
            state: "running",
            input: true,
            accessibility: true,
          },
        ],
      }),
      start: vi.fn<DeviceDriver["start"]>(),
      capture: vi.fn<DeviceDriver["capture"]>(),
      inspect: vi.fn<DeviceDriver["inspect"]>(),
      input: vi.fn<DeviceDriver["input"]>(async () => {
        inputStarted.resolve();
        await release.promise;
      }),
      release: async () => {},
      dispose: async () => {},
    };
    const devices = new DeviceWorkspaceService(() => true, driver);
    stops.push(() => devices.dispose());
    await devices.discover();
    await devices.attach(
      "thread-A",
      "viewer",
      {
        version: 1,
        generation: devices.generation,
        deviceId: "android:fixture",
        access: "control",
        agentAccess: "control",
      },
      () => {},
    );
    let settings = normalizeSharedSettings({});
    const ctx = {
      identity: {
        threadId: "thread-A",
        deviceProof: deviceThreadProof(
          devices.supervisorExtraEnv()[DEVICE_WORKSPACE_AGENT_KEY_ENV]!,
          "thread-A",
        ),
      },
      getThread: () => ({ id: "thread-A" }),
      deviceWorkspace: devices,
      settings: { read: () => settings },
    } as unknown as AppControlsToolContext;
    const first = deviceTools.handlers.control_device!({ kind: "key", key: "home" }, ctx);
    const firstResult = Promise.resolve(first).catch((error: unknown) => error);
    await inputStarted.promise;
    const queued = Promise.resolve(
      deviceTools.handlers.control_device!({ kind: "key", key: "back" }, ctx),
    );
    settings = normalizeSharedSettings({
      installedPlugins: {
        devices: {
          version: "1.0.0",
          enabled: false,
          disabledSkillIds: [],
          disabledMcpServerNames: [],
        },
      },
    });
    release.resolve();
    await expect(queued).rejects.toThrow("Devices plugin is disabled");
    expect(await firstResult).toBeInstanceOf(Error);
    expect(driver.input).toHaveBeenCalledOnce();
  });
});
