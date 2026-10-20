import { spawn, type ChildProcess } from "node:child_process";
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
  release(deviceId: string): Promise<void>;
  dispose(): Promise<void>;
}
type NativeTarget = { target: DeviceTarget; nativeId: string; serial?: string };
const simctlDevicesSchema = z.object({
  devices: z.record(
    z.string(),
    z.array(
      z.object({
        udid: z.uuid(),
        name: z.string(),
        state: z.string(),
        isAvailable: z.boolean().optional(),
      }),
    ),
  ),
});
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
                      actions: deviceControlTypeSchema.options,
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
        for (const [runtime, devices] of Object.entries(list.devices))
          for (const device of devices) {
            if (!runtime.includes(".iOS-")) continue;
            if (device.isAvailable === false || targets.size >= 128) continue;
            const id = `ios:${device.udid}`;
            targets.set(id, {
              nativeId: device.udid,
              target: {
                id,
                name: device.name,
                platform: "ios",
                state: device.state === "Booted" ? "running" : "stopped",
                input: Boolean(this.idb && this.companion),
                accessibility: Boolean(this.idb && this.companion),
              },
            });
          }
        platforms.push({
          platform: "ios",
          status: this.idb && this.companion ? "ready" : "missing_idb",
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
    if (!running)
      throw new DeviceWorkspaceError(
        "device_not_running",
        "Start the simulator before opening a live preview.",
      );
    return { clientDeviceId: entry.nativeId, ...(this.adb ? { adbPath: this.adb } : {}) };
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

  async capture(id: string, signal: AbortSignal): Promise<DeviceCapture> {
    const entry = this.target(id);
    if (entry.target.platform === "android")
      return { png: await this.android(id, ["exec-out", "screencap", "-p"], signal) };
    const root = await mkdtemp(join(tmpdir(), "poracode-device-shot-"));
    try {
      const path = join(root, "screen.png");
      await runDeviceCommand(
        "/usr/bin/xcrun",
        ["simctl", "io", entry.nativeId, "screenshot", "--type=png", path],
        signal,
      );
      const png = await readFile(path);
      if (!entry.target.input) return { png };
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
