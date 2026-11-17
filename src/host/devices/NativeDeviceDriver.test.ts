import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PassThrough } from "node:stream";
import {
  deviceActionSchema,
  deviceHumanActionSchema,
  deviceControlCapabilitiesSchema,
  deviceTargetSchema,
} from "@/shared/deviceWorkspace";
import { IPHONE_DUO_DEVICE_TYPE, NativeDeviceDriver } from "./NativeDeviceDriver";
import { runAndroidDeviceControl } from "./nativeDeviceControls";
import {
  DeviceWorkspaceError,
  findDeviceTool,
  launchDeviceProcess,
  runDeviceCommand,
} from "./deviceProcess";
import type { DeviceFoldHelperHandle, DeviceFoldRuntime } from "./deviceFold";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn<typeof spawn>(),
}));

vi.mock("./deviceProcess", async (original) => ({
  ...(await original<typeof import("./deviceProcess")>()),
  findDeviceTool: vi.fn<typeof findDeviceTool>(async (name) => name),
  runDeviceCommand: vi.fn<typeof runDeviceCommand>(),
  launchDeviceProcess: vi.fn<typeof launchDeviceProcess>(),
}));
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform);
  vi.clearAllMocks();
});

async function android() {
  vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) => {
    if (args[0] === "-list-avds") return Buffer.from("Fixture\n");
    if (args[0] === "devices")
      return Buffer.from("List of devices attached\nemulator-5554 device\nusb-phone device\n");
    if (args.includes("name")) return Buffer.from("Fixture\nOK\n");
    if (args.includes("get-state")) return Buffer.from("device\n");
    if (args.includes("/proc/sys/kernel/random/boot_id"))
      return Buffer.from("13455f6b-3b94-40c8-8913-a6839f2dfd1b\n");
    return Buffer.from("");
  });
  const driver = new NativeDeviceDriver();
  const inventory = await driver.discover(new AbortController().signal);
  return { driver, inventory, signal: new AbortController().signal };
}
describe("native emulator identity and input boundaries", () => {
  it("binds live media to the selected AVD serial and current boot UUID", async () => {
    const { driver, signal } = await android();
    try {
      expect(await driver.streamTarget("android:Fixture", signal)).toEqual({
        clientDeviceId: "emulator-5554",
        adbPath: "adb",
        bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
      });
      expect(runDeviceCommand).toHaveBeenLastCalledWith(
        "adb",
        ["-s", "emulator-5554", "shell", "cat", "/proc/sys/kernel/random/boot_id"],
        signal,
      );
      vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) =>
        Buffer.from(args.includes("name") ? "Foreign\nOK\n" : "device\n"),
      );
      await expect(driver.streamTarget("android:Fixture", signal)).rejects.toMatchObject({
        code: "device_identity_changed",
      });
    } finally {
      await driver.dispose();
    }
  });

  it("refuses live media when the selected emulator has no valid boot identity", async () => {
    const { driver, signal } = await android();
    const original = vi.mocked(runDeviceCommand).getMockImplementation()!;
    vi.mocked(runDeviceCommand).mockImplementation(async (file, args, ...rest) =>
      args.includes("/proc/sys/kernel/random/boot_id")
        ? Buffer.from("unavailable")
        : original(file, args, ...rest),
    );
    try {
      await expect(driver.streamTarget("android:Fixture", signal)).rejects.toMatchObject({
        code: "device_identity_changed",
      });
    } finally {
      await driver.dispose();
    }
  });

  it("leaves a started Android emulator alive when preview resources are released or disposed", async () => {
    const { driver, signal } = await android();
    vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) =>
      Buffer.from(args[0] === "-list-avds" ? "Fixture\n" : "List of devices attached\n"),
    );
    await driver.discover(signal);
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn<ChildProcess["kill"]>(() => true),
    });
    vi.mocked(launchDeviceProcess).mockResolvedValueOnce(child as unknown as ChildProcess);
    await driver.start("android:Fixture", signal);
    await driver.release("android:Fixture");
    await driver.dispose();
    expect(launchDeviceProcess).toHaveBeenCalledExactlyOnceWith("emulator", [
      "-avd",
      "Fixture",
      "-no-window",
    ]);
    expect(child.kill).not.toHaveBeenCalled();
  });
  it.each([
    { code: 1, signal: null, alreadyExited: false },
    { code: null, signal: "SIGABRT", alreadyExited: false },
    { code: 1, signal: null, alreadyExited: true },
  ] as const)("reports a failed Android boot and clears it on retry/running: %j", async (exit) => {
    const { driver, signal } = await android();
    vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) =>
      Buffer.from(args[0] === "-list-avds" ? "Fixture\n" : "List of devices attached\n"),
    );
    await driver.discover(signal);
    const child = Object.assign(new EventEmitter(), {
      exitCode: exit.alreadyExited ? exit.code : (null as number | null),
      signalCode: null as NodeJS.Signals | null,
      kill: vi.fn<ChildProcess["kill"]>(() => true),
    });
    const retry = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn<ChildProcess["kill"]>(() => true),
    });
    vi.mocked(launchDeviceProcess)
      .mockReset()
      .mockResolvedValueOnce(child as unknown as ChildProcess)
      .mockResolvedValueOnce(retry as unknown as ChildProcess);
    try {
      await driver.start("android:Fixture", signal);
      expect((await driver.discover(signal)).devices[0]?.state).toBe(
        exit.alreadyExited ? "stopped" : "starting",
      );
      if (!exit.alreadyExited) {
        child.exitCode = exit.code;
        child.signalCode = exit.signal;
        child.emit("exit", exit.code, exit.signal);
      }
      const failed = await driver.discover(signal);
      expect(failed.devices[0]?.state).toBe("stopped");
      expect(failed.platforms.find((entry) => entry.platform === "android")).toEqual({
        platform: "android",
        status: "ready",
        diagnostic: `Fixture: emulator exited during startup (${exit.signal ?? exit.code}).`,
      });
      await driver.start("android:Fixture", signal);
      const retrying = await driver.discover(signal);
      expect(retrying.devices[0]?.state).toBe("starting");
      expect(retrying.platforms.find((entry) => entry.platform === "android")).not.toHaveProperty(
        "diagnostic",
      );
      vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) =>
        Buffer.from(
          args[0] === "-list-avds"
            ? "Fixture\n"
            : args[0] === "devices"
              ? "List of devices attached\nemulator-5554 device\n"
              : "Fixture\nOK\n",
        ),
      );
      expect((await driver.discover(signal)).devices[0]?.state).toBe("running");
      retry.emit("exit", 1, null);
      expect(
        (await driver.discover(signal)).platforms.find((entry) => entry.platform === "android"),
      ).not.toHaveProperty("diagnostic");
    } finally {
      await driver.dispose();
    }
    expect(child.kill).not.toHaveBeenCalled();
    expect(retry.kill).not.toHaveBeenCalled();
  });
  it("bounds Android boot diagnostics and forgets removed AVDs", async () => {
    const names = Array.from({ length: 12 }, (_, index) => `Fixture${index}_${"x".repeat(180)}`);
    let listed = names.join("\n");
    vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) =>
      Buffer.from(args[0] === "-list-avds" ? listed : "List of devices attached\n"),
    );
    const children = names.map(() =>
      Object.assign(new EventEmitter(), {
        exitCode: 1,
        signalCode: null,
        kill: vi.fn<ChildProcess["kill"]>(() => true),
      }),
    );
    vi.mocked(launchDeviceProcess)
      .mockReset()
      .mockImplementation(
        async () =>
          children[vi.mocked(launchDeviceProcess).mock.calls.length - 1] as unknown as ChildProcess,
      );
    const driver = new NativeDeviceDriver();
    const signal = new AbortController().signal;
    try {
      await driver.discover(signal);
      for (const name of names) await driver.start(`android:${name}`, signal);
      const failed = await driver.discover(signal);
      expect(
        failed.platforms.find((entry) => entry.platform === "android")?.diagnostic,
      ).toHaveLength(2000);
      listed = "";
      const removed = await driver.discover(signal);
      expect(removed.devices).toEqual([]);
      expect(removed.platforms.find((entry) => entry.platform === "android")).not.toHaveProperty(
        "diagnostic",
      );
    } finally {
      await driver.dispose();
    }
    for (const child of children) expect(child.kill).not.toHaveBeenCalled();
  });
  it("discovers emulators only and shell-quotes Android text", async () => {
    const { driver, inventory, signal } = await android();
    expect(inventory.devices.filter((target) => target.platform === "android")).toHaveLength(1);
    await driver.input(
      "android:Fixture",
      { kind: "text", text: "a'; echo injected; 'b" },
      null,
      signal,
    );
    const args = vi.mocked(runDeviceCommand).mock.calls.at(-1)![1];
    expect(args.slice(0, 5)).toEqual(["-s", "emulator-5554", "shell", "input", "text"]);
    expect(args[5]).toBe("'a'\\'';%secho%sinjected;%s'\\''b'");
    await expect(
      driver.input("android:Fixture", { kind: "text", text: "漢字" }, null, signal),
    ).rejects.toMatchObject({ code: "input_unsupported" });
    await driver.dispose();
  });
  it("refuses a serial recycled for a different AVD before capture or input", async () => {
    const { driver, signal } = await android();
    vi.mocked(runDeviceCommand).mockResolvedValue(Buffer.from("DifferentAVD\nOK\n"));
    await expect(driver.capture("android:Fixture", signal)).rejects.toMatchObject({
      code: "device_identity_changed",
    });
    await expect(
      driver.input("android:Fixture", { kind: "key", key: "home" }, null, signal),
    ).rejects.toMatchObject({ code: "device_identity_changed" });
    expect(
      vi.mocked(runDeviceCommand).mock.calls.some((call) => call[1].includes("screencap")),
    ).toBe(false);
    expect(
      vi.mocked(runDeviceCommand).mock.calls.some((call) => call[1].includes("keyevent")),
    ).toBe(false);
    await driver.dispose();
  });
  it("owns an iOS socket helper, preserves literal text, and joins helper closure before release", async () => {
    Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
    const udid = "5468f955-91e6-4629-9b19-998164332157";
    vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) => {
      if (args[0] === "simctl")
        return Buffer.from(
          JSON.stringify({
            devices: {
              "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
                { udid, name: "Fixture iPhone", state: "Booted" },
              ],
              "com.apple.CoreSimulator.SimRuntime.tvOS-18-0": [
                { udid: crypto.randomUUID(), name: "TV", state: "Booted" },
              ],
            },
          }),
        );
      return Buffer.from("");
    });
    const child = Object.assign(new EventEmitter(), {
      pid: 12345,
      exitCode: null,
      signalCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn<ChildProcess["kill"]>(() => true),
    });
    vi.mocked(spawn).mockImplementationOnce((_file, args) => {
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ grpc_path: args!.at(-1) })}\n`));
      return child as unknown as ChildProcess;
    });
    const driver = new NativeDeviceDriver();
    const signal = new AbortController().signal;
    const inventory = await driver.discover(signal);
    expect(inventory.devices.filter((target) => target.platform === "ios")).toHaveLength(1);
    await driver.input(`ios:${udid}`, { kind: "text", text: "--help" }, null, signal);
    expect(spawn).toHaveBeenCalledWith(
      "idb_companion",
      ["--udid", udid, "--grpc-domain-sock", expect.stringContaining("device.sock")],
      expect.any(Object),
    );
    expect(runDeviceCommand).toHaveBeenLastCalledWith(
      "idb",
      ["--companion", expect.stringContaining("device.sock"), "ui", "text", "--", "--help"],
      signal,
    );
    let released = false;
    const release = driver.release(`ios:${udid}`).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    expect(released).toBe(false);
    child.emit("close", 0);
    await release;
    expect(released).toBe(true);
    await driver.dispose();
  });
  it("joins an exited iOS helper before recreating it without signaling its old PID", async () => {
    Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
    const udid = "5468f955-91e6-4629-9b19-998164332157";
    vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) =>
      Buffer.from(
        args[0] === "simctl"
          ? JSON.stringify({
              devices: {
                "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
                  { udid, name: "Fixture iPhone", state: "Booted" },
                ],
              },
            })
          : "",
      ),
    );
    const children = [12345, 12346].map((pid) =>
      Object.assign(new EventEmitter(), {
        pid,
        exitCode: null as number | null,
        signalCode: null as NodeJS.Signals | null,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn<ChildProcess["kill"]>(() => true),
      }),
    );
    vi.mocked(spawn).mockImplementation((_file, args) => {
      const child = children[vi.mocked(spawn).mock.calls.length - 1]!;
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ grpc_path: args!.at(-1) })}\n`));
      return child as unknown as ChildProcess;
    });
    const driver = new NativeDeviceDriver();
    const signal = new AbortController().signal;
    let retry: Promise<void> | undefined;
    try {
      await driver.discover(signal);
      await driver.input(`ios:${udid}`, { kind: "key", key: "home" }, null, signal);
      const first = children[0]!;
      const oldPath = vi.mocked(spawn).mock.calls[0]![1]!.at(-1)!;
      const commandCount = vi.mocked(runDeviceCommand).mock.calls.length;
      first.exitCode = 1;
      first.emit("exit", 1, null);
      retry = driver.input(`ios:${udid}`, { kind: "key", key: "home" }, null, signal);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(runDeviceCommand).toHaveBeenCalledTimes(commandCount);
      expect(first.kill).not.toHaveBeenCalled();
      expect((await stat(dirname(oldPath))).isDirectory()).toBe(true);

      first.emit("close", 1);
      await retry;
      expect(spawn).toHaveBeenCalledTimes(2);
      const newPath = vi.mocked(spawn).mock.calls[1]![1]!.at(-1)!;
      expect(newPath).not.toBe(oldPath);
      expect(runDeviceCommand).toHaveBeenLastCalledWith(
        "idb",
        ["--companion", newPath, "ui", "button", "HOME"],
        signal,
      );
      await expect(stat(dirname(oldPath))).rejects.toMatchObject({ code: "ENOENT" });
      expect(first.kill).not.toHaveBeenCalled();

      const release = driver.release(`ios:${udid}`);
      expect(children[1]!.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
      expect((await stat(dirname(newPath))).isDirectory()).toBe(true);
      children[1]!.emit("close", 0);
      await release;
      await expect(stat(dirname(newPath))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      children[0]!.emit("close", 1);
      await retry;
      const dispose = driver.dispose();
      children[1]!.emit("close", 0);
      await dispose;
    }
  });
});

