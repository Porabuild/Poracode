// Renders the Poracode SVG masters into production icon assets.
// Uses the repo's `sharp` for SVG->PNG, macOS `iconutil` for .icns, and a tiny
// PNG-in-ICO packer for .ico. Outputs to branding/assets/out/. Run from repo root:
//   node branding/assets/build-icons.mjs
import sharp from "sharp";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const sh = promisify(execFile);

const HERE = fileURLToPath(new URL(".", import.meta.url));
const OUT = `${HERE}out`;

async function png(svg, size) {
  return sharp(svg, { density: 512 }).resize(size, size, { fit: "contain" }).png().toBuffer();
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

async function main() {
  await rm(OUT, { recursive: true, force: true });
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
  for (const [file, s] of Object.entries(map)) await writeFile(`${web}/${file}`, await png(svg, s));
  await writeFile(
    `${web}/favicon.ico`,
    buildIco(
      await Promise.all([48, 32, 16].map(async (s) => ({ size: s, buf: await png(svg, s) }))),
    ),
  );
  console.log("  ✓ favicons + favicon.ico");

  console.log("pwa/ (mobile PWA icons):");
  const pwa = `${OUT}/pwa`;
  await mkdir(pwa, { recursive: true });
  const iconSvg = `${HERE}poracode-icon.svg`;
  // Plain transparent renders — the tile bg is baked into the SVG.
  await writeFile(`${pwa}/icon-192.png`, await png(iconSvg, 192));
  await writeFile(`${pwa}/icon-512.png`, await png(iconSvg, 512));
  // Maskable: full-bleed opaque tile with the glyph inside the ~80% safe zone.
  await writeFile(
    `${pwa}/icon-maskable-512.png`,
    await sharp({
      create: { width: 512, height: 512, channels: 4, background: "#0e0e14" },
    })
      .composite([{ input: await png(iconSvg, 440), gravity: "centre" }])
      .png()
      .toBuffer(),
  );
  // Apple touch: iOS applies its own corner mask, so corners must be opaque.
  await writeFile(
    `${pwa}/apple-touch-icon.png`,
    await sharp({
      create: { width: 180, height: 180, channels: 4, background: "#0e0e14" },
    })
      .composite([{ input: await png(iconSvg, 150), gravity: "centre" }])
      .png()
      .toBuffer(),
  );
  console.log("  ✓ icon-192 + icon-512 + icon-maskable-512 + apple-touch-icon");

  console.log(`\nDone → ${OUT}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
