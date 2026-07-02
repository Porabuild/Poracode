import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { powerSaveBlocker } from "electron";

const LOG_PREFIX = "[lightcode] sleepInhibitor:";

export interface SleepInhibitor {
  setActive(active: boolean): void;
  dispose(): void;
}

interface PowerSaveBlockerApi {
  start(type: "prevent-app-suspension" | "prevent-display-sleep"): number;
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

interface Inhibitor {
  setActive(active: boolean): void;
  dispose(): void;
}

class ElectronInhibitor implements Inhibitor {
  private blockerId: number | null = null;

  constructor(
    private readonly blocker: PowerSaveBlockerApi,
    private readonly log: (message: string) => void,
  ) {}

  setActive(active: boolean): void {
    if (active) {
      if (this.blockerId !== null) return;
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

class SystemdInhibitor implements Inhibitor {
  private child: ChildProcess | null = null;
  private disabled = false;

  constructor(
    private readonly spawnFn: SpawnFn,
    private readonly log: (message: string) => void,
  ) {}

  setActive(active: boolean): void {
    if (active) {
      if (this.disabled || this.child !== null) return;
      this.spawnChild();
    } else {
      this.killChild();
    }
  }

  dispose(): void {
    this.killChild();
    this.disabled = true;
  }

  private spawnChild(): void {
    let child: ChildProcess;
    try {
      child = this.spawnFn(
        "systemd-inhibit",
        [
          "--what=sleep:idle",
          "--who=Poracode",
          "--why=Agent thread is working",
          "--mode=block",
          "cat",
        ],
        { stdio: ["pipe", "ignore", "ignore"], detached: false },
      );
    } catch (error) {
      this.log(`${LOG_PREFIX} systemd-inhibit unavailable: ${describeError(error)}`);
      this.disabled = true;
      return;
    }

    child.once("error", (error) => {
      this.log(`${LOG_PREFIX} systemd-inhibit failed: ${describeError(error)}`);
      if (this.child === child) {
        this.child = null;
      }
      this.disabled = true;
    });
    child.once("exit", (code, signal) => {
      if (this.child === child) {
        this.child = null;
      }
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGKILL") {
        this.log(`${LOG_PREFIX} systemd-inhibit exited code=${code} signal=${signal ?? "null"}`);
      }
    });
    this.child = child;
  }

  private killChild(): void {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    // Closing stdin lets `cat` exit cleanly, which releases the systemd-inhibit
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

class CompositeInhibitor implements SleepInhibitor {
  constructor(private readonly inhibitors: readonly Inhibitor[]) {}

  setActive(active: boolean): void {
    for (const inhibitor of this.inhibitors) {
      inhibitor.setActive(active);
    }
  }

  dispose(): void {
    for (const inhibitor of this.inhibitors) {
      inhibitor.dispose();
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

  const inhibitors: Inhibitor[] = [new ElectronInhibitor(blocker, log)];
  if (platform === "linux") {
    // Electron's powerSaveBlocker does not take a systemd-logind sleep lock,
    // so on systemd distros with idle-suspend enabled the app would still
    // suspend. `systemd-inhibit` is the only thing that holds that lock.
    inhibitors.push(new SystemdInhibitor(spawnFn, log));
  }
  return new CompositeInhibitor(inhibitors);
}
