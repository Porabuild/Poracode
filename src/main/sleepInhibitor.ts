import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { powerSaveBlocker } from "electron";

const LOG_PREFIX = "[poracode] sleepInhibitor:";

export interface SleepInhibitor {
  setActive(active: boolean): void;
  dispose(): void;
}

type PowerSaveBlockerType = "prevent-app-suspension" | "prevent-display-sleep";

interface PowerSaveBlockerApi {
  start(type: PowerSaveBlockerType): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { stdio: ["pipe", "ignore", "ignore"]; detached: false },
) => ChildProcess;

interface SleepInhibitorOptions {
  platform?: NodeJS.Platform;
  electronBlocker?: PowerSaveBlockerApi;
  spawnFn?: SpawnFn;
  logger?: (message: string) => void;
}

/** One native inhibitor command; Linux tries a channel's candidates in order. */
interface LinuxInhibitorCommand {
  command: string;
  args: readonly string[];
}

// System sleep: suspend-only inhibitors, so the display can still turn off.
const LINUX_SLEEP_COMMANDS: readonly LinuxInhibitorCommand[] = [
  {
    command: "systemd-inhibit",
    args: ["--what=sleep", "--who=Poracode", "--why=Poracode is active", "--mode=block", "cat"],
  },
  {
    command: "gnome-session-inhibit",
    args: ["--inhibit", "suspend", "--reason", "Poracode is active", "cat"],
  },
];

// Screen lock: idle inhibitors keep the session from going idle, which is what
// starts the screensaver, display blanking and the idle lock. GNOME ignores
// logind idle inhibitors, so its session inhibitor goes first.
const LINUX_SCREEN_LOCK_COMMANDS: readonly LinuxInhibitorCommand[] = [
  {
    command: "gnome-session-inhibit",
    args: ["--inhibit", "idle", "--reason", "Poracode is keeping the screen awake", "cat"],
  },
  {
    command: "systemd-inhibit",
    args: [
      "--what=idle",
      "--who=Poracode",
      "--why=Poracode is keeping the screen awake",
      "--mode=block",
      "cat",
    ],
  },
];

class ElectronInhibitor implements SleepInhibitor {
  private blockerId: number | null = null;

  constructor(
    private readonly blocker: PowerSaveBlockerApi,
    private readonly type: PowerSaveBlockerType,
    private readonly log: (message: string) => void,
  ) {}

  setActive(active: boolean): void {
    if (active) {
      if (this.blockerId !== null) return;
      const id = this.blocker.start(this.type);
      if (!this.blocker.isStarted(id)) {
        this.log(`${LOG_PREFIX} powerSaveBlocker.start did not activate (id=${id})`);
      }
      this.blockerId = id;
    } else {
      if (this.blockerId === null) return;
      if (this.blocker.isStarted(this.blockerId)) {
        this.blocker.stop(this.blockerId);
      }
      this.blockerId = null;
    }
  }

  dispose(): void {
    this.setActive(false);
  }
}

class LinuxInhibitor implements SleepInhibitor {
  private child: ChildProcess | null = null;
  private active = false;
  private candidateIndex = 0;
  private disabled = false;

  constructor(
    private readonly candidates: readonly LinuxInhibitorCommand[],
    private readonly spawnFn: SpawnFn,
    private readonly log: (message: string) => void,
  ) {}

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      if (this.disabled || this.child !== null) return;
      this.spawnChild();
    } else {
      this.killChild();
    }
  }

  dispose(): void {
    this.setActive(false);
    this.disabled = true;
  }

  private spawnChild(): void {
    const candidate = this.candidates[this.candidateIndex];
    if (!candidate) return;
    const { command, args } = candidate;
    let child: ChildProcess;
    try {
      child = this.spawnFn(command, args, {
        stdio: ["pipe", "ignore", "ignore"],
        detached: false,
      });
    } catch (error) {
      this.fallback(`${command} unavailable: ${describeError(error)}`);
      return;
    }

    this.child = child;
    child.once("error", (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.fallback(`${command} failed: ${describeError(error)}`);
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.fallback(`${command} exited code=${code} signal=${signal ?? "null"}`);
    });
  }

  private fallback(message: string): void {
    this.log(`${LOG_PREFIX} ${message}`);
    this.candidateIndex += 1;
    if (this.candidateIndex >= this.candidates.length) {
      this.disabled = true;
      return;
    }
    if (this.active) this.spawnChild();
  }

  private killChild(): void {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    // Closing stdin lets `cat` exit cleanly, which releases the inhibitor
    // lock. SIGTERM is a fallback in case stdin close is ignored.
    try {
      child.stdin?.end();
    } catch {
      /* ignore */
    }
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveOptions(options: SleepInhibitorOptions) {
  return {
    platform: options.platform ?? process.platform,
    log: options.logger ?? ((message: string) => console.warn(message)),
    blocker: options.electronBlocker ?? powerSaveBlocker,
    spawnFn: options.spawnFn ?? (nodeSpawn as unknown as SpawnFn),
  };
}

/** Prevents system sleep while allowing the display to turn off. */
export function createSleepInhibitor(options: SleepInhibitorOptions = {}): SleepInhibitor {
  const { platform, log, blocker, spawnFn } = resolveOptions(options);
  if (platform === "linux") {
    // Electron 44 also suspends the screensaver for app-suspension blockers,
    // preventing Wayland display-off. Native suspend-only inhibitors avoid it.
    return new LinuxInhibitor(LINUX_SLEEP_COMMANDS, spawnFn, log);
  }
  // Keep background work running while allowing the display to turn off.
  return new ElectronInhibitor(blocker, "prevent-app-suspension", log);
}

/**
 * Keeps the display awake, so idle display sleep cannot trigger the OS idle
 * screen lock. On macOS this is the `PreventUserIdleDisplaySleep` assertion.
 * Manual locking, lid close, and enforced lock policies are not affected.
 */
export function createScreenLockInhibitor(options: SleepInhibitorOptions = {}): SleepInhibitor {
  const { platform, log, blocker, spawnFn } = resolveOptions(options);
  if (platform === "linux") return new LinuxInhibitor(LINUX_SCREEN_LOCK_COMMANDS, spawnFn, log);
  return new ElectronInhibitor(blocker, "prevent-display-sleep", log);
}
