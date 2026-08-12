// Renders the Poracode SVG masters into production icon assets.
// Uses the repo's `sharp` for SVG->PNG, macOS `iconutil` for .icns, and a tiny
// PNG-in-ICO packer for .ico. Outputs to branding/assets/out/. Run from repo root:
//   node branding/assets/build-icons.mjs
import sharp from "sharp";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { padToMacSafeArea } from "./macSafeAreaIcon.mjs";
const sh = promisify(execFile);

const HERE = fileURLToPath(new URL(".", import.meta.url));
const OUT = `${HERE}out`;

async function png(svg, size) {
  return sharp(svg, { density: 512 }).resize(size, size, { fit: "contain" }).png().toBuffer();
}

// app.dock.setIcon() displays a supplied PNG literally, so a full-bleed asset
// visibly grows when the app launches even if the bundle's ICNS looked right.
// Pad it into the macOS optical safe area (shared with make-nightly-icon.mjs).
async function macPng(svg, size) {
  return padToMacSafeArea(sharp(await png(svg, size)), size)
    .png()
    .toBuffer();
}

async function trayPng(svg, size, accent) {
  const source = (await readFile(svg, "utf8"))
    .replace(
      'viewBox="0 0 1024 1024" width="1024" height="1024"',
      'viewBox="256 254 522 522" width="522" height="522"',
    )
    .replace('fill="currentColor"', 'fill="#EAF0FB"')
    .replace("#8B7BFF", accent);
  return sharp(Buffer.from(source), { density: 512 })
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
}

// macOS template image: a solid-black glyph on a transparent background. macOS
// reads only the alpha channel and tints it per menu-bar appearance, so both the
// P and the accent dot are forced to black. Monochrome ⇒ channel-neutral (one set).
async function trayMacTemplatePng(svg, size) {
  const source = (await readFile(svg, "utf8"))
    .replace(
      'viewBox="0 0 1024 1024" width="1024" height="1024"',
      'viewBox="256 254 522 522" width="522" height="522"',
    )
    .replace('fill="currentColor"', 'fill="#000000"')
    .replace("#8B7BFF", "#000000");
  // macOS menu-bar template: the canvas point size matches the bar height, but the
  // glyph must sit inside it with margin so it doesn't tower over neighbouring
  // status items. Render the glyph at ~76% and center it on a transparent canvas.
  const inner = Math.round(size * 0.76);
  const glyph = await sharp(Buffer.from(source), { density: 512 })
    .resize(inner, inner, { fit: "contain" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: glyph, gravity: "centre" }])
    .png()
    .toBuffer();
}

// Minimal ICO container that embeds PNG frames (Vista+; supported everywhere modern).
function buildIco(frames /* [{size, buf}] */) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + dir.length;
  const parts = [];
  frames.forEach((f, i) => {
    const o = i * 16;
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, o);
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(f.buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += f.buf.length;
    parts.push(f.buf);
  });
  return Buffer.concat([head, dir, ...parts]);
}

async function icns(svg, outBase) {
  const set = `${outBase}.iconset`;
  await mkdir(set, { recursive: true });
  const specs = [
    [16, ""],
    [16, "@2x"],
    [32, ""],
    [32, "@2x"],
    [128, ""],
    [128, "@2x"],
    [256, ""],
    [256, "@2x"],
    [512, ""],
    [512, "@2x"],
  ];
  for (const [base, hi] of specs) {
    const px = hi ? base * 2 : base;
    await writeFile(`${set}/icon_${base}x${base}${hi}.png`, await png(svg, px));
  }
  await sh("iconutil", ["-c", "icns", set, "-o", `${outBase}.icns`]);
  await rm(set, { recursive: true, force: true });
}

async function buildVariant(name, svg, dir) {
  await mkdir(dir, { recursive: true });
  for (const s of [1024, 512, 256, 128, 64, 48, 32, 16]) {
    await writeFile(`${dir}/${name}-${s}.png`, await png(svg, s));
  }
  await writeFile(`${dir}/${name}.png`, await png(svg, 1024));
  await writeFile(`${dir}/${name}-mac.png`, await macPng(svg, 1024));
  const icoFrames = await Promise.all(
    [256, 128, 64, 48, 32, 16].map(async (s) => ({ size: s, buf: await png(svg, s) })),
  );
  await writeFile(`${dir}/${name}.ico`, buildIco(icoFrames));
  await icns(svg, `${dir}/${name}`);
  console.log(`  ✓ ${name}: png ladder + .ico + .icns`);
}

async function buildTrayVariant(name, svg, dir, accent) {
  const frames = await Promise.all(
    [16, 20, 24, 32].map(async (size) => ({ size, buf: await trayPng(svg, size, accent) })),
  );
  await writeFile(`${dir}/${name}.ico`, buildIco(frames));
  console.log(`  ✓ ${name}: 16/20/24/32px .ico`);
}

