import { basename, dirname, join } from "node:path";
import { type PoracodeChannel, resolvePoracodeChannel } from "./channel";

const LEGACY_PRODUCT_NAME: Record<PoracodeChannel, string> = {
  stable: "Lightcode",
  nightly: "Lightcode Nightly",
};

export function legacyProductNameFor(channel: PoracodeChannel): string {
  return LEGACY_PRODUCT_NAME[channel];
}

export function resolveLegacyElectronUserDataDir(
  electronUserDataDir: string,
  channel: PoracodeChannel = resolvePoracodeChannel(),
  isDev = false,
): string {
  const currentProductDir = isDev ? dirname(electronUserDataDir) : electronUserDataDir;
  const legacyProductDir = join(dirname(currentProductDir), legacyProductNameFor(channel));
  return isDev ? join(legacyProductDir, basename(electronUserDataDir)) : legacyProductDir;
}
