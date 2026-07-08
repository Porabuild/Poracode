// Renders the Poracode SVG masters into the committed Capacitor native
// projects (ios/, android/): app icons, adaptive-icon layers, and splash
// screens. Companion to build-icons.mjs (desktop/website/PWA assets).
// Idempotent — overwrites in place; skips a platform whose native project is
// absent. Run from repo root:
//   node branding/assets/build-native-assets.mjs
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "../..");

// Tile color baked into poracode-icon.svg.
const TILE_BG = "#0E0E14";
// App/window background (matches capacitor.config.ts backgroundColor).
const SPLASH_BG = "#070709";
// Glyph fill used by poracode-icon.svg for the "P".
const GLYPH_COLOR = "#EAF0FB";

const iconSvg = await readFile(`${HERE}poracode-icon.svg`);
// poracode-glyph.svg uses currentColor (renders black outside a DOM) — pin it.
const glyphSvg = Buffer.from(
  (await readFile(`${HERE}poracode-glyph.svg`, "utf8")).replaceAll("currentColor", GLYPH_COLOR),
);
// Legacy round launcher: same glyph on a full-bleed disc.
const roundIconSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <circle cx="512" cy="512" r="512" fill="${TILE_BG}"/>
  <path fill-rule="evenodd" fill="${GLYPH_COLOR}"
    d="M352,300 H556 A152,152 0 0 1 556,604 H472 V730 H352 Z
       M472,392 H548 A60,60 0 0 1 548,512 H472 Z"/>
  <circle cx="636" cy="694" r="46" fill="#8B7BFF"/>
</svg>`,
);

async function png(svg, size) {
  return sharp(svg, { density: 512 }).resize(size, size, { fit: "contain" }).png().toBuffer();
}

// Opaque square render — iOS masks its own corners, so the transparent corners
// of the rounded tile are flattened onto the tile color (invisible seam).
async function opaqueIcon(size) {
  return sharp({ create: { width: size, height: size, channels: 3, background: TILE_BG } })
    .composite([{ input: await png(iconSvg, size), gravity: "centre" }])
    .png()
    .toBuffer();
}

// Splash: solid app-background with the glyph centered. The glyph canvas is
// 40% of the short edge; the master's own padding brings the visible mark to
// roughly a sixth of the screen, matching the desktop launch feel.
async function splash(width, height) {
  const glyphSize = Math.round(Math.min(width, height) * 0.4);
  return sharp({ create: { width, height, channels: 3, background: SPLASH_BG } })
    .composite([{ input: await png(glyphSvg, glyphSize), gravity: "centre" }])
    .png()
    .toBuffer();
}

async function buildIos() {
  const iosApp = resolve(ROOT, "ios/App/App");
  if (!existsSync(iosApp)) {
    console.log("ios/ not present; skipping iOS assets.");
    return;
  }

  await writeFile(
    `${iosApp}/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`,
    await opaqueIcon(1024),
  );
  const splashPng = await splash(2732, 2732);
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    await writeFile(`${iosApp}/Assets.xcassets/Splash.imageset/${name}`, splashPng);
  }
  console.log("  ✓ iOS app icon + splash imageset");
}

async function buildAndroid() {
  const res = resolve(ROOT, "android/app/src/main/res");
  if (!existsSync(res)) {
    console.log("android/ not present; skipping Android assets.");
    return;
  }

  // Launcher icons. Foreground is the 108dp adaptive canvas; the glyph
  // master's padding keeps the mark inside the 66dp safe zone.
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [density, scale] of Object.entries(densities)) {
    const dir = `${res}/mipmap-${density}`;
    const launcher = Math.round(48 * scale);
    const foreground = Math.round(108 * scale);
    await writeFile(`${dir}/ic_launcher.png`, await png(iconSvg, launcher));
    await writeFile(`${dir}/ic_launcher_round.png`, await png(roundIconSvg, launcher));
    await writeFile(`${dir}/ic_launcher_foreground.png`, await png(glyphSvg, foreground));
  }

  // Adaptive-icon background layer color.
  await writeFile(
    `${res}/values/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${TILE_BG}</color>\n</resources>`,
  );
  // The default template also ships a same-named drawable (teal grid) that
  // shadows nothing but confuses greps; overwrite it to the tile color too.
  const bgDrawable = `${res}/drawable/ic_launcher_background.xml`;
  if (existsSync(bgDrawable)) {
    await writeFile(
      bgDrawable,
      `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportHeight="108"\n    android:viewportWidth="108">\n    <path\n        android:fillColor="${TILE_BG}"\n        android:pathData="M0,0h108v108h-108z" />\n</vector>\n`,
    );
  }
  console.log("  ✓ Android launcher icons (legacy + round + adaptive)");

  // Splash screens (Capacitor template dimensions).
  const portrait = [
    ["mdpi", 320, 480],
    ["hdpi", 480, 800],
    ["xhdpi", 720, 1280],
    ["xxhdpi", 960, 1600],
    ["xxxhdpi", 1280, 1920],
  ];
  for (const [density, w, h] of portrait) {
    await writeFile(`${res}/drawable-port-${density}/splash.png`, await splash(w, h));
    await writeFile(`${res}/drawable-land-${density}/splash.png`, await splash(h, w));
  }
  await writeFile(`${res}/drawable/splash.png`, await splash(480, 320));
  console.log("  ✓ Android splash drawables");
}

console.log("native (Capacitor) brand assets:");
await buildIos();
await buildAndroid();
console.log("Done.");