// One PWA icon set per release channel. Stable and nightly are installed side
// by side from separate origins (app.poracode.com / app-nightly.poracode.com),
// so nightly needs its own art or the two are indistinguishable on a home
// screen.
const PWA_VARIANTS = [
  { suffix: "", svg: "poracode-icon.svg" },
  { suffix: "-nightly", svg: "poracode-icon-nightly.svg" },
];

// Maskable and apple-touch icons must be opaque corner to corner: the platform
// applies its own mask (circle, squircle, rounded rect) and any transparency
// around our squircle shows through as a notch. Stretch the tile shape to a
// full-bleed rect and keep every fill — including the nightly sheen overlay —
// so the backdrop is the tile art itself rather than an approximated flat
// colour composited behind it, which leaves a visible seam on a gradient.
// The glyph is already inset well inside the 80% safe zone at this viewBox.
function fullBleedSvg(source) {
  return source.replaceAll(
    /<use xlink:href="#tile" fill="([^"]+)"\s*\/>/g,
    '<rect width="1024" height="1024" fill="$1"/>',
  );
}

async function buildPwaVariant(dir, { suffix, svg }) {
  const iconSvg = `${HERE}${svg}`;
  // Plain transparent renders — the tile bg is baked into the SVG.
  await writeFile(`${dir}/icon${suffix}-192.png`, await png(iconSvg, 192));
  await writeFile(`${dir}/icon${suffix}-512.png`, await png(iconSvg, 512));
  const source = await readFile(iconSvg, "utf8");
  const bleed = Buffer.from(fullBleedSvg(source));
  if (bleed.equals(Buffer.from(source))) {
    throw new Error(`${svg}: no #tile <use> to expand for the maskable icon`);
  }
  await writeFile(`${dir}/icon${suffix}-maskable-512.png`, await png(bleed, 512));
  await writeFile(`${dir}/apple-touch-icon${suffix}.png`, await png(bleed, 180));
  console.log(`  ✓ icon${suffix}: 192 + 512 + maskable-512 + apple-touch`);
}

async function buildTrayMacTemplate(svg, dir) {
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/tray-icon-mac.png`, await trayMacTemplatePng(svg, 22));
  await writeFile(`${dir}/tray-icon-mac@2x.png`, await trayMacTemplatePng(svg, 44));
  console.log("  ✓ tray-icon-mac: 22px + @2x template PNG");
}

// Optional section filter (`node build-icons.mjs pwa`). The `build` section
// shells out to macOS `iconutil` for .icns, so contributors on other hosts can
// still regenerate the `website` and `pwa` sections on their own.
const SECTIONS = ["build", "website", "pwa"];
const only = process.argv[2];
if (only && !SECTIONS.includes(only)) {
  console.error(`unknown section "${only}"; expected one of ${SECTIONS.join(", ")}`);
  process.exit(1);
}
const wants = (section) => !only || only === section;

async function main() {
  for (const section of SECTIONS) {
    if (wants(section)) await rm(`${OUT}/${section}`, { recursive: true, force: true });
  }

  if (wants("build")) {
    console.log("build/ (app icons):");
    await buildVariant("icon", `${HERE}poracode-icon.svg`, `${OUT}/build`);
    await buildVariant("icon-nightly", `${HERE}poracode-icon-nightly.svg`, `${OUT}/build`);
    await buildTrayVariant("tray-icon", `${HERE}poracode-glyph.svg`, `${OUT}/build`, "#8B7BFF");
    await buildTrayVariant(
      "tray-icon-nightly",
      `${HERE}poracode-glyph.svg`,
      `${OUT}/build`,
      "#5EE6E0",
    );
    await buildTrayMacTemplate(`${HERE}poracode-glyph.svg`, `${OUT}/build`);
  }

  if (wants("website")) {
    console.log("website/public (favicons):");
    const web = `${OUT}/website`;
    await mkdir(web, { recursive: true });
    const svg = `${HERE}poracode-icon.svg`;
    const map = {
      "favicon-48x48.png": 48,
      "favicon-96x96.png": 96,
      "icon-192.png": 192,
      "icon-512.png": 512,
      "icon.png": 512,
    };
    for (const [file, s] of Object.entries(map)) {
      await writeFile(`${web}/${file}`, await png(svg, s));
    }
    await writeFile(
      `${web}/favicon.ico`,
      buildIco(
        await Promise.all([48, 32, 16].map(async (s) => ({ size: s, buf: await png(svg, s) }))),
      ),
    );
    console.log("  ✓ favicons + favicon.ico");
  }

  if (wants("pwa")) {
    console.log("pwa/ (installable app icons):");
    const pwa = `${OUT}/pwa`;
    await mkdir(pwa, { recursive: true });
    for (const variant of PWA_VARIANTS) await buildPwaVariant(pwa, variant);
  }

  console.log(`\nDone → ${OUT}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
