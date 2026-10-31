import type Sharp from "sharp";

let sharpModule: Promise<typeof Sharp> | undefined;

/**
 * `sharp` is a native module that took ~40 ms to load in the backend host, on
 * the path to the desktop window opening. Load it on the first image instead.
 */
export function loadSharp(): Promise<typeof Sharp> {
  sharpModule ??= import("sharp").then((module) => module.default);
  return sharpModule;
}
