/**
 * Runtime target selection. The key matches the overlay/tarball convention
 * (`darwin-arm64`, `linux-x64`, `linuxmusl-x64`) so the manifest entry, the
 * tarball name and the native overlay all speak one vocabulary.
 */
import { unsupportedTarget } from "./errors.mjs";

export const PUBLISHED_TARGET_DESCRIPTION = "darwin-arm64, darwin-x64, linux-x64, linux-arm64";

export function runtimeTargetKey(input = {}) {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;
  if (platform === "linux") {
    const glibc = input.glibc ?? detectGlibc();
    return `${glibc ? "linux" : "linuxmusl"}-${arch}`;
  }
  if (platform === "darwin") return `darwin-${arch}`;
  return null;
}

export function requireRuntimeTargetKey(input = {}) {
  const key = runtimeTargetKey(input);
  if (key === null) {
    throw unsupportedTarget(
      `${input.platform ?? process.platform}-${input.arch ?? process.arch}`,
      [],
    );
  }
  return key;
}

function detectGlibc() {
  const report = process.report?.getReport?.();
  return Boolean(report?.header?.glibcVersionRuntime);
}
