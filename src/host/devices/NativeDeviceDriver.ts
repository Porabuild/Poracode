import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
import type {
  DeviceInput,
  DeviceControl,
  DeviceControlState,
  DeviceInspection,
  DeviceInventory,
  DeviceTarget,
} from "@/shared/deviceWorkspace";
import { deviceControlTypeSchema, deviceControlSchema } from "@/shared/deviceWorkspace";
import { runAndroidDeviceControl } from "./nativeDeviceControls";
import type { DeviceFoldRuntime } from "./deviceFold";
import {
  DeviceWorkspaceError,
  findDeviceTool,
  launchDeviceProcess,
  runDeviceCommand,
} from "./deviceProcess";

export interface DeviceCapture {
  png: Buffer;
  // Input coordinates are pixels on Android, points on iOS. Never infer an iOS scale.
  inputWidth?: number;
  inputHeight?: number;
}
export interface DeviceStreamTarget {
  clientDeviceId: string;
  bootId?: string;
  adbPath?: string;
}
export interface DeviceDriver {
  discover(signal: AbortSignal): Promise<Omit<DeviceInventory, "version" | "generation">>;
  start(deviceId: string, signal: AbortSignal): Promise<void>;
  capture(deviceId: string, signal: AbortSignal): Promise<DeviceCapture>;
  inspect(deviceId: string, signal: AbortSignal): Promise<DeviceInspection>;
  streamTarget?(deviceId: string, signal: AbortSignal): Promise<DeviceStreamTarget>;
  input(
    deviceId: string,
    input: DeviceInput,
    geometry: { width: number; height: number } | null,
    signal: AbortSignal,
  ): Promise<void>;
  control?(
    deviceId: string,
    control: DeviceControl,
    bootId: string,
    signal: AbortSignal,
    authorize?: () => void,
  ): Promise<DeviceControlState | undefined>;
  createDuo?(signal: AbortSignal): Promise<void>;
  bindFoldRuntime?(runtime: DeviceFoldRuntime): void;
  release(deviceId: string): Promise<void>;
  dispose(): Promise<void>;
}
type NativeTarget = { target: DeviceTarget; nativeId: string; serial?: string };
// The only foldable CoreSimulator device type today (iPhone19,4, iOS 27.1+).
export const IPHONE_DUO_DEVICE_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo";
const simctlDevicesSchema = z.object({
  devices: z.record(
    z.string(),
    z.array(
      z.object({
        udid: z.uuid(),
        name: z.string(),
        state: z.string(),
        isAvailable: z.boolean().optional(),
        deviceTypeIdentifier: z.string().optional(),
      }),
    ),
  ),
});
const simctlRuntimesSchema = z.object({
  runtimes: z.array(
    z.object({
      identifier: z.string(),
      isAvailable: z.boolean().optional(),
      supportedDeviceTypes: z.array(z.object({ identifier: z.string() })).optional(),
    }),
  ),
});
// `xcrun devicectl device info displays --json-output -` is the one read-back
// source for which Duo panel is lit; display ids are always read, never assumed.
const devicectlDisplaysSchema = z.object({
  result: z.object({
    displays: z.array(
      z.object({
        displayId: z.int().min(0),
        active: z.boolean(),
        primary: z.boolean().optional(),
        nativeSize: z.tuple([z.number().positive(), z.number().positive()]),
        pointScale: z.number().positive(),
        currentOrientation: z.string().optional(),
      }),
    ),
  }),
});
interface FoldableDisplays {
  outerId: number;
  innerId: number;
  activeId: number;
  activeDisplay: "outer" | "inner";
  pointWidth: number;
  pointHeight: number;
}
const idbScreenSchema = z.object({
  screen_dimensions: z.object({
    width_points: z.number().positive(),
    height_points: z.number().positive(),
  }),
});

