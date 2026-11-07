import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ComputerUseLockedUseStatus } from "@/shared/contracts/computerUse";
import {
  UNSUPPORTED_LOCKED_COMPUTER_USE_STATUS,
  type LockedComputerUseActionResult,
  type LockedComputerUseStatus,
} from "@/shared/contracts/lockedComputerUse";
import {
  buildAdminPromptArgs,
  mapInstallerFailure,
  type LockedUseInstallerVerb,
} from "./adminCommand";
import {
  LOCKED_USE_INSTALLER_NAME,
  LOCKED_USE_PLUGIN_BUNDLE_PATH,
  LOCKED_USE_STATE_PATH,
} from "./constants";

export interface CommandResult {
  /** Exit code; null when the process was killed or could not start. */
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs one executable without a shell. Tests inject a fake. */
export type CommandRunner = (
  file: string,
  args: readonly string[],
  options: { timeoutMs: number },
) => Promise<CommandResult>;

export const defaultCommandRunner: CommandRunner = (file, args, options) =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { timeout: options.timeoutMs, maxBuffer: 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        resolve({ code, stdout, stderr });
      },
    );
  });

export interface LockedComputerUseFileSystem {
  exists(path: string): boolean;
  /** Returns null when the file cannot be read. */
  readText(path: string): string | null;
}

const nodeFileSystem: LockedComputerUseFileSystem = {
  exists: (path) => existsSync(path),
  readText: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
};

export interface LockedComputerUseServiceOptions {
  /** `<resources>/locked-computer-use`; see `resolveLockedComputerUseResourcesDir`. */
  resourcesDir: string;
  /** The helper's `locked_use_status`; null when no helper can answer. */
  helperStatus: () => Promise<ComputerUseLockedUseStatus | null>;
  platform?: NodeJS.Platform;
  /** Console user id the installer prepares `run/<uid>/` for. */
  uid?: number | null;
  runCommand?: CommandRunner;
  fs?: LockedComputerUseFileSystem;
  now?: () => number;
  /** How long `isInstalledCached` trusts the last status read. */
  installedCacheMs?: number;
  beforeUninstall?: () => Promise<void>;
}

const stateFileSchema = z.object({
  schemaVersion: z.literal(1),
  pluginVersion: z.string(),
  users: z.array(z.number().int().nonnegative()),
});

const installerStatusSchema = z.object({
  installed: z.boolean(),
  ruleInstalled: z.boolean(),
  rightInstalled: z.boolean(),
  bundleInstalled: z.boolean(),
  pluginVersion: z.string().nullable(),
  bundledPluginVersion: z.string().nullable(),
});

const STATUS_READ_TIMEOUT_MS = 5_000;
/** The administrator prompt waits on the user, so allow a long time. */
const ADMIN_PROMPT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_INSTALLED_CACHE_MS = 30_000;

/**
 * Installs, removes, and reports Locked Computer Use on macOS. Composed in the
 * shared host layer, so desktop and the standalone server read the same
 * status; install and uninstall are reachable only through the desktop
 * shell's local IPC (see `src/main/ipc/localHandlers.ts`), never a remote
 * route. Every privileged step runs inside the bundled installer behind one
 * administrator prompt; this service only reads system state.
 */
export class LockedComputerUseService {
  private readonly platform: NodeJS.Platform;
  private readonly uid: number | null;
  private readonly runCommand: CommandRunner;
  private readonly fs: LockedComputerUseFileSystem;
  private readonly now: () => number;
  private readonly installedCacheMs: number;
  private installedCache: { value: boolean; at: number } | null = null;
  private running: Promise<LockedComputerUseActionResult> | null = null;

  constructor(private readonly options: LockedComputerUseServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.uid = options.uid === undefined ? (process.getuid?.() ?? null) : options.uid;
    this.runCommand = options.runCommand ?? defaultCommandRunner;
    this.fs = options.fs ?? nodeFileSystem;
    this.now = options.now ?? Date.now;
    this.installedCacheMs = options.installedCacheMs ?? DEFAULT_INSTALLED_CACHE_MS;
  }

  get installerPath(): string {
    return join(this.options.resourcesDir, LOCKED_USE_INSTALLER_NAME);
  }

