import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { powerSaveBlocker } from "electron";

const LOG_PREFIX = "[poracode] sleepInhibitor:";

export interface SleepInhibitor {
  setActive(active: boolean): void;
  dispose(): void;
}

interface PowerSaveBlockerApi {
  start(type: "prevent-app-suspension"): number;
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

class ElectronInhibitor implements SleepInhibitor {
  private blockerId: number | null = null;

  constructor(
    private readonly blocker: PowerSaveBlockerApi,
    private readonly log: (message: string) => void,
  ) {}

  setActive(active: boolean): void {
    if (active) {
      if (this.blockerId !== null) return;
      // Keep background work running while allowing the display to turn off.
      const id = this.blocker.start("prevent-app-suspension");
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
  private useGnome = false;
  private disabled = false;

  constructor(
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
    const command = this.useGnome ? "gnome-session-inhibit" : "systemd-inhibit";
    const args = this.useGnome
      ? ["--inhibit", "suspend", "--reason", "Poracode is active", "cat"]
      : ["--what=sleep", "--who=Poracode", "--why=Poracode is active", "--mode=block", "cat"];
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
    if (this.useGnome) {
      this.disabled = true;
      return;
    }
    this.useGnome = true;
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

export function createSleepInhibitor(options: SleepInhibitorOptions = {}): SleepInhibitor {
  const platform = options.platform ?? process.platform;
  const log = options.logger ?? ((message: string) => console.warn(message));
  const blocker = options.electronBlocker ?? powerSaveBlocker;
  const spawnFn = options.spawnFn ?? (nodeSpawn as unknown as SpawnFn);

  if (platform === "linux") {
    // Electron 44 also suspends the screensaver for app-suspension blockers,
    // preventing Wayland display-off. Native suspend-only inhibitors avoid it.
    return new LinuxInhibitor(spawnFn, log);
  }
  return new ElectronInhibitor(blocker, log);
}
