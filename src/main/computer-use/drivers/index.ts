import type { ComputerUseDriver } from "../mcp/types";
import { MacComputerUseDriver } from "./macos";
import { WindowsComputerUseDriver } from "./windows";

class UnsupportedComputerUseDriver implements ComputerUseDriver {
  private unavailable(): Promise<never> {
    return Promise.reject(new Error("Computer Use is only available on macOS and Windows."));
  }

  dispose(): void {
    // No long-lived resources to release.
  }

  listApps(): Promise<never> {
    return this.unavailable();
  }

  listWindows(): Promise<never> {
    return this.unavailable();
  }

  getWindow(): Promise<never> {
    return this.unavailable();
  }

  getWindowState(): Promise<never> {
    return this.unavailable();
  }

  activateWindow(): Promise<never> {
    return this.unavailable();
  }

  click(): Promise<never> {
    return this.unavailable();
  }

  typeText(): Promise<never> {
    return this.unavailable();
  }

  pressKey(): Promise<never> {
    return this.unavailable();
  }

  scroll(): Promise<never> {
    return this.unavailable();
  }

  drag(): Promise<never> {
    return this.unavailable();
  }

  launchApp(): Promise<never> {
    return this.unavailable();
  }
}

export function createComputerUseDriver(): ComputerUseDriver {
  if (process.platform === "win32") return new WindowsComputerUseDriver();
  if (process.platform === "darwin") return new MacComputerUseDriver();
  return new UnsupportedComputerUseDriver();
}