describe("human emulator controls", () => {
  it("reads actual state without inventing values and propagates permission failures", async () => {
    const run = vi.fn<(args: string[]) => Promise<Buffer>>(async (args) =>
      Buffer.from(
        args.at(-1) === "night"
          ? "Night mode: yes"
          : args.at(-1) === "font_scale"
            ? "1.15"
            : args.at(-1) === "wifi_on"
              ? "1"
              : "0",
      ),
    );
    expect(await runAndroidDeviceControl(run, { type: "read" })).toEqual({
      version: 1,
      appearance: "dark",
      fontScale: 1.15,
      reduceMotion: true,
      networkEnabled: true,
    });
    run.mockResolvedValue(Buffer.from("unknown"));
    expect(await runAndroidDeviceControl(run, { type: "read" })).toEqual({ version: 1 });
    run.mockImplementation(async (args) => {
      if (args.includes("getprop")) return Buffer.from("36");
      throw new Error("Permission not requested by package");
    });
    await expect(
      runAndroidDeviceControl(run, {
        type: "permission",
        applicationId: "com.example.app",
        permission: "camera",
        decision: "grant",
      }),
    ).rejects.toThrow("Permission not requested by package");
    expect(run.mock.calls.at(-1)?.[0]).toEqual([
      "shell",
      "pm",
      "grant",
      "com.example.app",
      "android.permission.CAMERA",
    ]);
  });

  it("uses emulator sensors and exact finite coordinates without a generic shell action", async () => {
    const run = vi.fn<(args: string[]) => Promise<Buffer>>(async () => Buffer.alloc(0));
    await runAndroidDeviceControl(run, { type: "orientation", value: "landscapeLeft" });
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ["shell", "settings", "put", "system", "accelerometer_rotation", "1"],
      ["shell", "cmd", "window", "user-rotation", "free"],
      ["emu", "sensor", "set", "acceleration", "9.81:0:0"],
    ]);
    await runAndroidDeviceControl(run, { type: "location", latitude: -33.8, longitude: 151.2 });
    expect(run.mock.lastCall?.[0]).toEqual(["emu", "geo", "fix", "151.2", "-33.8"]);
    await runAndroidDeviceControl(run, { type: "network", enabled: false });
    expect(run.mock.calls.slice(-2).map(([args]) => args)).toEqual([
      ["shell", "svc", "wifi", "disable"],
      ["shell", "svc", "data", "disable"],
    ]);
  });
  it("keeps old agent actions closed and refuses future controls before effects", () => {
    const action = { kind: "control", version: 1, control: { type: "appearance", value: "dark" } };
    expect(deviceActionSchema.safeParse(action).success).toBe(false);
    expect(deviceHumanActionSchema.safeParse(action).success).toBe(true);
    const legacyTarget = deviceTargetSchema.omit({ controls: true });
    const target = {
      id: "android:fixture",
      platform: "android",
      name: "Fixture",
      state: "running",
      input: true,
      accessibility: true,
    };
    expect(deviceTargetSchema.parse(target)).toEqual(target);
    expect(
      legacyTarget.parse({
        ...target,
        controls: { version: 1, bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b", actions: ["read"] },
      }),
    ).toEqual(target);
    expect(deviceHumanActionSchema.safeParse({ ...action, version: 2 }).success).toBe(false);
    expect(
      deviceControlCapabilitiesSchema.safeParse({
        version: 2,
        bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b",
        actions: ["read"],
      }).success,
    ).toBe(false);
    expect(
      deviceHumanActionSchema.safeParse({
        ...action,
        control: { type: "launchApp", applicationId: "com.example;reboot" },
      }).success,
    ).toBe(false);
    expect(
      deviceHumanActionSchema.safeParse({
        ...action,
        control: { type: "location", latitude: 91, longitude: 0 },
      }).success,
    ).toBe(false);
  });

  it("advertises controls only with a verified running emulator boot and fences each command", async () => {
    const { driver, signal, inventory } = await android();
    const bootId = inventory.devices[0]!.controls!.bootId;
    expect(inventory.devices[0]!.controls).toMatchObject({
      version: 1,
      actions: expect.arrayContaining(["appearance", "powerOff"]),
    });
    await driver.control("android:Fixture", { type: "appearance", value: "dark" }, bootId, signal);
    expect(runDeviceCommand).toHaveBeenLastCalledWith(
      "adb",
      ["-s", "emulator-5554", "shell", "cmd", "uimode", "night", "yes"],
      signal,
    );
    vi.mocked(runDeviceCommand).mockClear();
    await expect(
      driver.control(
        "android:Fixture",
        { type: "powerOff" },
        "03455f6b-3b94-40c8-8913-a6839f2dfd1b",
        signal,
      ),
    ).rejects.toMatchObject({ code: "device_identity_changed" });
    expect(vi.mocked(runDeviceCommand).mock.calls.some(([, args]) => args.includes("kill"))).toBe(
      false,
    );
    await driver.dispose();
  });

  it("rechecks live authorization after identity probes and between multi-command effects", async () => {
    const { driver, signal, inventory } = await android();
    const original = vi.mocked(runDeviceCommand).getMockImplementation()!;
    let revoked = false;
    vi.mocked(runDeviceCommand).mockClear();
    vi.mocked(runDeviceCommand).mockImplementation(async (file, args, ...rest) => {
      const result = await original(file, args, ...rest);
      if (args.includes("wifi")) revoked = true;
      return result;
    });
    await expect(
      driver.control(
        "android:Fixture",
        { type: "network", enabled: false },
        inventory.devices[0]!.controls!.bootId,
        signal,
        () => {
          if (revoked) throw new Error("access revoked");
        },
      ),
    ).rejects.toThrow("access revoked");
    expect(vi.mocked(runDeviceCommand).mock.calls.some(([, args]) => args.includes("wifi"))).toBe(
      true,
    );
    expect(vi.mocked(runDeviceCommand).mock.calls.some(([, args]) => args.includes("data"))).toBe(
      false,
    );
    await driver.dispose();
  });

  it("quotes deep links, separates permission failures, and never uses a global shutdown", async () => {
    const { driver, signal, inventory } = await android();
    const bootId = inventory.devices[0]!.controls!.bootId;
    await driver.control(
      "android:Fixture",
      { type: "openUrl", url: "myapp://open?q=';reboot" },
      bootId,
      signal,
    );
    expect(vi.mocked(runDeviceCommand).mock.lastCall?.[1].at(-1)).toBe(
      "'myapp://open?q='\\'';reboot'",
    );
    await expect(
      driver.control("android:Fixture", { type: "openUrl", url: "file:///host" }, bootId, signal),
    ).rejects.toMatchObject({ name: "ZodError" });
    const original = vi.mocked(runDeviceCommand).getMockImplementation()!;
    vi.mocked(runDeviceCommand).mockImplementation(async (file, args, ...rest) =>
      args.includes("ro.build.version.sdk") ? Buffer.from("32") : original(file, args, ...rest),
    );
    await expect(
      driver.control(
        "android:Fixture",
        {
          type: "permission",
          applicationId: "com.example.app",
          permission: "notifications",
          decision: "grant",
        },
        bootId,
        signal,
      ),
    ).rejects.toMatchObject({ code: "device_control_unavailable" });
    await driver.control("android:Fixture", { type: "powerOff" }, bootId, signal);
    expect(runDeviceCommand).toHaveBeenLastCalledWith(
      "adb",
      ["-s", "emulator-5554", "emu", "kill"],
      signal,
    );
    await driver.dispose();
  });
});