export class NativeDeviceDriver implements DeviceDriver {
  private targets = new Map<string, NativeTarget>();
  private adb: string | null = null;
  private emulator: string | null = null;
  private idb: string | null = null;
  private companion: string | null = null;
  private readonly companions = new Map<
    string,
    { process: ChildProcess; lifetime: ChildProcessLifetime; path: string; root: string }
  >();
  private disposed = false;
  private readonly starting = new Map<string, ChildProcess>();
  private readonly startFailures = new Map<string, string>();
  // iOS has no boot-id source, so a foldable's control boot identity is
  // minted per observed boot and dropped once the device is seen stopped.
  private readonly iosBootIds = new Map<string, string>();
  // The hinge helper only learns the angle after a fold is sent through it;
  // a fresh hub generation's config omits hingeAngle entirely. Remember the
  // last angle this driver folded to so pose reads stay accurate.
  private readonly foldAngles = new Map<string, number>();
  // Installed runtimes change only through Xcode, so the Duo-runtime probe
  // is memoized per driver lifetime instead of spawning simctl per discover.
  private duoRuntimeCache: { value: string | null } | null = null;

  constructor(private foldRuntime: DeviceFoldRuntime | null = null) {}

  bindFoldRuntime(runtime: DeviceFoldRuntime): void {
    this.foldRuntime ??= runtime;
  }

  private iosBootId(udid: string, booted: boolean): string | undefined {
    if (!booted) {
      this.iosBootIds.delete(udid);
      this.foldAngles.delete(udid);
      return undefined;
    }
    let bootId = this.iosBootIds.get(udid);
    if (!bootId) {
      bootId = randomUUID();
      this.iosBootIds.set(udid, bootId);
    }
    return bootId;
  }

