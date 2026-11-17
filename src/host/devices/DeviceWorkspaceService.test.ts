import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { DeviceWorkspaceService } from "./DeviceWorkspaceService";
import type { DeviceDriver } from "./NativeDeviceDriver";
import type { DeviceAttach, DeviceTarget } from "@/shared/deviceWorkspace";

const device: DeviceTarget = {
  id: "android:fixture",
  name: "Fixture",
  platform: "android",
  state: "running",
  input: true,
  accessibility: true,
};
const services: DeviceWorkspaceService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()));
});
async function fixture(controls = false) {
  let now = 100_000;
  const png = await sharp({ create: { width: 120, height: 240, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const driver = {
    discover: vi.fn<DeviceDriver["discover"]>(async () => ({
      platforms: [{ platform: "android", status: "ready" }],
      devices: [
        {
          ...device,
          ...(controls
            ? {
                controls: {
                  version: 1 as const,
                  bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
                  actions: ["read", "appearance", "powerOff"] as NonNullable<
                    DeviceTarget["controls"]
                  >["actions"],
                },
              }
            : {}),
        },
      ],
    })),
    capture: vi.fn<DeviceDriver["capture"]>(async () => ({ png })),
    inspect: vi.fn<DeviceDriver["inspect"]>(async () => ({
      version: 1,
      format: "android-uiautomator-xml",
      text: "<hierarchy/>",
    })),
    control: vi.fn<NonNullable<DeviceDriver["control"]>>(async () => undefined),
    input: vi.fn<DeviceDriver["input"]>(async () => {}),
    start: vi.fn<DeviceDriver["start"]>(async () => {}),
    release: vi.fn<DeviceDriver["release"]>(async () => {}),
    dispose: vi.fn<DeviceDriver["dispose"]>(async () => {}),
  };
  const threadExists = vi.fn<() => boolean>(() => true);
  const service = new DeviceWorkspaceService(threadExists, driver, () => now);
  services.push(service);
  await service.discover();
  const attach = (
    overrides: Partial<DeviceAttach> = {},
    principal = "client-1",
    thread = "thread-1",
    authorize = () => {},
  ) =>
    service.attach(
      thread,
      principal,
      {
        version: 1,
        generation: service.generation,
        deviceId: device.id,
        access: "view",
        agentAccess: "none",
        ...overrides,
      },
      authorize,
    );
  return {
    service,
    driver,
    attach,
    threadExists,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("device workspace host authority", () => {
  it("separates viewing, human control, and agent grants", async () => {
    const { service, attach, driver } = await fixture();
    const session = await attach();
    await expect(service.frame("thread-1", "client-1", session.id)).resolves.toMatchObject({
      mimeType: "image/jpeg",
      width: 120,
      height: 240,
    });
    await expect(
      service.action("thread-1", "client-1", session.id, { kind: "key", key: "home" }),
    ).rejects.toMatchObject({ code: "device_control_denied" });
    expect(() => service.agentSession("thread-1")).toThrow(
      "Attach a device to this thread with the desired access mode.",
    );
    const shared = await attach({ access: "control", agentAccess: "view" });
    expect(service.agentSession("thread-1").session.id).toBe(shared.id);
    expect(() => service.agentSession("thread-1", true)).toThrow("viewing only");
    expect(driver.input).not.toHaveBeenCalled();
    await expect(attach({ agentAccess: "control" })).rejects.toMatchObject({ status: 403 });
  });

  it("adopts an agent-opened lease for the requesting client only", async () => {
    const { service } = await fixture();
    expect(service.adoptAgentSession("thread-1", "client-9", () => {})).toBeNull();
    const opened = await service.attachForAgent("thread-1", device.id, "control", () => {});
    await expect(service.frame("thread-1", "client-9", opened.id)).rejects.toMatchObject({
      code: "device_session_expired",
    });
    const authorize = vi.fn<(control: boolean) => void>(() => {});
    const adopted = service.adoptAgentSession("thread-1", "client-9", authorize);
    expect(adopted?.id).toBe(opened.id);
    expect(authorize).toHaveBeenCalledWith(true);
    await expect(service.frame("thread-1", "client-9", opened.id)).resolves.toMatchObject({
      mimeType: "image/jpeg",
    });
    expect(service.agentSession("thread-1", true).session.id).toBe(opened.id);
    expect(service.adoptAgentSession("thread-1", "client-10", () => {})).toBeNull();
    await service.detach("thread-1", "client-9", opened.id);
    expect(() => service.agentSession("thread-1")).toThrow(
      "Attach a device to this thread with the desired access mode.",
    );
  });

  it("binds opaque leases to principal, thread, and host generation", async () => {
    const { service, attach, driver } = await fixture();
    const session = await attach({ access: "control" });
    await expect(service.frame("other-thread", "client-1", session.id)).rejects.toMatchObject({
      code: "device_session_expired",
    });
    await expect(service.inspect("thread-1", "other-client", session.id)).rejects.toMatchObject({
      code: "device_session_expired",
    });
    await expect(attach({ generation: crypto.randomUUID() })).rejects.toMatchObject({
      code: "stale_device_generation",
    });
    const otherHost = new DeviceWorkspaceService(() => true, driver);
    services.push(otherHost);
    await expect(otherHost.frame("thread-1", "client-1", session.id)).rejects.toMatchObject({
      code: "device_session_expired",
    });
    expect(driver.capture).not.toHaveBeenCalled();
  });

  it("rechecks revoked credentials, deleted threads, and lease expiry", async () => {
    const { service, attach, advance, threadExists } = await fixture();
    let revoked = false;
    const session = await attach(
      { access: "control", agentAccess: "control" },
      "client-1",
      "thread-1",
      () => {
        if (revoked) throw new Error("revoked");
      },
    );
    revoked = true;
    expect(() => service.agentSession("thread-1", true)).toThrow("revoked");
    revoked = false;
    threadExists.mockReturnValue(false);
    await expect(service.frame("thread-1", "client-1", session.id)).rejects.toMatchObject({
      status: 404,
    });
    threadExists.mockReturnValue(true);
    advance(60_001);
    await expect(service.frame("thread-1", "client-1", session.id)).rejects.toMatchObject({
      status: 410,
    });
  });

  it("allows many viewers and a single controller per device", async () => {
    const { attach } = await fixture();
    await attach({ access: "control" });
    await expect(attach({}, "viewer", "thread-2")).resolves.toMatchObject({ access: "view" });
    await expect(attach({ access: "control" }, "client-2", "thread-2")).rejects.toMatchObject({
      code: "device_busy",
    });
  });

  it("reserves replacement control before asynchronous retirement", async () => {
    const { driver, attach } = await fixture();
    await attach({ access: "control" });
    const release = Promise.withResolvers<void>();
    driver.release.mockImplementationOnce(async () => release.promise);
    const replacement = attach({ access: "control" });
    const rival = attach({ access: "control" }, "rival", "thread-2");
    release.resolve();
    await replacement;
    await expect(rival).rejects.toMatchObject({ code: "device_busy" });
  });

  it("agent activity cannot renew a vanished user's grant", async () => {
    const { service, attach, advance } = await fixture();
    const session = await attach({ agentAccess: "view" });
    advance(50_000);
    service.agentSession("thread-1");
    await service.inspect("thread-1", "client-1", session.id);
    advance(10_001);
    expect(() => service.agentSession("thread-1")).toThrow(
      "Attach a device to this thread with the desired access mode.",
    );
    await expect(service.frame("thread-1", "client-1", session.id)).rejects.toMatchObject({
      status: 410,
    });
  });

  it("rejects stale coordinates and rotation instead of clicking another position", async () => {
    const { service, attach, driver, advance } = await fixture();
    const session = await attach({ access: "control" });
    const frame = await service.frame("thread-1", "client-1", session.id);
    await expect(
      service.action("thread-1", "client-1", session.id, {
        kind: "tap",
        frameId: crypto.randomUUID(),
        x: 0.5,
        y: 0.5,
      }),
    ).rejects.toMatchObject({ code: "stale_frame" });
    const png = await sharp({ create: { width: 240, height: 120, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    driver.capture.mockResolvedValueOnce({ png });
    await expect(
      service.action("thread-1", "client-1", session.id, {
        kind: "tap",
        frameId: frame.id,
        x: 0.5,
        y: 0.5,
      }),
    ).rejects.toMatchObject({ code: "stale_frame" });
    advance(10_001);
    await expect(
      service.action("thread-1", "client-1", session.id, {
        kind: "tap",
        frameId: frame.id,
        x: 0.5,
        y: 0.5,
      }),
    ).rejects.toMatchObject({ code: "stale_frame" });
    expect(driver.input).not.toHaveBeenCalled();
  });

  it("uses device points, not screenshot pixels, for iOS input", async () => {
    const { service, driver, attach } = await fixture();
    const original = await driver.capture(device.id, new AbortController().signal);
    driver.capture.mockResolvedValue({ ...original, inputWidth: 40, inputHeight: 80 });
    const session = await attach({ access: "control" });
    const frame = await service.frame("thread-1", "client-1", session.id);
    await service.action("thread-1", "client-1", session.id, {
      kind: "tap",
      frameId: frame.id,
      x: 0.5,
      y: 0.5,
    });
    expect(driver.input).toHaveBeenCalledWith(
      device.id,
      expect.objectContaining({ kind: "tap" }),
      expect.objectContaining({ width: 40, height: 80 }),
      expect.any(AbortSignal),
    );
  });

  it("detaches only owned leases and releases helpers after the last viewer", async () => {
    const { service, driver, attach } = await fixture();
    const one = await attach();
    const two = await attach({}, "client-2", "thread-2");
    await expect(service.detach("thread-1", "client-2", one.id)).rejects.toMatchObject({
      status: 403,
    });
    await service.detach("thread-1", "client-1", one.id);
    expect(driver.release).not.toHaveBeenCalled();
    await service.detach("thread-2", "client-2", two.id);
    expect(driver.release).toHaveBeenCalledExactlyOnceWith(device.id);
    expect(driver.start).not.toHaveBeenCalled();
  });

  it("cancels a capture on detach and does not deliver its late frame", async () => {
    const { service, attach, driver } = await fixture();
    const session = await attach();
    const entered = Promise.withResolvers<void>();
    driver.capture.mockImplementationOnce(
      (_id, signal) =>
        new Promise((_resolve, reject) => {
          entered.resolve();
          signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
        }),
    );
    const frame = service.frame("thread-1", "client-1", session.id);
    const rejected = frame.catch((error: unknown) => error);
    await entered.promise;
    await service.detach("thread-1", "client-1", session.id);
    expect(await rejected).toMatchObject({ message: "cancelled" });
    expect(driver.release).toHaveBeenCalledOnce();
  });
  it("waits for retiring helper resources before a newly attached preview captures", async () => {
    const { service, attach, driver } = await fixture();
    const one = await attach();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    driver.release.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const retiring = service.detach("thread-1", "client-1", one.id);
    await entered.promise;
    const two = await attach({}, "client-2", "thread-2");
    const frame = service.frame("thread-2", "client-2", two.id);
    await Promise.resolve();
    expect(driver.capture).not.toHaveBeenCalled();
    release.resolve();
    await retiring;
    await expect(frame).resolves.toMatchObject({ mimeType: "image/jpeg" });
    expect(driver.capture).toHaveBeenCalledOnce();
  });
});

it("requires human control, an advertised capability and the captured boot for new tools", async () => {
  const { service, attach, driver } = await fixture(true);
  const view = await attach();
  const action = {
    kind: "control",
    version: 1,
    control: { type: "appearance", value: "dark" },
  } as const;
  await expect(service.action("thread-1", "client-1", view.id, action)).rejects.toMatchObject({
    code: "device_control_denied",
  });
  expect(driver.control).not.toHaveBeenCalled();
  const control = await attach({ access: "control" });
  await service.action("thread-1", "client-1", control.id, action);
  expect(driver.control).toHaveBeenCalledWith(
    device.id,
    action.control,
    "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
    expect.any(AbortSignal),
    expect.any(Function),
  );
  const legacy = await fixture();
  const old = await legacy.attach({ access: "control" });
  await expect(legacy.service.action("thread-1", "client-1", old.id, action)).rejects.toMatchObject(
    { code: "device_control_unavailable" },
  );
  expect(legacy.driver.control).not.toHaveBeenCalled();
});

it("retires all device grants after explicit power off, but ordinary detach never powers off", async () => {
  const { service, attach, driver } = await fixture(true);
  const viewer = await attach({}, "viewer", "thread-2");
  const controller = await attach({ access: "control" });
  await service.action("thread-1", "client-1", controller.id, {
    kind: "control",
    version: 1,
    control: { type: "powerOff" },
  });
  await expect(service.frame("thread-2", "viewer", viewer.id)).rejects.toMatchObject({
    code: "device_session_expired",
  });
  expect(driver.control).toHaveBeenCalledOnce();
  const next = await attach({ access: "control" });
  await service.detach("thread-1", "client-1", next.id);
  expect(driver.control).toHaveBeenCalledOnce();
});

describe("agent-opened foldable leases", () => {
  const duoId = "ios:duo-fixture";
  const otherId = "ios:other-fixture";
  function foldableFixture(now: () => number = Date.now) {
    const state = { booted: false, created: false };
    const controls = {
      version: 1 as const,
      bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
      actions: ["read", "fold"] as NonNullable<DeviceTarget["controls"]>["actions"],
    };
    const driver = {
      discover: vi.fn<DeviceDriver["discover"]>(async () => ({
        platforms: [
          {
            platform: "ios" as const,
            status: "ready" as const,
            foldableRuntimeAvailable: true,
            foldableDeviceExists: state.created,
          },
        ],
        devices: [
          {
            id: duoId,
            name: "iPhone Duo",
            platform: "ios" as const,
            state: state.booted ? ("running" as const) : ("stopped" as const),
            input: true,
            accessibility: true,
            foldable: true,
            // Fold is advertised only once the device is running.
            ...(state.booted ? { controls } : {}),
          },
          {
            id: otherId,
            name: "Other",
            platform: "ios" as const,
            state: "running" as const,
            input: true,
            accessibility: true,
          },
        ],
      })),
      capture: vi.fn<DeviceDriver["capture"]>(async () => ({ png: Buffer.from("png") })),
      inspect: vi.fn<DeviceDriver["inspect"]>(async () => ({
        version: 1 as const,
        format: "ios-idb-json" as const,
        text: "{}",
      })),
      control: vi.fn<NonNullable<DeviceDriver["control"]>>(async () => ({
        version: 1 as const,
        hingeAngle: 180,
        activeDisplay: "inner" as const,
      })),
      createDuo: vi.fn<NonNullable<DeviceDriver["createDuo"]>>(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        state.created = true;
      }),
      input: vi.fn<DeviceDriver["input"]>(async () => {}),
      start: vi.fn<DeviceDriver["start"]>(async () => {
        state.booted = true;
      }),
      release: vi.fn<DeviceDriver["release"]>(async () => {}),
      dispose: vi.fn<DeviceDriver["dispose"]>(async () => {}),
    };
    const service = new DeviceWorkspaceService(() => true, driver, now);
    services.push(service);
    return { service, driver, state };
  }

  it("refreshes the lease snapshot after starting a stopped foldable so fold works", async () => {
    const { service, driver } = foldableFixture();
    const opened = await service.attachForAgent("thread-1", duoId, "control", () => {});
    expect(driver.start).toHaveBeenCalledOnce();
    expect(opened.device.controls?.actions).toContain("fold");
    const agent = service.agentSession("thread-1", true);
    await service.action("thread-1", agent.principal, agent.session.id, {
      kind: "fold",
      angle: 180,
    });
    expect(driver.control).toHaveBeenCalledWith(
      duoId,
      { type: "fold", angle: 180 },
      "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });

  it("reuses the adopted lease on agent re-open and replaces it for another device", async () => {
    const { service } = foldableFixture();
    const opened = await service.attachForAgent("thread-1", duoId, "control", () => {});
    expect(service.adoptAgentSession("thread-1", "client-9", () => {})?.id).toBe(opened.id);
    const reopened = await service.attachForAgent("thread-1", duoId, "control", () => {});
    expect(reopened.id).toBe(opened.id);
    const other = await service.attachForAgent("thread-1", otherId, "control", () => {});
    expect(other.device.id).toBe(otherId);
    // Exactly one agent lease remains addressable.
    expect(service.agentSession("thread-1", true).session.id).toBe(other.id);
  });

  it("renews the lease on agent activity so agent-only sessions outlive one TTL", async () => {
    let now = 200_000;
    const { service } = foldableFixture(() => now);
    await service.attachForAgent("thread-1", duoId, "control", () => {});
    now += 59_000;
    expect(service.agentSession("thread-1", true).session.device.id).toBe(duoId);
    now += 59_000;
    expect(service.agentSession("thread-1", true).session.device.id).toBe(duoId);
    now += 61_000;
    expect(() => service.agentSession("thread-1", true)).toThrow(
      "Attach a device to this thread with the desired access mode.",
    );
  });

  it("single-flights concurrent Create Duo calls", async () => {
    const { service, driver } = foldableFixture();
    await Promise.all([service.createDuo(() => {}), service.createDuo(() => {})]);
    expect(driver.createDuo).toHaveBeenCalledOnce();
  });
});