describe("iPhone Duo foldable support", () => {
  const duoUdid = "5a975076-a203-4843-941f-fecb8ec66d38";
  const phoneUdid = "5468f955-91e6-4629-9b19-998164332157";
  const duoRuntime = "com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4";

  function duoFixture(
    options: {
      qualified?: boolean;
      duoDevice?: boolean;
      duoRuntime?: boolean;
      foldFails?: boolean;
      displayLagReads?: number;
    } = {},
  ) {
    Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
    const state = { booted: true, angle: 180, displayReadsSinceFold: Number.POSITIVE_INFINITY };
    const setHingeAngle = vi.fn<(angle: number, active: AbortSignal) => Promise<void>>(
      async (angle) => {
        if (options.foldFails)
          throw new DeviceWorkspaceError("device_fold_failed", "helper refused", 503);
        state.angle = angle;
        state.displayReadsSinceFold = 0;
      },
    );
    const helper = {
      readConfig: vi.fn<DeviceFoldHelperHandle["readConfig"]>(async () => ({
        width: 2007,
        height: 2853,
        screenId: 3,
        supportsHingeAngle: true,
        hingeAngle: state.angle,
      })),
      setHingeAngle,
      release: vi.fn<() => Promise<void>>(async () => {}),
    };
    const foldRuntime: DeviceFoldRuntime = {
      prepare: async () => {},
      qualified: () => options.qualified ?? true,
      acquireHelper: vi.fn<DeviceFoldRuntime["acquireHelper"]>(async () => helper),
    };
    vi.mocked(runDeviceCommand).mockImplementation(async (_file, args) => {
      if (args[0] === "devicectl") {
        // Simulate the lit panel lagging the hinge: the first reads after a
        // fold still report the outer panel active.
        state.displayReadsSinceFold += 1;
        const innerActive = state.displayReadsSinceFold > (options.displayLagReads ?? 0);
        return Buffer.from(
          JSON.stringify({
            result: {
              displays: [
                {
                  displayId: 1,
                  active: !innerActive,
                  primary: true,
                  nativeSize: [1398, 2034],
                  pointScale: 3,
                  currentOrientation: "rot0",
                },
                {
                  displayId: 3,
                  active: innerActive,
                  primary: false,
                  nativeSize: [2007, 2853],
                  pointScale: 3,
                  currentOrientation: "rot90",
                },
              ],
            },
          }),
        );
      }
      if (args[0] === "simctl" && args[1] === "list" && args[2] === "runtimes")
        return Buffer.from(
          JSON.stringify({
            runtimes: [
              {
                identifier: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
                isAvailable: true,
                supportedDeviceTypes: [
                  { identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17" },
                ],
              },
              ...((options.duoRuntime ?? true)
                ? [
                    {
                      identifier: duoRuntime,
                      isAvailable: true,
                      supportedDeviceTypes: [{ identifier: IPHONE_DUO_DEVICE_TYPE }],
                    },
                  ]
                : []),
            ],
          }),
        );
      if (args[0] === "simctl" && args[1] === "create") return Buffer.from(`${duoUdid}\n`);
      if (args[0] === "simctl" && args[1] === "io") {
        await writeFile(args.at(-1)!, Buffer.from("png-fixture"));
        return Buffer.from("");
      }
      if (args[0] === "simctl")
        return Buffer.from(
          JSON.stringify({
            devices: {
              [duoRuntime]: [
                ...((options.duoDevice ?? true)
                  ? [
                      {
                        udid: duoUdid,
                        name: "iPhone Duo",
                        state: state.booted ? "Booted" : "Shutdown",
                        deviceTypeIdentifier: IPHONE_DUO_DEVICE_TYPE,
                      },
                    ]
                  : []),
                {
                  udid: phoneUdid,
                  name: "Fixture iPhone",
                  state: "Booted",
                  deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
                },
              ],
            },
          }),
        );
      return Buffer.from("");
    });
    const driver = new NativeDeviceDriver(foldRuntime);
    return {
      driver,
      state,
      setHingeAngle,
      helper,
      foldRuntime,
      signal: new AbortController().signal,
    };
  }

  it("marks only the Duo type foldable and advertises fold controls for a running foldable on a qualified host", async () => {
    const { driver, signal } = duoFixture();
    try {
      const inventory = await driver.discover(signal);
      const duo = inventory.devices.find((device) => device.id === `ios:${duoUdid}`)!;
      const phone = inventory.devices.find((device) => device.id === `ios:${phoneUdid}`)!;
      expect(duo.foldable).toBe(true);
      expect(duo.controls?.actions).toEqual(["read", "fold"]);
      expect(duo.controls?.bootId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(phone.foldable).toBeUndefined();
      expect(phone.controls).toBeUndefined();
      expect(inventory.platforms.find((entry) => entry.platform === "ios")).toMatchObject({
        foldableRuntimeAvailable: true,
        foldableDeviceExists: true,
      });
    } finally {
      await driver.dispose();
    }
  });

  it("never advertises fold controls on an unqualified host", async () => {
    const { driver, signal } = duoFixture({ qualified: false });
    try {
      const inventory = await driver.discover(signal);
      const duo = inventory.devices.find((device) => device.id === `ios:${duoUdid}`)!;
      expect(duo.foldable).toBe(true);
      expect(duo.controls).toBeUndefined();
    } finally {
      await driver.dispose();
    }
  });

  it("mints a new bootId after the foldable is observed stopped and booted again", async () => {
    const { driver, state, signal } = duoFixture();
    try {
      const first = (await driver.discover(signal)).devices.find(
        (device) => device.id === `ios:${duoUdid}`,
      )!.controls!.bootId;
      state.booted = false;
      const stopped = (await driver.discover(signal)).devices.find(
        (device) => device.id === `ios:${duoUdid}`,
      )!;
      expect(stopped.state).toBe("stopped");
      expect(stopped.controls).toBeUndefined();
      state.booted = true;
      const second = (await driver.discover(signal)).devices.find(
        (device) => device.id === `ios:${duoUdid}`,
      )!.controls!.bootId;
      expect(second).not.toBe(first);
    } finally {
      await driver.dispose();
    }
  });

  it("dispatches the exact hinge angle, reads back state, and surfaces helper refusal as a typed error", async () => {
    const ok = duoFixture();
    try {
      const inventory = await ok.driver.discover(ok.signal);
      const bootId = inventory.devices.find((device) => device.id === `ios:${duoUdid}`)!.controls!
        .bootId;
      await expect(
        ok.driver.control(`ios:${duoUdid}`, { type: "read" }, bootId, ok.signal),
      ).resolves.toEqual({ version: 1, hingeAngle: 180, activeDisplay: "inner" });
      await expect(
        ok.driver.control(`ios:${duoUdid}`, { type: "fold", angle: 90 }, bootId, ok.signal),
      ).resolves.toEqual({ version: 1, hingeAngle: 90, activeDisplay: "inner" });
      expect(ok.setHingeAngle).toHaveBeenCalledExactlyOnceWith(90, ok.signal);
      // Read and fold must acquire the helper under the advertised boot
      // identity so they share live preview's pooled hub generation.
      expect(ok.foldRuntime.acquireHelper).toHaveBeenCalledWith(duoUdid, bootId, ok.signal);
    } finally {
      await ok.driver.dispose();
    }
    // The lit panel lags the hinge on real hardware; the fold result must
    // wait for the panel switch instead of reporting the pre-fold panel.
    const lagging = duoFixture({ displayLagReads: 2 });
    try {
      const inventory = await lagging.driver.discover(lagging.signal);
      const bootId = inventory.devices.find((device) => device.id === `ios:${duoUdid}`)!.controls!
        .bootId;
      await expect(
        lagging.driver.control(
          `ios:${duoUdid}`,
          { type: "fold", angle: 180 },
          bootId,
          lagging.signal,
        ),
      ).resolves.toEqual({ version: 1, hingeAngle: 180, activeDisplay: "inner" });
    } finally {
      await lagging.driver.dispose();
    }
    const failing = duoFixture({ foldFails: true });
    try {
      const inventory = await failing.driver.discover(failing.signal);
      const bootId = inventory.devices.find((device) => device.id === `ios:${duoUdid}`)!.controls!
        .bootId;
      await expect(
        failing.driver.control(
          `ios:${duoUdid}`,
          { type: "fold", angle: 0 },
          bootId,
          failing.signal,
        ),
      ).rejects.toMatchObject({ code: "device_fold_failed" });
      expect(failing.helper.release).toHaveBeenCalled();
    } finally {
      await failing.driver.dispose();
    }
  });

  it("captures the active display with rotated point dimensions for foldables only", async () => {
    const { driver, signal } = duoFixture();
    try {
      await driver.discover(signal);
      const capture = await driver.capture(`ios:${duoUdid}`, signal);
      expect(capture.inputWidth).toBe(951);
      expect(capture.inputHeight).toBe(669);
      const shot = vi
        .mocked(runDeviceCommand)
        .mock.calls.filter((call) => call[1][1] === "io")
        .at(-1)!;
      expect(shot[1]).toContain("--display=3");
    } finally {
      await driver.dispose();
    }
    vi.mocked(findDeviceTool).mockImplementation(async (name) =>
      name === "idb" || name === "idb_companion" ? null : name,
    );
    const plain = duoFixture();
    try {
      await plain.driver.discover(plain.signal);
      await plain.driver.capture(`ios:${phoneUdid}`, plain.signal);
      const shot = vi
        .mocked(runDeviceCommand)
        .mock.calls.filter((call) => call[1][1] === "io")
        .at(-1)!;
      expect(shot[1].some((arg) => arg.startsWith("--display="))).toBe(false);
    } finally {
      await plain.driver.dispose();
    }
  });

  it("refuses Duo creation without a Duo-capable runtime and uses the exact simctl create argv when one exists", async () => {
    const missing = duoFixture({ duoDevice: false, duoRuntime: false });
    try {
      await missing.driver.discover(missing.signal);
      await expect(missing.driver.createDuo(missing.signal)).rejects.toMatchObject({
        code: "duo_runtime_unavailable",
      });
      await expect(missing.driver.createDuo(missing.signal)).rejects.toThrow(
        "Xcode Settings > Components",
      );
    } finally {
      await missing.driver.dispose();
    }
    const ready = duoFixture({ duoDevice: false });
    try {
      await ready.driver.discover(ready.signal);
      await ready.driver.createDuo(ready.signal);
      expect(runDeviceCommand).toHaveBeenCalledWith(
        "/usr/bin/xcrun",
        ["simctl", "create", "iPhone Duo", IPHONE_DUO_DEVICE_TYPE, duoRuntime],
        ready.signal,
        60_000,
      );
    } finally {
      await ready.driver.dispose();
    }
  });
});