  async discover(signal: AbortSignal): Promise<Omit<DeviceInventory, "version" | "generation">> {
    const platforms: DeviceInventory["platforms"] = [];
    const targets = new Map<string, NativeTarget>();
    const sdkRoots = [
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT,
      process.platform === "win32"
        ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Android", "Sdk")
        : process.platform === "darwin"
          ? join(homedir(), "Library", "Android", "sdk")
          : join(homedir(), "Android", "Sdk"),
    ].filter((root): root is string => Boolean(root));
    const ext = process.platform === "win32" ? ".exe" : "";
    [this.adb, this.emulator] = await Promise.all([
      findDeviceTool(
        "adb",
        sdkRoots.map((root) => join(root, "platform-tools", `adb${ext}`)),
      ),
      findDeviceTool(
        "emulator",
        sdkRoots.map((root) => join(root, "emulator", `emulator${ext}`)),
      ),
    ]);
    if (!this.adb || !this.emulator) platforms.push({ platform: "android", status: "missing_sdk" });
    else {
      try {
        const avds = (await runDeviceCommand(this.emulator, ["-list-avds"], signal))
          .toString()
          .trim()
          .split(/\r?\n/u)
          .filter((name) => /^[A-Za-z0-9._-]+$/u.test(name));
        for (const name of avds.slice(0, 128))
          targets.set(`android:${name}`, {
            nativeId: name,
            target: {
              id: `android:${name}`,
              name,
              platform: "android",
              state: this.starting.has(name) ? "starting" : "stopped",
              input: true,
              accessibility: true,
            },
          });
        const running = (await runDeviceCommand(this.adb, ["devices"], signal)).toString();
        for (const match of running.matchAll(/^(emulator-\d+)\s+device\s*$/gmu)) {
          const serial = match[1]!;
          const name = (
            await runDeviceCommand(this.adb, ["-s", serial, "emu", "avd", "name"], signal)
          )
            .toString()
            .split(/\r?\n/u)[0]
            ?.trim();
          if (!name || !/^[A-Za-z0-9._-]+$/u.test(name)) continue;
          this.starting.delete(name);
          this.startFailures.delete(name);
          const bootId = (
            await runDeviceCommand(
              this.adb,
              ["-s", serial, "shell", "cat", "/proc/sys/kernel/random/boot_id"],
              signal,
            )
          )
            .toString()
            .trim();
          targets.set(`android:${name}`, {
            nativeId: name,
            serial,
            target: {
              id: `android:${name}`,
              name,
              platform: "android",
              state: "running",
              input: true,
              accessibility: true,
              ...(z.uuid().safeParse(bootId).success
                ? {
                    controls: {
                      version: 1 as const,
                      bootId,
                      // Fold is an iOS foldable posture control, not adb-backed.
                      actions: deviceControlTypeSchema.options.filter(
                        (action) => action !== "fold",
                      ),
                    },
                  }
                : {}),
            },
          });
        }
        for (const name of this.startFailures.keys())
          if (!targets.has(`android:${name}`)) this.startFailures.delete(name);
        const diagnostic = [...this.startFailures.values()].join("\n").slice(0, 2000);
        platforms.push({
          platform: "android",
          status: "ready",
          ...(diagnostic ? { diagnostic } : {}),
        });
      } catch (error) {
        platforms.push({
          platform: "android",
          status: "unavailable",
          diagnostic: String(error).slice(0, 2000),
        });
      }
    }
    if (process.platform !== "darwin")
      platforms.push({ platform: "ios", status: "unsupported_host" });
    else {
      try {
        const list = simctlDevicesSchema.parse(
          JSON.parse(
            (
              await runDeviceCommand(
                "/usr/bin/xcrun",
                ["simctl", "list", "devices", "available", "--json"],
                signal,
              )
            ).toString(),
          ),
        );
        [this.idb, this.companion] = await Promise.all([
          findDeviceTool("idb", ["/opt/homebrew/bin/idb", "/usr/local/bin/idb"]),
          findDeviceTool("idb_companion", [
            "/opt/homebrew/bin/idb_companion",
            "/usr/local/bin/idb_companion",
          ]),
        ]);
        // Fold controls ride the live-preview helper, so they are advertised
        // only for a running foldable on a hub-qualified host.
        let foldQualified = false;
        if (this.foldRuntime) {
          await this.foldRuntime.prepare().catch(() => undefined);
          foldQualified = this.foldRuntime.qualified();
        }
        const duoRuntimeId = await this.duoCapableRuntime(signal).catch(() => undefined);
        let foldableDeviceExists = false;
        for (const [runtime, devices] of Object.entries(list.devices))
          for (const device of devices) {
            if (!runtime.includes(".iOS-")) continue;
            if (device.isAvailable === false || targets.size >= 128) continue;
            const id = `ios:${device.udid}`;
            const foldable = device.deviceTypeIdentifier === IPHONE_DUO_DEVICE_TYPE;
            if (foldable) foldableDeviceExists = true;
            const running = device.state === "Booted";
            const bootId = foldable ? this.iosBootId(device.udid, running) : undefined;
            targets.set(id, {
              nativeId: device.udid,
              target: {
                id,
                name: device.name,
                platform: "ios",
                state: running ? "running" : "stopped",
                input: Boolean(this.idb && this.companion),
                accessibility: Boolean(this.idb && this.companion),
                ...(foldable ? { foldable: true } : {}),
                ...(foldable && running && foldQualified && bootId
                  ? {
                      controls: {
                        version: 1 as const,
                        bootId,
                        actions: deviceControlTypeSchema.options.filter(
                          (action) => action === "read" || action === "fold",
                        ),
                      },
                    }
                  : {}),
              },
            });
          }
        platforms.push({
          platform: "ios",
          status: this.idb && this.companion ? "ready" : "missing_idb",
          ...(duoRuntimeId === null
            ? {
                diagnostic:
                  "iPhone Duo needs Xcode 27.1 or newer with its own iOS runtime, installed from Xcode Settings > Components.",
              }
            : {}),
          ...(duoRuntimeId !== undefined
            ? {
                foldableRuntimeAvailable: duoRuntimeId !== null,
                foldableDeviceExists,
              }
            : {}),
        });
      } catch (error) {
        platforms.push({
          platform: "ios",
          status: "missing_xcode",
          diagnostic: String(error).slice(0, 2000),
        });
      }
    }
    signal.throwIfAborted();
    if (this.disposed)
      throw new DeviceWorkspaceError("device_unavailable", "Device service has stopped.");
    this.targets = targets;
    return { platforms, devices: [...targets.values()].map(({ target }) => target).slice(0, 128) };
  }

