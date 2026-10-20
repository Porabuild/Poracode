import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
import { DEVICE_HUB_BOOTSTRAP } from "@/shared/deviceHubArtifact";
import type { DeviceTarget } from "@/shared/deviceWorkspace";
import { readDeviceHubArtifact, type DeviceHubArtifact } from "./deviceHubArtifact";
import { DeviceWorkspaceError } from "./deviceProcess";
import type { DeviceStreamTarget } from "./NativeDeviceDriver";

interface HubProcess {
  origin: string;
  token: string;
  signal: AbortSignal;
  stop(): Promise<void>;
}
interface HubGeneration {
  key: string;
  controller: AbortController;
  holders: Set<symbol>;
  ready: Promise<HubProcess>;
  stop?: () => Promise<void>;
  retiring?: Promise<void>;
}
export interface DeviceHubHandle extends Omit<HubProcess, "stop"> {
  release(): Promise<void>;
}

const CHILD_ENVIRONMENT = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "APPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "LANG",
  "LC_ALL",
  "USER",
  "LOGNAME",
  "DISPLAY",
  "XAUTHORITY",
  "DEVELOPER_DIR",
  "TOOLCHAINS",
  "SDKROOT",
  "ANDROID_HOME",
  "ANDROID_SDK_ROOT",
  "ANDROID_AVD_HOME",
  "ANDROID_USER_HOME",
  "ADB_VENDOR_KEYS",
]);

export function deviceHubChildEnvironment(
  source: NodeJS.ProcessEnv,
  root: string,
  electron = Boolean(process.versions.electron),
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source))
    if (value !== undefined && CHILD_ENVIRONMENT.has(key.toUpperCase())) env[key] = value;
  // Temp-derived helper state belongs to this generation, never another
  // serve-sim session. Neither Node injection nor provider/plugin secrets pass.
  Object.assign(env, { TMPDIR: root, TMP: root, TEMP: root });
  if (electron) env.ELECTRON_RUN_AS_NODE = "1";
  return env;
}

export class DeviceHubRuntime {
  private artifact: DeviceHubArtifact | null = null;
  private prepared: Promise<void> | null = null;
  private readonly generations = new Map<string, HubGeneration>();
  private readonly retirements = new Map<string, HubGeneration>();
  private readonly lifetime = new AbortController();

  constructor(private readonly resourcesRoot: string) {}

  prepare(): Promise<void> {
    this.prepared ??= readDeviceHubArtifact(this.resourcesRoot, this.lifetime.signal).then(
      (artifact) => {
        this.artifact = artifact;
      },
    );
    return this.prepared;
  }

  platforms(): DeviceTarget["platform"][] {
    return this.artifact?.manifest.qualifiedPlatforms.slice() ?? [];
  }

  async acquire(
    signal: AbortSignal,
    platform: DeviceTarget["platform"],
    target: DeviceStreamTarget,
  ): Promise<DeviceHubHandle> {
    signal.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
    await this.prepare();
    // serve-emu keeps a capture warm after socket close. Pool only the same
    // device/boot so its last holder can join stopAll without affecting peers.
    const key = JSON.stringify([platform, target.clientDeviceId, target.bootId ?? null]);
    while (this.retirements.has(key)) await this.retire(this.retirements.get(key)!);
    signal.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
    if (!this.artifact?.manifest.qualifiedPlatforms.includes(platform))
      throw new DeviceWorkspaceError(
        "device_preview_unavailable",
        "This host has no qualified live-preview helper.",
        501,
      );
    let generation = this.generations.get(key);
    if (!generation) {
      if (this.generations.size + this.retirements.size >= 4)
        throw new DeviceWorkspaceError(
          "device_preview_busy",
          "Too many device-preview helpers are active. Close another preview.",
          429,
        );
      const controller = new AbortController();
      const ready = Promise.withResolvers<HubProcess>();
      generation = {
        key,
        controller,
        holders: new Set(),
        ready: ready.promise,
      };
      this.generations.set(key, generation);
      const started = generation;
      void this.launch(
        this.artifact,
        platform,
        AbortSignal.any([controller.signal, this.lifetime.signal]),
        (stop) => {
          started.stop = stop;
        },
        target.adbPath,
      ).then(ready.resolve, ready.reject);
      const retire = () => {
        void this.retire(started).catch(() => undefined);
      };
      void started.ready.then((hub) => {
        hub.signal.addEventListener("abort", retire, { once: true });
        if (hub.signal.aborted) retire();
      }, retire);
    }
    const owned = generation;
    const holder = Symbol();
    owned.holders.add(holder);
    let releasing: Promise<void> | undefined;
    const release = () => {
      signal.removeEventListener("abort", cancel);
      if (releasing) return releasing;
      owned.holders.delete(holder);
      releasing = owned.holders.size === 0 ? this.retire(owned) : Promise.resolve();
      void releasing.catch(() => {
        releasing = undefined;
      });
      return releasing;
    };
    const cancel = () => {
      void release().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      const hub = await owned.ready;
      signal.throwIfAborted();
      hub.signal.throwIfAborted();
      // After setup, the preview owns the reference and joins its streams
      // before releasing it. Aborting a lease must not stop the last helper
      // ahead of that exact connection's pending input cleanup.
      signal.removeEventListener("abort", cancel);
      return { origin: hub.origin, token: hub.token, signal: hub.signal, release };
    } catch (error) {
      await release();
      throw error;
    }
  }

