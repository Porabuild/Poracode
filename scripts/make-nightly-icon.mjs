#!/usr/bin/env node
// Generate the Nightly channel's build/icon-nightly.{png,icns,ico} from the
// stable icns. The moon is composited over the cursor in the stable icon, and
// the resulting 1024×1024 is downsized into platform-specific iconsets.
//
// Re-run after changing the stable icon (`build/icon.icns`) or tweaking the
// crescent geometry below.
//
// macOS-only because it shells out to `sips` and `iconutil` for the ICNS
// pipeline. The ICO is assembled inline (raw PNG payloads inside an ICONDIR
// header) so no extra image-tooling is required.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromHere = createRequire(import.meta.url);
const sharp = requireFromHere("sharp");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_DIR = join(repoRoot, "build");
const STABLE_ICNS = join(BUILD_DIR, "icon.icns");
const OUT_PNG = join(BUILD_DIR, "icon-nightly.png");
const OUT_ICNS = join(BUILD_DIR, "icon-nightly.icns");
const OUT_ICO = join(BUILD_DIR, "icon-nightly.ico");

const SIZE = 1024;
const stage = mkdtempSync(join(tmpdir(), "poracode-nightly-icon-"));
console.log(`stage: ${stage}`);

try {
  // 1. Extract the 1024×1024 variant from the stable .icns.
  const iconsetIn = join(stage, "stable.iconset");
  execFileSync("iconutil", ["-c", "iconset", STABLE_ICNS, "-o", iconsetIn], { stdio: "inherit" });
  const stableSource = join(iconsetIn, "icon_512x512@2x.png");

  // 2. Composite the moon SVG over the stable source.
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const moonRadius = 215;
  const cutoutOffsetX = 110;
  const cutoutOffsetY = -50;
  const cutoutRadius = 180;
  const moonSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="moonFill" cx="50%" cy="45%" r="55%">
      <stop offset="0%"   stop-color="#E9FBFC" />
      <stop offset="55%"  stop-color="#9FEEF3" />
      <stop offset="100%" stop-color="#5CD4DC" />
    </radialGradient>
    <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#6FE9F0" stop-opacity="0.55" />
      <stop offset="55%"  stop-color="#3FB7C0" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#1A6E76" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="cursorMask" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#0E1620" stop-opacity="0.95" />
      <stop offset="70%"  stop-color="#0E1620" stop-opacity="0.65" />
      <stop offset="100%" stop-color="#0E1620" stop-opacity="0" />
    </radialGradient>
    <mask id="crescent" maskUnits="userSpaceOnUse">
      <rect width="${SIZE}" height="${SIZE}" fill="black" />
      <circle cx="${cx}" cy="${cy}" r="${moonRadius}" fill="white" />
      <circle cx="${cx + cutoutOffsetX}" cy="${cy + cutoutOffsetY}" r="${cutoutRadius}" fill="black" />
    </mask>
    <filter id="softBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
    <filter id="cursorBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="22" />
    </filter>
  </defs>
  <ellipse cx="${cx}" cy="${cy}" rx="120" ry="240" fill="url(#cursorMask)" filter="url(#cursorBlur)" />
  <circle cx="${cx}" cy="${cy}" r="${moonRadius + 80}" fill="url(#moonGlow)" filter="url(#softBlur)" />
  <rect width="${SIZE}" height="${SIZE}" fill="url(#moonFill)" mask="url(#crescent)" />
  <g mask="url(#crescent)">
    <circle cx="${cx - 30}" cy="${cy - 30}" r="${moonRadius - 10}" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="6" />
  </g>
</svg>
`;
  const composed = join(stage, "icon-nightly-1024.png");
  await sharp(stableSource)
    .composite([{ input: Buffer.from(moonSvg), top: 0, left: 0 }])
    .png()
    .toFile(composed);

  // 3. PNG output.
  writeFileSync(OUT_PNG, readFileSync(composed));
  console.log(`wrote ${OUT_PNG}`);

  // 4. ICNS output via sips + iconutil.
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

  // 5. ICO output. Modern .ico files embed PNG payloads directly; we just need
  // an ICONDIR header + one ICONDIRENTRY per size pointing at the PNG offsets.
  const ICO_SIZES = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    ICO_SIZES.map((size) => sharp(composed).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(ICO_SIZES.length, 4);
  const ENTRY_SIZE = 16;
  const entries = Buffer.alloc(ENTRY_SIZE * ICO_SIZES.length);
  let offset = header.length + ENTRY_SIZE * ICO_SIZES.length;
  for (let i = 0; i < ICO_SIZES.length; i++) {
    const size = ICO_SIZES[i];
    const png = pngBuffers[i];
    const base = i * ENTRY_SIZE;
    entries.writeUInt8(size === 256 ? 0 : size, base);
    entries.writeUInt8(size === 256 ? 0 : size, base + 1);
    entries.writeUInt8(0, base + 2);
    entries.writeUInt8(0, base + 3);
    entries.writeUInt16LE(1, base + 4);
    entries.writeUInt16LE(32, base + 6);
    entries.writeUInt32LE(png.length, base + 8);
    entries.writeUInt32LE(offset, base + 12);
    offset += png.length;
  }
  writeFileSync(OUT_ICO, Buffer.concat([header, entries, ...pngBuffers]));
  console.log(`wrote ${OUT_ICO}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
