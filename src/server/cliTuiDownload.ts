import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, posix, resolve, win32 } from "node:path";
import {
  TUI_CACHE_MARKER_NAME,
  tuiBinaryAssetName,
  tuiBinaryTarget,
  tuiCacheMarkerSchema,
  parseTuiManifest,
  type TuiManifest,
} from "@/shared/tuiManifest";
import type { ServerInstallLayout } from "./serverInstallLayout";

/**
 * Verified-download acquisition for the compiled TUI (option B). The staged
 * `resources/tui/manifest.json` inside the installed artifact is the trust
 * root: it pins each target asset's name, byte size and sha256, so nothing is
 * trusted that merely travels beside the binary.
 *
 * Cache layout (`<user cache>/poracode/tui/<appVersion>/<target>/`):
 * the asset file plus a `.poracode-tui.json` marker written only after the
 * bytes verified. A cache entry is reused when the marker matches the staged
 * manifest and the file size matches; anything else is reinstalled.
 */

export const TUI_DOWNLOAD_BASE_URL_ENV = "PORACODE_TUI_DOWNLOAD_BASE_URL";
export const TUI_CACHE_DIR_ENV = "PORACODE_TUI_CACHE_DIR";

export class TuiDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TuiDownloadError";
  }
}

export interface TuiDownloadDeps {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly appVersion: string;
  readonly fetchImpl?: typeof fetch;
  readonly home?: string;
  readonly stderr?: Pick<NodeJS.WriteStream, "write">;
  readonly log?: (line: string) => void;
}

