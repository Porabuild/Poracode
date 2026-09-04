import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

function platformDirectory(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === "darwin") return "darwin-universal";
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
    return `win32-${arch}`;
  }
  if (platform === "linux" && arch === "x64") return "linux-x64";
  return null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolveComputerUseHelperBinaryPath(
  helperRootDir: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null {
  const override = process.env.PORACODE_COMPUTER_USE_HELPER_PATH?.trim();
  if (override) return isAbsolute(override) && isFile(override) ? override : null;

  const directory = platformDirectory(platform, arch);
  if (!directory) return null;
  const manifestPath = join(helperRootDir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { targets?: unknown };
    if (!Array.isArray(manifest.targets)) return null;
    const targets = manifest.targets.flatMap((target) => {
      if (typeof target === "string") return [target];
      if (
        target &&
        typeof target === "object" &&
        typeof (target as { id?: unknown }).id === "string"
      ) {
        return [(target as { id: string }).id];
      }
      return [];
    });
    if (!targets.includes(directory)) return null;
  } catch {
    return null;
  }
  const binary = join(
    helperRootDir,
    directory,
    platform === "win32" ? "poracode-computer-use.exe" : "poracode-computer-use",
  );
  return isFile(binary) ? binary : null;
}