  private target(id: string): NativeTarget {
    const target = this.targets.get(id);
    if (!target || this.disposed)
      throw new DeviceWorkspaceError(
        "device_unavailable",
        "Refresh the device list and attach again.",
      );
    return target;
  }

  // The Duo needs its own runtime: the general iOS runtime cannot create one.
  // Resolves to the runtime identifier, null when enumeration succeeded but
  // none is Duo-capable; throws when enumeration itself fails.
  private async duoCapableRuntime(signal: AbortSignal): Promise<string | null> {
    if (process.platform !== "darwin") return null;
    if (this.duoRuntimeCache) return this.duoRuntimeCache.value;
    const parsed = simctlRuntimesSchema.parse(
      JSON.parse(
        (
          await runDeviceCommand("/usr/bin/xcrun", ["simctl", "list", "runtimes", "--json"], signal)
        ).toString(),
      ),
    );
    const value =
      parsed.runtimes.find(
        (runtime) =>
          runtime.isAvailable !== false &&
          runtime.identifier.includes(".iOS-") &&
          runtime.supportedDeviceTypes?.some((type) => type.identifier === IPHONE_DUO_DEVICE_TYPE),
      )?.identifier ?? null;
    this.duoRuntimeCache = { value };
    return value;
  }

  private async foldableDisplaysFor(udid: string, signal: AbortSignal): Promise<FoldableDisplays> {
    const parsed = devicectlDisplaysSchema.parse(
      JSON.parse(
        (
          await runDeviceCommand(
            "/usr/bin/xcrun",
            ["devicectl", "device", "info", "displays", "--device", udid, "--json-output", "-"],
            signal,
          )
        ).toString(),
      ),
    );
    const displays = parsed.result.displays;
    const outer = displays.find((display) => display.primary === true) ?? displays[0];
    const inner = displays.find((display) => display !== outer);
    const active = displays.find((display) => display.active);
    if (!outer || !inner || !active)
      throw new DeviceWorkspaceError(
        "device_fold_failed",
        "The foldable displays could not be read back.",
        503,
      );
    let pointWidth = active.nativeSize[0] / active.pointScale;
    let pointHeight = active.nativeSize[1] / active.pointScale;
    // simctl screenshots come back in the active panel's current orientation,
    // so the paired point space rotates with it (idb describe keeps reporting
    // the outer panel and cannot be used here).
    if (active.currentOrientation === "rot90" || active.currentOrientation === "rot270")
      [pointWidth, pointHeight] = [pointHeight, pointWidth];
    return {
      outerId: outer.displayId,
      innerId: inner.displayId,
      activeId: active.displayId,
      activeDisplay: active.displayId === outer.displayId ? "outer" : "inner",
      pointWidth,
      pointHeight,
    };
  }

  async createDuo(signal: AbortSignal): Promise<void> {
    if (process.platform !== "darwin")
      throw new DeviceWorkspaceError(
        "duo_unavailable",
        "iPhone Duo simulators require a macOS host with Xcode 27.1 or newer.",
        501,
      );
    if ([...this.targets.values()].some((entry) => entry.target.foldable)) return;
    // Re-probe: the user may have installed the runtime since the memoized
    // probe ran, and Create is the moment that must see it.
    this.duoRuntimeCache = null;
    const runtimeId = await this.duoCapableRuntime(signal).catch(() => null);
    if (!runtimeId)
      throw new DeviceWorkspaceError(
        "duo_runtime_unavailable",
        "No iPhone Duo runtime is installed. Install the iPhone Duo iOS runtime in Xcode Settings > Components, then try again.",
        400,
      );
    await runDeviceCommand(
      "/usr/bin/xcrun",
      ["simctl", "create", "iPhone Duo", IPHONE_DUO_DEVICE_TYPE, runtimeId],
      signal,
      60_000,
    );
  }
  private async android(
    id: string,
    args: string[],
    signal: AbortSignal,
    authorize?: () => void,
  ): Promise<Buffer> {
    const target = this.target(id);
    if (!this.adb || !target.serial)
      throw new DeviceWorkspaceError(
        "device_not_running",
        "Start the emulator, then refresh and attach.",
      );
    const name = (
      await runDeviceCommand(this.adb, ["-s", target.serial, "emu", "avd", "name"], signal)
    )
      .toString()
      .split(/\r?\n/u)[0]
      ?.trim();
    if (name !== target.nativeId)
      throw new DeviceWorkspaceError(
        "device_identity_changed",
        "The emulator identity changed. Refresh and attach again.",
      );
    authorize?.();
    return runDeviceCommand(this.adb, ["-s", target.serial, ...args], signal);
  }

