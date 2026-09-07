import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComputerUseDriver } from "../mcp/types";
import { CompositeComputerUseDriver } from "./composite";
import { HelperComputerUseDriver } from "./helper";
import { resolveComputerUseHelperBinaryPath } from "./helperBinary";
import { MacComputerUseDriver } from "./macos";
import { WindowsComputerUseDriver } from "./windows";

export interface CreateComputerUseDriverOptions {
  arch?: string;
  helperRootDir?: string;
  platform?: NodeJS.Platform;
  stateDir?: string;
  warn?: (message: string) => void;
}

export function createComputerUseDriver(
  options: CreateComputerUseDriverOptions = {},
): ComputerUseDriver {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const helperRootDir =
    options.helperRootDir ?? join(process.cwd(), "resources", "computer-use-helper");
  const binaryPath = resolveComputerUseHelperBinaryPath(helperRootDir, platform, arch);
  const primary = binaryPath
    ? new HelperComputerUseDriver({
        binaryPath,
        stateDir: options.stateDir ?? join(tmpdir(), "poracode-computer-use"),
      })
    : null;
  const fallback =
    platform === "win32"
      ? new WindowsComputerUseDriver()
      : platform === "darwin"
        ? new MacComputerUseDriver()
        : null;
  return new CompositeComputerUseDriver({
    primary,
    fallback,
    ...(options.warn ? { warn: options.warn } : {}),
  });
}

export { CompositeComputerUseDriver } from "./composite";
export { HelperComputerUseDriver } from "./helper";
export { resolveComputerUseHelperBinaryPath } from "./helperBinary";
