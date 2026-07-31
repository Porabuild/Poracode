#!/usr/bin/env node
// Normalize the Nightly channel's build/icon-nightly.png to the macOS optical
// safe area, then generate the dedicated runtime PNG and ICNS variants.
//
// The full-bleed source stays unchanged for Windows and Linux. Trimming its
// transparent canvas first also tolerates a pre-padded replacement source.
//
// macOS-only because it shells out to `sips` and `iconutil` for the ICNS
// pipeline.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { padToMacSafeArea } from "../branding/assets/macSafeAreaIcon.mjs";

const requireFromHere = createRequire(import.meta.url);
const sharp = requireFromHere("sharp");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_DIR = join(repoRoot, "build");
const SOURCE_PNG = process.env.PORACODE_NIGHTLY_ICON_SOURCE || join(BUILD_DIR, "icon-nightly.png");
const OUT_MAC_PNG = join(BUILD_DIR, "icon-nightly-mac.png");
const OUT_ICNS = join(BUILD_DIR, "icon-nightly.icns");

const stage = mkdtempSync(join(tmpdir(), "poracode-nightly-icon-"));
console.log(`stage: ${stage}`);

try {
  // 1. Normalize the visible icon body to the macOS safe area (shared with
  // branding/assets/build-icons.mjs).
  const composed = join(stage, "icon-nightly-1024.png");
  await padToMacSafeArea(sharp(SOURCE_PNG)).png().toFile(composed);

  // 2. Runtime PNG output used by app.dock.setIcon().
  writeFileSync(OUT_MAC_PNG, readFileSync(composed));
  console.log(`wrote ${OUT_MAC_PNG}`);

  // 3. ICNS output via sips + iconutil.
  const iconsetOut = join(stage, "nightly.iconset");
  mkdirSync(iconsetOut, { recursive: true });
  const ICNS_SIZES = [
    { size: 16, name: "icon_16x16.png" },
    { size: 32, name: "icon_16x16@2x.png" },
    { size: 32, name: "icon_32x32.png" },
    { size: 64, name: "icon_32x32@2x.png" },
    { size: 128, name: "icon_128x128.png" },
    { size: 256, name: "icon_128x128@2x.png" },
    { size: 256, name: "icon_256x256.png" },
    { size: 512, name: "icon_256x256@2x.png" },
    { size: 512, name: "icon_512x512.png" },
    { size: 1024, name: "icon_512x512@2x.png" },
  ];
  for (const { size, name } of ICNS_SIZES) {
    execFileSync(
      "sips",
      ["-z", String(size), String(size), composed, "--out", join(iconsetOut, name)],
      {
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
  }
  execFileSync("iconutil", ["-c", "icns", iconsetOut, "-o", OUT_ICNS], { stdio: "inherit" });
  console.log(`wrote ${OUT_ICNS}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