  async streamTarget(id: string, signal: AbortSignal): Promise<DeviceStreamTarget> {
    const entry = this.target(id);
    if (entry.target.platform === "android") {
      // Resolve only a running AVD, repeating the serial/name fence used by
      // snapshots/input. Never let serve-emu select a physical/first device.
      const state = (await this.android(id, ["get-state"], signal)).toString().trim();
      if (state !== "device")
        throw new DeviceWorkspaceError("device_not_running", "The emulator is not ready.");
      const bootId = (
        await this.android(id, ["shell", "cat", "/proc/sys/kernel/random/boot_id"], signal)
      )
        .toString()
        .trim();
      if (!z.uuid().safeParse(bootId).success)
        throw new DeviceWorkspaceError(
          "device_identity_changed",
          "The emulator boot identity is unavailable. Refresh and attach again.",
        );
      return { clientDeviceId: entry.serial!, bootId, adbPath: this.adb! };
    }
    const list = simctlDevicesSchema.parse(
      JSON.parse(
        (
          await runDeviceCommand(
            "/usr/bin/xcrun",
            ["simctl", "list", "devices", "available", "--json"],
            signal,
          )
        ).toString(),
      ),
    );
    const running = Object.values(list.devices)
      .flat()
      .some(
        (device) =>
          device.udid === entry.nativeId &&
          device.state === "Booted" &&
          device.isAvailable !== false,
      );
    if (!running) {
      if (entry.target.foldable) this.iosBootId(entry.nativeId, false);
      throw new DeviceWorkspaceError(
        "device_not_running",
        "Start the simulator before opening a live preview.",
      );
    }
    const bootId = entry.target.foldable ? this.iosBootId(entry.nativeId, true) : undefined;
    return {
      clientDeviceId: entry.nativeId,
      ...(bootId ? { bootId } : {}),
      ...(this.adb ? { adbPath: this.adb } : {}),
    };
  }

  async start(id: string, signal: AbortSignal): Promise<void> {
    const entry = this.target(id);
    if (entry.target.state !== "stopped") return;
    if (entry.target.platform === "ios") {
      await runDeviceCommand("/usr/bin/xcrun", ["simctl", "boot", entry.nativeId], signal, 30_000);
    } else {
      if (!this.emulator)
        throw new DeviceWorkspaceError(
          "device_unavailable",
          "Android SDK Emulator is unavailable.",
        );
      // Device lifetime is user-owned after launch. Never kill an emulator or
      // shut down CoreSimulator when a preview, thread, or the host closes.
      if (this.starting.has(entry.nativeId)) return;
      this.startFailures.delete(entry.nativeId);
      const child = await launchDeviceProcess(this.emulator, [
        "-avd",
        entry.nativeId,
        "-no-window",
      ]);
      this.starting.set(entry.nativeId, child);
      const exited = (code: number | null, exitSignal: NodeJS.Signals | null) => {
        if (this.starting.get(entry.nativeId) !== child) return;
        this.starting.delete(entry.nativeId);
        if (code !== 0)
          this.startFailures.set(
            entry.nativeId,
            `${entry.nativeId}: emulator exited during startup (${exitSignal ?? code ?? "unknown"}).`,
          );
      };
      child.once("exit", exited);
      if (child.exitCode !== null || child.signalCode !== null)
        exited(child.exitCode, child.signalCode);
    }
  }

