import type { ComputerUseDriver } from "../mcp/types";
import { MacComputerUseDriver } from "./macos";
import { WindowsComputerUseDriver } from "./windows";

class UnsupportedComputerUseDriver implements ComputerUseDriver {
  private unavailable(): never {
    throw new Error("Computer Use is only available on macOS and Windows.");
  }

  listApps(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  listWindows(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  getWindow(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  getWindowState(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  activateWindow(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  click(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  typeText(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  pressKey(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  scroll(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  drag(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  launchApp(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  setValue(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  performSecondaryAction(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
}

export function createComputerUseDriver(): ComputerUseDriver {
  if (process.platform === "win32") return new WindowsComputerUseDriver();
  if (process.platform === "darwin") return new MacComputerUseDriver();
  return new UnsupportedComputerUseDriver();
}