  private retire(generation: HubGeneration): Promise<void> {
    if (generation.retiring) return generation.retiring;
    if (this.generations.get(generation.key) === generation)
      this.generations.delete(generation.key);
    const retirement = generation.ready.then(
      () => generation.stop?.(),
      () => generation.stop?.(),
    );
    generation.retiring = retirement;
    this.retirements.set(generation.key, generation);
    void retirement.then(
      () => {
        if (this.retirements.get(generation.key) === generation)
          this.retirements.delete(generation.key);
      },
      () => {
        delete generation.retiring;
      },
    );
    generation.controller.abort();
    return generation.retiring;
  }

  private async launch(
    artifact: DeviceHubArtifact,
    platform: DeviceTarget["platform"],
    signal: AbortSignal,
    ownStop: (stop: () => Promise<void>) => void,
    adbPath?: string,
  ): Promise<HubProcess> {
    signal.throwIfAborted();
    const root = await mkdtemp(join(tmpdir(), "poracode-device-hub-"));
    let child: ChildProcess;
    try {
      signal.throwIfAborted();
      const args = [
        "--import",
        pathToFileURL(join(artifact.root, DEVICE_HUB_BOOTSTRAP)).href,
        artifact.entry,
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--require-token",
        "--hide-sidebar",
        "--hide-boot-device",
        "--transport",
        "h264",
        "--max-dimension",
        "1280",
        "--video-fps",
        "30",
        "--video-bitrate",
        "4000000",
        "--platform",
        platform,
        ...(platform === "android" ? ["--stream-source", "scrcpy"] : []),
      ];
      const env = deviceHubChildEnvironment(process.env, root);
      if (adbPath) env.PATH = `${dirname(adbPath)}${delimiter}${env.PATH ?? env.Path ?? ""}`;
      child = spawn(process.execPath, args, {
        cwd: artifact.root,
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      throw error;
    }
    const lifetime = new ChildProcessLifetime(child);
    const live = new AbortController();
    const ready = Promise.withResolvers<{ origin: string; token: string }>();
    const unavailable = () =>
      new DeviceWorkspaceError(
        "device_preview_unavailable",
        "The live-preview helper stopped. Retry the preview.",
        503,
      );
    let stopping: Promise<void> | undefined;
    const stop = () => {
      stopping ??= (async () => {
        live.abort();
        if (child.connected && child.exitCode === null && child.signalCode === null) {
          child.send({ type: "device-hub-stop", version: 1 }, () => {});
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            lifetime.closed,
            // Upstream scrcpy joins process exit, owned ADB forwards and its
            // unique working JAR cleanup. Give those bounded steps time to run.
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 15_000);
            }),
          ]).finally(() => clearTimeout(timer));
        }
        await lifetime.stop();
        await rm(root, { recursive: true, force: true });
      })();
      void stopping.catch(() => {
        stopping = undefined;
      });
      return stopping;
    };
    ownStop(stop);
    const cancel = () => {
      ready.reject(signal.reason ?? unavailable());
      void stop().catch(() => undefined);
    };
    child.once("exit", () => {
      live.abort();
      ready.reject(unavailable());
    });
    child.once("error", () => ready.reject(unavailable()));
    // Consume output without retaining/logging the CLI's full-control link or
    // arbitrary helper stderr. Only its fixed readiness grammar is interpreted.
    let output = "";
    let discovered = false;
    child.stdout!.on("data", (chunk: Buffer) => {
      if (discovered) return;
      if (chunk.length > 16_384 || output.length + chunk.length > 16_384) {
        ready.reject(unavailable());
        return;
      }
      output += chunk.toString("utf8");
      const match =
        /Local:\s+http:\/\/localhost:(\d{1,5})\/\?token=([A-Za-z0-9_-]{43})(?:\s|$)/u.exec(output);
      if (match && Number(match[1]) > 0 && Number(match[1]) <= 65_535) {
        ready.resolve({ origin: `http://127.0.0.1:${match[1]}`, token: match[2]! });
        discovered = true;
        output = "";
      }
    });
    child.stderr!.resume();
    const timer = setTimeout(() => ready.reject(unavailable()), 30_000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      const endpoint = await ready.promise;
      signal.throwIfAborted();
      live.signal.throwIfAborted();
      return { ...endpoint, signal: live.signal, stop };
    } catch (error) {
      await stop();
      throw error;
    } finally {
      clearTimeout(timer);
      output = "";
      signal.removeEventListener("abort", cancel);
    }
  }

  async dispose(): Promise<void> {
    this.lifetime.abort();
    await Promise.all([...this.generations.values()].map((generation) => this.retire(generation)));
    await Promise.all([...this.retirements.values()].map((generation) => this.retire(generation)));
    await this.prepared?.catch(() => undefined);
  }
}