  async control(
    id: string,
    input: DeviceControl,
    bootId: string,
    signal: AbortSignal,
    authorize?: () => void,
  ): Promise<DeviceControlState | undefined> {
    const control = deviceControlSchema.parse(input);
    if (this.target(id).target.platform === "ios")
      return this.iosControl(id, control, bootId, signal, authorize);
    if (this.target(id).target.platform !== "android")
      throw new DeviceWorkspaceError(
        "device_control_unavailable",
        "Additional controls are not qualified for this platform.",
        501,
      );
    return runAndroidDeviceControl(async (args) => {
      authorize?.();
      const current = await this.streamTarget(id, signal);
      if (current.bootId !== bootId)
        throw new DeviceWorkspaceError(
          "device_identity_changed",
          "The emulator restarted. Refresh and attach again.",
        );
      return this.android(id, args, signal, authorize);
    }, control);
  }

  private async iosControl(
    id: string,
    control: DeviceControl,
    bootId: string,
    signal: AbortSignal,
    authorize?: () => void,
  ): Promise<DeviceControlState> {
    const entry = this.target(id);
    if (!entry.target.foldable || !this.foldRuntime)
      throw new DeviceWorkspaceError(
        "device_control_unavailable",
        "Additional controls are not qualified for this platform.",
        501,
      );
    if (control.type !== "read" && control.type !== "fold")
      throw new DeviceWorkspaceError(
        "device_control_unavailable",
        "That control is not available for this device.",
        501,
      );
    authorize?.();
    const current = await this.streamTarget(id, signal);
    if (current.bootId !== bootId)
      throw new DeviceWorkspaceError(
        "device_identity_changed",
        "The simulator restarted. Refresh and attach again.",
      );
    authorize?.();
    if (control.type === "read") return this.iosFoldState(entry.nativeId, bootId, signal);
    const helper = await this.foldRuntime.acquireHelper(entry.nativeId, bootId, signal);
    try {
      await helper.setHingeAngle(control.angle, signal);
      // The hinge settles over seconds; poll the helper config until it
      // reports the requested angle instead of assuming the fold landed.
      const deadline = Date.now() + 15_000;
      let hingeAngle: number | undefined;
      for (;;) {
        // A config read can fail while the helper is still coming up; the
        // hinge ack already confirmed the fold, so treat that as unknown
        // angle instead of failing a fold that physically landed.
        const config = await helper.readConfig(signal).catch(() => {
          signal.throwIfAborted();
          return undefined;
        });
        hingeAngle = config?.hingeAngle;
        if (hingeAngle === undefined || hingeAngle === control.angle) break;
        if (Date.now() >= deadline)
          throw new DeviceWorkspaceError(
            "device_fold_failed",
            "The fold did not settle. Capture a fresh frame and retry.",
            503,
          );
        await new Promise((resolve) => setTimeout(resolve, 250));
        signal.throwIfAborted();
      }
      // The lit panel switches after the hinge reports its angle, so poll
      // displays too; reporting the pre-fold panel misleads callers. On
      // timeout report the actual panel — the fold itself has landed.
      const expectedDisplay = control.angle === 0 ? "outer" : control.angle >= 45 ? "inner" : null;
      const displayDeadline = Date.now() + 15_000;
      let displays = await this.foldableDisplaysFor(entry.nativeId, signal);
      if (expectedDisplay !== null) {
        while (displays.activeDisplay !== expectedDisplay && Date.now() < displayDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          signal.throwIfAborted();
          displays = await this.foldableDisplaysFor(entry.nativeId, signal);
        }
      }
      const settledAngle = hingeAngle ?? control.angle;
      this.foldAngles.set(entry.nativeId, settledAngle);
      return {
        version: 1,
        hingeAngle: settledAngle,
        activeDisplay: displays.activeDisplay,
      };
    } finally {
      await helper.release();
    }
  }

