import { type PoracodeChannel } from "./channel";

const LEGACY_PRODUCT_NAME: Record<PoracodeChannel, string> = {
  stable: "Lightcode",
  nightly: "Lightcode Nightly",
};

export function legacyProductNameFor(channel: PoracodeChannel): string {
  return LEGACY_PRODUCT_NAME[channel];
}
