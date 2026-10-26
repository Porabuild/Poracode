import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SERVER_INSTALL_LAYOUT_VERSION, type ServerInstallLayout } from "./serverInstallLayout";
import {
  ensureTuiBinaryDownload,
  resolveTuiCacheRoot,
  resolveTuiDownloadBaseUrl,
  resolveTuiManifest,
  TuiDownloadError,
} from "./cliTuiDownload";
import {
  parseTuiManifest,
  tuiBinaryAssetName,
  tuiBinaryTarget,
  type TuiManifest,
} from "@/shared/tuiManifest";

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

let scratch: string | undefined;
let server: Server | undefined;

function stage() {
  scratch = mkdtempSync(join(tmpdir(), "poracode-tui-download-"));
  return scratch;
}

function layout(kind: ServerInstallLayout["kind"], root: string): ServerInstallLayout {
  return {
    layoutVersion: SERVER_INSTALL_LAYOUT_VERSION,
    kind,
    root,
    libDir: join(root, "lib"),
    resourcesDir: join(root, "resources"),
  };
}

function manifestFor(assets: Record<string, { bytes: Buffer; name?: string }>): TuiManifest {
  return {
    formatVersion: 1,
    appVersion: "9.9.9",
    downloadBaseUrl: "https://releases.invalid/download",
    assets: Object.fromEntries(
      Object.entries(assets).map(([target, entry]) => [
        target,
        {
          name: entry.name ?? `${target}.bin`,
          size: entry.bytes.length,
          sha256: sha256(entry.bytes),
        },
      ]),
    ) as TuiManifest["assets"],
  };
}

function writeManifest(dir: string, manifest: TuiManifest) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
}

function httpFixture(handler: (url: string) => { status: number; body?: Buffer } | undefined) {
  return new Promise<number>((resolvePort) => {
    server = createServer((request, response) => {
      const result = handler(request.url ?? "/");
      if (!result) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(result.status);
      response.end(result.body);
    });
    server!.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      resolvePort(typeof address === "object" && address ? address.port : 0);
    });
  });
}

afterEach(() => {
  server?.close();
  server = undefined;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("tuiManifest", () => {
  it("parses a v1 manifest and rejects other shapes", () => {
    const manifest = manifestFor({ "win32-x64": { bytes: Buffer.from("binary") } });
    expect(parseTuiManifest(manifest)?.formatVersion).toBe(1);
    expect(parseTuiManifest({ ...manifest, formatVersion: 2 })).toBeUndefined();
    expect(
      parseTuiManifest({
        ...manifest,
        assets: { "win32-x64": { name: "x", size: 1, sha256: "bad" } },
      }),
    ).toBeUndefined();
  });

  it("maps host targets and asset names", () => {
    expect(tuiBinaryTarget("win32", "x64")).toBe("win32-x64");
    expect(tuiBinaryTarget("linux", "arm64")).toBe("linux-arm64");
    expect(tuiBinaryTarget("freebsd", "x64")).toBeUndefined();
    expect(tuiBinaryAssetName("win32-x64")).toBe("poracode-tui-win32-x64.exe");
    expect(tuiBinaryAssetName("linux-arm64")).toBe("poracode-tui-linux-arm64");
  });
});

describe("resolveTuiManifest", () => {
  it("reads the staged prefix resource and the checkout dist output", () => {
    const root = stage();
    const manifest = manifestFor({});
    writeManifest(join(root, "resources", "tui"), manifest);
    expect(resolveTuiManifest(layout("prefix", root))?.appVersion).toBe("9.9.9");
    expect(resolveTuiManifest(layout("checkout", root))).toBeUndefined();
    writeManifest(join(root, "dist", "tui"), manifest);
    expect(resolveTuiManifest(layout("checkout", root))?.appVersion).toBe("9.9.9");
  });
});

describe("resolveTuiDownloadBaseUrl", () => {
  it("prefers the override env, then the manifest URL, then the repository", () => {
    const root = stage();
    const manifest = manifestFor({});
    expect(
      resolveTuiDownloadBaseUrl(manifest, layout("prefix", root), {
        PORACODE_TUI_DOWNLOAD_BASE_URL: "http://127.0.0.1:8080/tui",
      }),
    ).toEqual({ url: "http://127.0.0.1:8080/tui", fromOverride: true });
    expect(resolveTuiDownloadBaseUrl(manifest, layout("prefix", root), {})).toEqual({
      url: manifest.downloadBaseUrl,
      fromOverride: false,
    });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ repository: { url: "https://github.com/acme/repo.git" } }),
    );
    const noBase = { ...manifest };
    delete noBase.downloadBaseUrl;
    expect(resolveTuiDownloadBaseUrl(noBase, layout("prefix", root), {})).toEqual({
      url: "https://github.com/acme/repo/releases/download",
      fromOverride: false,
    });
  });
});