  private async iosFoldState(
    udid: string,
    bootId: string,
    signal: AbortSignal,
  ): Promise<DeviceControlState> {
    const displays = await this.foldableDisplaysFor(udid, signal);
    let hingeAngle: number | undefined;
    // Only query an already-active helper on pose reads so snapshot mode does
    // not spawn and immediately tear down a fresh hub process every 5 seconds.
    if (this.foldRuntime && (this.foldRuntime.hasActiveHelper?.(udid, bootId) ?? true)) {
      const helper = await this.foldRuntime.acquireHelper(udid, bootId, signal);
      try {
        hingeAngle = (await helper.readConfig(signal)).hingeAngle;
      } catch {
        signal.throwIfAborted();
        // Read-back of the lit panel still succeeds without the helper.
        hingeAngle = undefined;
      } finally {
        await helper.release();
      }
    }
    if (hingeAngle !== undefined) this.foldAngles.set(udid, hingeAngle);
    const knownAngle = hingeAngle ?? this.foldAngles.get(udid);
    return {
      version: 1,
      ...(knownAngle !== undefined ? { hingeAngle: knownAngle } : {}),
      activeDisplay: displays.activeDisplay,
    };
  }

  async capture(id: string, signal: AbortSignal): Promise<DeviceCapture> {
    const entry = this.target(id);
    if (entry.target.platform === "android")
      return { png: await this.android(id, ["exec-out", "screencap", "-p"], signal) };
    const root = await mkdtemp(join(tmpdir(), "poracode-device-shot-"));
    try {
      const path = join(root, "screen.png");
      // Foldables light one panel at a time; the dark panel captures black.
      const displays = entry.target.foldable
        ? await this.foldableDisplaysFor(entry.nativeId, signal)
        : undefined;
      await runDeviceCommand(
        "/usr/bin/xcrun",
        [
          "simctl",
          "io",
          entry.nativeId,
          "screenshot",
          "--type=png",
          ...(displays ? [`--display=${displays.activeId}`] : []),
          path,
        ],
        signal,
      );
      const png = await readFile(path);
      if (!entry.target.input) return { png };
      if (displays)
        return { png, inputWidth: displays.pointWidth, inputHeight: displays.pointHeight };
      const screen = idbScreenSchema.parse(
        JSON.parse((await this.ios(id, ["describe", "--json"], signal)).toString()),
      ).screen_dimensions;
      return { png, inputWidth: screen.width_points, inputHeight: screen.height_points };
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  async inspect(id: string, signal: AbortSignal): Promise<DeviceInspection> {
    const platform = this.target(id).target.platform;
    const output =
      platform === "android"
        ? (
            await this.android(id, ["exec-out", "uiautomator", "dump", "/dev/tty"], signal)
          ).toString()
        : (await this.ios(id, ["ui", "describe-all", "--json"], signal)).toString();
    const text =
      platform === "android"
        ? output.slice(
            output.indexOf("<?xml") >= 0 ? output.indexOf("<?xml") : output.indexOf("<hierarchy"),
            output.lastIndexOf("</hierarchy>") + 12,
          )
        : output.trim();
    if (!text || (platform === "android" && !text.includes("<hierarchy")))
      throw new DeviceWorkspaceError(
        "inspection_unavailable",
        "No accessibility hierarchy was returned.",
      );
    if (text.length > 128_000)
      throw new DeviceWorkspaceError(
        "inspection_too_large",
        "Accessibility hierarchy exceeds the inspection limit.",
      );
    return {
      version: 1,
      format: platform === "android" ? "android-uiautomator-xml" : "ios-idb-json",
      text,
    };
  }

  async input(
    id: string,
    input: DeviceInput,
    geometry: { width: number; height: number } | null,
    signal: AbortSignal,
  ): Promise<void> {
    const ios = this.target(id).target.platform === "ios";
    let args: string[];
    if (input.kind === "tap" || input.kind === "swipe") {
      if (!geometry)
        throw new DeviceWorkspaceError(
          "stale_frame",
          "Capture a fresh frame before sending coordinates.",
        );
      const x = String(Math.round(input.x * (geometry.width - 1)));
      const y = String(Math.round(input.y * (geometry.height - 1)));
      args =
        input.kind === "tap"
          ? ["tap", x, y]
          : [
              "swipe",
              x,
              y,
              String(Math.round(input.endX * (geometry.width - 1))),
              String(Math.round(input.endY * (geometry.height - 1))),
              ...(ios
                ? ["--duration", String(input.durationMs / 1000)]
                : [String(input.durationMs)]),
            ];
    } else if (input.kind === "key") {
      if (ios && input.key === "back")
        throw new DeviceWorkspaceError(
          "input_unsupported",
          "iOS has no Back hardware key; use an app navigation control.",
        );
      args = ios
        ? input.key === "home"
          ? ["button", "HOME"]
          : ["key", input.key === "enter" ? "40" : "42"]
        : ["keyevent", { home: "3", back: "4", enter: "66", backspace: "67" }[input.key]];
    } else {
      if (!ios && (!/^[\x20-\x7e]+$/u.test(input.text) || input.text.includes("%s")))
        throw new DeviceWorkspaceError(
          "input_unsupported",
          "ADB text input supports printable ASCII; use the emulator keyboard for other text.",
        );
      // adb shell joins arguments into a remote shell command. Quote the text
      // for that shell as well as using execFile on the host.
      args = ios
        ? ["text", "--", input.text]
        : ["text", `'${input.text.replace(/ /gu, "%s").replace(/'/gu, "'\\''")}'`];
    }
    if (ios) await this.ios(id, ["ui", ...args], signal);
    else await this.android(id, ["shell", "input", ...args], signal);
  }

  private async ios(id: string, args: string[], signal: AbortSignal): Promise<Buffer> {
    if (!this.idb || !this.companion)
      throw new DeviceWorkspaceError(
        "missing_idb",
        "Install Meta idb and idb_companion on the macOS host for simulator input and accessibility.",
      );
    let helper = this.companions.get(id);
    if (helper && (helper.process.exitCode !== null || helper.process.signalCode !== null)) {
      await this.release(id);
      helper = undefined;
      signal.throwIfAborted();
    }
    if (!helper) {
      const root = await mkdtemp(join(tmpdir(), "pora-idb-"));
      const path = join(root, "device.sock");
      const process = spawn(
        this.companion,
        ["--udid", this.target(id).nativeId, "--grpc-domain-sock", path],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      helper = { process, lifetime: new ChildProcessLifetime(process), path, root };
      this.companions.set(id, helper);
      try {
        await new Promise<void>((resolve, reject) => {
          let output = "";
          let settled = false;
          const timer = setTimeout(
            () => finish(new Error("Simulator helper startup timed out.")),
            15_000,
          );
          const abort = () => finish(new Error("Simulator helper startup cancelled."));
          const exited = () => finish(new Error("Simulator helper exited."));
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            process.removeListener("error", finish);
            process.removeListener("exit", exited);
            process.stdout?.removeListener("data", data);
            process.stdout?.resume();
            if (error) reject(error);
            else resolve();
          };
          const data = (chunk: Buffer) => {
            output += chunk.toString();
            if (output.length > 64_000) {
              finish(new Error("Simulator helper handshake exceeds the limit."));
              return;
            }
            if (output.includes("\n")) {
              try {
                if (JSON.parse(output.split("\n")[0]!).grpc_path === path) finish();
                else finish(new Error("Unexpected simulator helper handshake."));
              } catch {
                finish(new Error("Invalid simulator helper handshake."));
              }
            }
          };
          signal.addEventListener("abort", abort, { once: true });
          process.once("error", finish);
          process.once("exit", exited);
          process.stderr?.resume();
          process.stdout?.on("data", data);
          if (signal.aborted) abort();
        });
      } catch (error) {
        await this.release(id);
        throw error;
      }
    }
    return runDeviceCommand(this.idb, ["--companion", helper.path, ...args], signal);
  }

  async release(id: string): Promise<void> {
    const helper = this.companions.get(id);
    if (!helper) return;
    await helper.lifetime.stop();
    if (this.companions.get(id) === helper) this.companions.delete(id);
    await rm(helper.root, { recursive: true, force: true });
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.companions.keys()].map((id) => this.release(id)));
  }
}
