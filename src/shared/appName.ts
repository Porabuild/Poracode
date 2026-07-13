import { type PoracodeChannel, productNameFor } from "./channel";

export function getAppName(channel: PoracodeChannel, isDev: boolean): string {
  const base = productNameFor(channel);
  return isDev ? `${base} (dev)` : base;
}