  async status(): Promise<LockedComputerUseStatus> {
    if (this.platform !== "darwin" || this.uid === null) {
      return UNSUPPORTED_LOCKED_COMPUTER_USE_STATUS;
    }
    const [installation, helper] = await Promise.all([
      this.readInstallerStatus(),
      this.readHelperStatus(),
    ]);
    const bundle = this.fs.exists(LOCKED_USE_PLUGIN_BUNDLE_PATH);
    const stateText = this.fs.readText(LOCKED_USE_STATE_PATH);
    const state = stateText === null ? null : this.parseState(stateText);
    const stateCoversUser = state?.users.includes(this.uid) === true;
    const compatible =
      installation !== null &&
      installation.pluginVersion !== null &&
      installation.bundledPluginVersion === installation.pluginVersion &&
      state?.pluginVersion === installation.pluginVersion;
    const installed = bundle && installation?.installed === true && stateCoversUser && compatible;
    const status: LockedComputerUseStatus = {
      platformSupported: true,
      installed,
      needsRepair:
        !installed &&
        (bundle ||
          installation?.rightInstalled === true ||
          installation?.ruleInstalled === true ||
          stateText !== null),
      signed: helper?.signed === true,
      paused: helper?.paused === true,
      active: helper?.active === true,
    };
    this.installedCache = { value: installed, at: this.now() };
    return status;
  }

  /**
   * Cheap installed check for the per-tool gate: re-reads the system at most
   * once per cache window instead of spawning `security` for every action.
   */
  async isInstalledCached(): Promise<boolean> {
    if (this.platform !== "darwin") return false;
    const cached = this.installedCache;
    if (cached && this.now() - cached.at < this.installedCacheMs) return cached.value;
    return (await this.status()).installed;
  }

  install(): Promise<LockedComputerUseActionResult> {
    return this.runExclusive("install");
  }

  uninstall(): Promise<LockedComputerUseActionResult> {
    return this.runExclusive("uninstall");
  }

  private async runExclusive(verb: LockedUseInstallerVerb): Promise<LockedComputerUseActionResult> {
    if (this.running) return { ok: false, error: "busy", status: await this.status() };
    const run = this.runInstaller(verb);
    this.running = run;
    try {
      return await run;
    } finally {
      this.running = null;
    }
  }

  private async runInstaller(verb: LockedUseInstallerVerb): Promise<LockedComputerUseActionResult> {
    if (this.platform !== "darwin" || this.uid === null) {
      return { ok: false, error: "unsupported_platform", status: await this.status() };
    }
    if (verb === "install") {
      // The plug-in only honors a helper signed by the app's own team; an
      // unsigned (development) build would install a plug-in that always
      // denies, so refuse before asking for an administrator password.
      const before = await this.status();
      if (!before.signed) return { ok: false, error: "unsigned_build", status: before };
    }
    if (verb === "uninstall") await this.options.beforeUninstall?.();
    const installerPath = this.installerPath;
    if (!this.fs.exists(installerPath)) {
      return { ok: false, error: "installer_missing", status: await this.status() };
    }
    const result = await this.runCommand(
      "/usr/bin/osascript",
      buildAdminPromptArgs(installerPath, verb, this.uid),
      { timeoutMs: ADMIN_PROMPT_TIMEOUT_MS },
    );
    this.installedCache = null;
    const status = await this.status();
    if (result.code === 0) return { ok: true, status };
    const error = mapInstallerFailure(verb, result.stderr);
    return error === null ? { ok: true, status } : { ok: false, error, status };
  }

  private async readInstallerStatus(): Promise<z.infer<typeof installerStatusSchema> | null> {
    try {
      // Reuse the installer's exact rule/right/bundle checks; the host must not
      // maintain a weaker copy of authorization policy parsing.
      if (!this.fs.exists(this.installerPath)) return null;
      const result = await this.runCommand(this.installerPath, ["status"], {
        timeoutMs: STATUS_READ_TIMEOUT_MS,
      });
      if (result.code !== 0) return null;
      const parsed = installerStatusSchema.safeParse(JSON.parse(result.stdout));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async readHelperStatus(): Promise<ComputerUseLockedUseStatus | null> {
    try {
      return await this.options.helperStatus();
    } catch {
      return null;
    }
  }

  private parseState(text: string): z.infer<typeof stateFileSchema> | null {
    try {
      // A future schema version is not ours to interpret: report it as not
      // covering this user rather than guessing at its shape.
      const parsed = stateFileSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
