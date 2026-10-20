import { lookup } from "node:dns/promises";
import { open } from "node:fs/promises";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";
import { isAbsolute, resolve } from "node:path";
import sharp from "sharp";
import { isRecord } from "@/shared/plugins/marketplaces";
import { relativePolicyPath } from "./pathContainment";
import { findPluginManifest } from "./packageCompatibility";

const MAX_BYTES = 256 * 1024;
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix);

/** Pin the connection to a checked public address; no cookies, redirects or ambient proxy. */
export function downloadPluginArtwork(value: string): Promise<Buffer> {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    isIP(url.hostname) ||
    url.hostname.startsWith("[")
  )
    throw new Error("Unsupported artwork URL.");
  return new Promise((resolveBytes, reject) => {
    const request = get(
      url,
      {
        agent: false,
        family: 4,
        signal: AbortSignal.timeout(3000),
        lookup: (hostname, _options, callback) => {
          void lookup(hostname, { family: 4 }).then(
            ({ address }) => {
              if (blocked.check(address)) callback(new Error("Non-public artwork address."), "", 4);
              else callback(null, address, 4);
            },
            (error: Error) => callback(error, "", 4),
          );
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.destroy();
          reject(new Error("Artwork request refused."));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_BYTES) response.destroy(new Error("Artwork exceeds size limit."));
          else chunks.push(chunk);
        });
        response.on("end", () => resolveBytes(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

export async function readArtworkFile(
  root: string,
  path: string,
  maxBytes = MAX_BYTES,
): Promise<Buffer> {
  if (isAbsolute(path) || /^[a-z][a-z0-9+.-]*:/iu.test(path))
    throw new Error("Unsupported artwork path.");
  const file = resolve(root, path);
  if (relativePolicyPath(root, file) === undefined)
    throw new Error("Artwork escapes package root.");
  const handle = await open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error("Artwork exceeds size limit.");
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) throw new Error("Artwork exceeds size limit.");
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function artworkDeclarations(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const metadata = isRecord(value.interface) ? value.interface : {};
  return [metadata.logo, metadata.composerIcon, value.icon].filter(
    (item): item is string => typeof item === "string" && item.length > 0 && item.length <= 2048,
  );
}

export async function packageArtworkDeclarations(root: string): Promise<string[]> {
  const manifest = findPluginManifest(root);
  return manifest
    ? artworkDeclarations(JSON.parse((await readArtworkFile(root, manifest)).toString("utf8")))
    : [];
}

export async function loadPluginArtwork(
  root: string,
  declarations: string[],
): Promise<string | undefined> {
  for (const declaration of declarations.slice(0, 3)) {
    try {
      const bytes = /^https:/iu.test(declaration)
        ? await downloadPluginArtwork(declaration)
        : await readArtworkFile(root, declaration);
      // Rasterize isolated SVG input without allowing embedded resources or author markup in the UI.
      const text = bytes.toString("utf8");
      const svg = /<svg[\s>]/iu.test(text);
      const raster =
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
        bytes.subarray(0, 4).toString() === "GIF8" ||
        (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP");
      if (!svg && !raster) continue;
      if (svg && /<!|<image\b|<foreignObject\b|url\s*\(|(?:href|src)\s*=\s*["'](?!#)/iu.test(text))
        continue;
      const png = await sharp(bytes, { limitInputPixels: 4_194_304, failOn: "warning" })
        .resize(64, 64, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      if (png.length <= 24_000) return `data:image/png;base64,${png.toString("base64")}`;
    } catch {
      /* Optional artwork never blocks browsing or installing a plugin. */
    }
  }
  return undefined;
}