describe("resolveTuiCacheRoot", () => {
  it("uses the override, then platform cache conventions", () => {
    expect(resolveTuiCacheRoot({ PORACODE_TUI_CACHE_DIR: "x-cache" })).toContain("x-cache");
    expect(resolveTuiCacheRoot({}, "darwin", "/home/u")).toBe(
      "/home/u/Library/Caches/poracode/tui",
    );
    expect(resolveTuiCacheRoot({}, "linux", "/home/u")).toBe("/home/u/.cache/poracode/tui");
    expect(resolveTuiCacheRoot({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/u")).toBe(
      "/xdg/poracode/tui",
    );
  });
});

describe("ensureTuiBinaryDownload", () => {
  it("returns undefined without a manifest or a matching asset", async () => {
    const root = stage();
    expect(
      await ensureTuiBinaryDownload(layout("prefix", root), {
        env: { PORACODE_TUI_CACHE_DIR: join(scratch!, "cache") },
        appVersion: "9.9.9",
      }),
    ).toBeUndefined();
    writeManifest(join(root, "resources", "tui"), manifestFor({}));
    expect(
      await ensureTuiBinaryDownload(layout("prefix", root), {
        env: { PORACODE_TUI_CACHE_DIR: join(scratch!, "cache") },
        appVersion: "9.9.9",
      }),
    ).toBeUndefined();
  });

  it("downloads, verifies, caches and reuses a good binary", async () => {
    const root = stage();
    const bytes = Buffer.from("compiled-tui-bytes");
    const target = tuiBinaryTarget(process.platform, process.arch)!;
    const name = tuiBinaryAssetName(target);
    const manifest = manifestFor({ [target]: { bytes, name } });
    const port = await httpFixture((url) =>
      url === `/v9.9.9/${name}` ? { status: 200, body: bytes } : undefined,
    );
    writeManifest(join(root, "resources", "tui"), {
      ...manifest,
      downloadBaseUrl: `http://127.0.0.1:${port}`,
    });
    const env = {
      PORACODE_TUI_CACHE_DIR: join(scratch!, "cache"),
      PORACODE_TUI_DOWNLOAD_BASE_URL: `http://127.0.0.1:${port}`,
    };
    const deps = { env, appVersion: "9.9.9" };
    const binary = await ensureTuiBinaryDownload(layout("prefix", root), deps);
    expect(binary).toBe(join(env.PORACODE_TUI_CACHE_DIR, "9.9.9", target, name));
    expect(readFileSync(binary!)).toEqual(bytes);
    const marker = JSON.parse(
      readFileSync(join(env.PORACODE_TUI_CACHE_DIR, "9.9.9", target, ".poracode-tui.json"), "utf8"),
    );
    expect(marker).toMatchObject({ formatVersion: 1, sha256: sha256(bytes), size: bytes.length });
    // Second call reuses the cache — the fixture now fails every request.
    server?.close();
    const again = await ensureTuiBinaryDownload(layout("prefix", root), deps);
    expect(again).toBe(binary);
  });

  it("refuses a checksum mismatch and leaves no partial install", async () => {
    const root = stage();
    const target = tuiBinaryTarget(process.platform, process.arch)!;
    const name = tuiBinaryAssetName(target);
    const manifest = manifestFor({ [target]: { bytes: Buffer.from("expected"), name } });
    const port = await httpFixture(() => ({ status: 200, body: Buffer.from("tampered") }));
    writeManifest(join(root, "resources", "tui"), {
      ...manifest,
      downloadBaseUrl: `http://127.0.0.1:${port}`,
    });
    const env = {
      PORACODE_TUI_CACHE_DIR: join(scratch!, "cache"),
      PORACODE_TUI_DOWNLOAD_BASE_URL: `http://127.0.0.1:${port}`,
    };
    await expect(
      ensureTuiBinaryDownload(layout("prefix", root), { env, appVersion: "9.9.9" }),
    ).rejects.toBeInstanceOf(TuiDownloadError);
    const dir = join(env.PORACODE_TUI_CACHE_DIR, "9.9.9", target);
    expect(readFileSyncSafe(join(dir, name))).toBeUndefined();
    expect(readFileSyncSafe(join(dir, ".poracode-tui.json"))).toBeUndefined();
  });

  it("refuses an oversized stream before finishing", async () => {
    const root = stage();
    const target = tuiBinaryTarget(process.platform, process.arch)!;
    const name = tuiBinaryAssetName(target);
    const small = Buffer.from("tiny");
    const manifest = manifestFor({ [target]: { bytes: small, name } });
    const port = await httpFixture(() => ({ status: 200, body: Buffer.from("tiny-and-more") }));
    writeManifest(join(root, "resources", "tui"), {
      ...manifest,
      downloadBaseUrl: `http://127.0.0.1:${port}`,
    });
    await expect(
      ensureTuiBinaryDownload(layout("prefix", root), {
        env: {
          PORACODE_TUI_CACHE_DIR: join(scratch!, "cache"),
          PORACODE_TUI_DOWNLOAD_BASE_URL: `http://127.0.0.1:${port}`,
        },
        appVersion: "9.9.9",
      }),
    ).rejects.toBeInstanceOf(TuiDownloadError);
  });

  it("refuses non-HTTPS download URLs that did not come from the override", async () => {
    const root = stage();
    const target = tuiBinaryTarget(process.platform, process.arch)!;
    const manifest = manifestFor({ [target]: { bytes: Buffer.from("x") } });
    writeManifest(join(root, "resources", "tui"), {
      ...manifest,
      downloadBaseUrl: "http://releases.invalid/download",
    });
    await expect(
      ensureTuiBinaryDownload(layout("prefix", root), {
        env: { PORACODE_TUI_CACHE_DIR: join(scratch!, "cache") },
        appVersion: "9.9.9",
      }),
    ).rejects.toBeInstanceOf(TuiDownloadError);
  });

  it("refuses loopback http from the manifest itself", async () => {
    const root = stage();
    const target = tuiBinaryTarget(process.platform, process.arch)!;
    const manifest = manifestFor({ [target]: { bytes: Buffer.from("x") } });
    writeManifest(join(root, "resources", "tui"), {
      ...manifest,
      downloadBaseUrl: "http://127.0.0.1:1",
    });
    await expect(
      ensureTuiBinaryDownload(layout("prefix", root), {
        env: { PORACODE_TUI_CACHE_DIR: join(scratch!, "cache") },
        appVersion: "9.9.9",
      }),
    ).rejects.toBeInstanceOf(TuiDownloadError);
  });
});

function readFileSyncSafe(path: string): Buffer | undefined {
  try {
    return statSync(path).isFile() ? readFileSync(path) : undefined;
  } catch {
    return undefined;
  }
}