export function resolveTuiManifest(
  layout: ServerInstallLayout,
  read: (path: string) => string | undefined = readText,
): TuiManifest | undefined {
  // The installed layout carries the manifest as a staged resource; a checkout
  // reads the local tui:build output instead.
  const path =
    layout.kind === "prefix"
      ? join(layout.resourcesDir, "tui", "manifest.json")
      : join(layout.root, "dist", "tui", "manifest.json");
  const text = read(path);
  if (text === undefined) return undefined;
  try {
    return parseTuiManifest(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export function resolveTuiCacheRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  const override = env[TUI_CACHE_DIR_ENV]?.trim();
  if (override) return resolve(override);
  if (platform === "win32") {
    const localAppData =
      env.LOCALAPPDATA?.trim() || win32.join(env.USERPROFILE?.trim() || home, "AppData", "Local");
    return win32.join(localAppData, "poracode", "tui");
  }
  if (platform === "darwin") return posix.join(home, "Library", "Caches", "poracode", "tui");
  return posix.join(env.XDG_CACHE_HOME?.trim() || posix.join(home, ".cache"), "poracode", "tui");
}

export function resolveTuiDownloadBaseUrl(
  manifest: TuiManifest | undefined,
  layout: ServerInstallLayout,
  env: NodeJS.ProcessEnv,
): { url: string; fromOverride: boolean } {
  const override = env[TUI_DOWNLOAD_BASE_URL_ENV]?.trim();
  if (override) return { url: override.replace(/\/+$/, ""), fromOverride: true };
  if (manifest?.downloadBaseUrl) return { url: manifest.downloadBaseUrl, fromOverride: false };
  const repository = readRepositoryUrl(layout);
  if (repository)
    return { url: `${repository.replace(/\.git$/, "")}/releases/download`, fromOverride: false };
  throw new TuiDownloadError(
    `The TUI manifest for this install declares no download source and ${join(
      layout.root,
      "package.json",
    )} has no repository URL.`,
  );
}

/**
 * Downloads and verifies the target's TUI binary into the user cache, or
 * returns the already-verified cache entry. Returns undefined when the install
 * cannot offer a binary for this target (no manifest or no asset), leaving the
 * caller to fall back to the checkout source path.
 */
export async function ensureTuiBinaryDownload(
  layout: ServerInstallLayout,
  deps: TuiDownloadDeps,
): Promise<string | undefined> {
  const platform = deps.platform ?? process.platform;
  const arch = deps.arch ?? process.arch;
  const env = deps.env ?? process.env;
  const target = tuiBinaryTarget(platform, arch);
  if (!target) return undefined;
  const manifest = resolveTuiManifest(layout);
  const asset = manifest?.assets[target];
  if (!manifest || !asset) return undefined;

  const name = tuiBinaryAssetName(target);
  const directory = join(
    resolveTuiCacheRoot(env, platform, deps.home ?? homedir()),
    deps.appVersion,
    target,
  );
  const binary = join(directory, name);
  if (readCacheMarker(directory, asset, binary)) return binary;

  const { url: base, fromOverride } = resolveTuiDownloadBaseUrl(manifest, layout, env);
  const url = `${base}/v${deps.appVersion}/${asset.name}`;
  assertDownloadUrl(url, fromOverride);
  (deps.log ?? ((line) => (deps.stderr ?? process.stderr).write(`${line}\n`)))(
    `Downloading the Poracode TUI (${target}, ${(asset.size / 1024 / 1024).toFixed(1)} MiB)…`,
  );
  await downloadVerified(url, asset, binary, directory, platform, deps.fetchImpl ?? fetch);
  (deps.log ?? ((line) => (deps.stderr ?? process.stderr).write(`${line}\n`)))(
    `Poracode TUI ready (${name}, sha256 verified).`,
  );
  return binary;
}

function assertDownloadUrl(url: string, fromOverride: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TuiDownloadError(`The TUI download URL is not valid: ${url}`);
  }
  if (parsed.protocol === "https:") return;
  // Loopback http is a qualification-only path and only when the whole base
  // URL came from the override environment variable — never from a manifest.
  const loopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  if (fromOverride && loopback && parsed.protocol === "http:") return;
  throw new TuiDownloadError(`Refusing a non-HTTPS TUI download URL: ${url}`);
}

function readCacheMarker(
  directory: string,
  asset: { sha256: string; size: number },
  binary: string,
) {
  try {
    const marker = tuiCacheMarkerSchema.safeParse(
      JSON.parse(readFileSync(join(directory, TUI_CACHE_MARKER_NAME), "utf8")),
    );
    if (!marker.success) return false;
    return (
      marker.data.sha256 === asset.sha256 &&
      marker.data.size === asset.size &&
      statSync(binary).size === asset.size
    );
  } catch {
    return false;
  }
}

async function downloadVerified(
  url: string,
  asset: { sha256: string; size: number; name: string },
  binary: string,
  directory: string,
  platform: NodeJS.Platform,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(url, { redirect: "follow" }).catch((error: unknown) => {
    throw new TuiDownloadError(`TUI download failed for ${url}: ${errorMessage(error)}`);
  });
  if (!response.ok || !response.body)
    throw new TuiDownloadError(`TUI download failed for ${url}: HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declared) && declared > asset.size)
    throw new TuiDownloadError(
      `TUI download for ${url} is larger than the manifest size (${asset.size} bytes).`,
    );

  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const staging = join(directory, `.${asset.name}.${randomUUID()}.part`);
  const hash = createHash("sha256");
  const handle = await open(staging, "w", 0o600);
  let total = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > asset.size)
        throw new TuiDownloadError(
          `TUI download for ${url} exceeded the manifest size (${asset.size} bytes).`,
        );
      hash.update(value);
      await handle.write(value);
    }
    const actual = hash.digest("hex");
    if (actual !== asset.sha256)
      throw new TuiDownloadError(
        `TUI download checksum mismatch for ${url}: expected ${asset.sha256}, got ${actual}.`,
      );
    await handle.close();
    renameSync(staging, binary);
    if (platform !== "win32") chmodSync(binary, 0o755);
    await writeFile(
      join(directory, TUI_CACHE_MARKER_NAME),
      `${JSON.stringify({ formatVersion: 1, sha256: asset.sha256, size: asset.size })}\n`,
      { mode: 0o600 },
    );
  } catch (error) {
    await handle.close().catch(() => undefined);
    rmSync(staging, { force: true });
    throw error;
  }
}

function readRepositoryUrl(layout: ServerInstallLayout): string | undefined {
  const text = readText(join(layout.root, "package.json"));
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "repository" in parsed &&
      parsed.repository !== null &&
      typeof parsed.repository === "object" &&
      "url" in parsed.repository &&
      typeof parsed.repository.url === "string"
    )
      return parsed.repository.url;
    return undefined;
  } catch {
    return undefined;
  }
}

function readText(path: string): string | undefined {
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return undefined;
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
