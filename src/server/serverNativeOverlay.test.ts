import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyServerNativeOverlay, writeCurrentSymlink } from "./serverNativeOverlay";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const hostPlatform = process.platform;
const hostArch = process.arch;
const hostDir = `${hostPlatform}-${hostArch}`;

function sha(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stageBinding(overlayRoot: string, dir: string, contents: string): Buffer {
  const stagedDir = join(overlayRoot, "node-pty", dir);
  mkdirSync(stagedDir, { recursive: true });
  const binding = Buffer.from(contents);
  writeFileSync(join(stagedDir, "pty.node"), binding);
  return binding;
}

function writeOverlay(overlayRoot: string, manifest: unknown): void {
  mkdirSync(join(overlayRoot, "node-pty"), { recursive: true });
  writeFileSync(join(overlayRoot, "node-pty", "overlay.json"), `${JSON.stringify(manifest)}\n`);
}

describe("applyServerNativeOverlay", () => {
  it("copies hashed node-pty files into overlayTarget before npm install (v1 manifest)", () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-overlay-prefix-"));
    const overlayRoot = mkdtempSync(join(tmpdir(), "poracode-overlay-src-"));
    dirs.push(prefix, overlayRoot);
    const binding = stageBinding(overlayRoot, hostDir, "pty-binding");
    writeOverlay(overlayRoot, {
      formatVersion: 1,
      overlayTarget: `node_modules/node-pty/prebuilds/${hostDir}`,
      platform: hostPlatform,
      arch: hostArch,
      stagedSha256: { "pty.node": sha(binding) },
    });
    const sqlite = Buffer.from("sqlite-binding");
    writeFileSync(join(overlayRoot, "better_sqlite3.node"), sqlite);

    const result = applyServerNativeOverlay({ prefix, overlayRoot });
    expect(readFileSync(join(result.nodePtyTarget, "pty.node"))).toEqual(binding);
    expect(result.betterSqliteBinding).toBe(join(prefix, "lib", "better_sqlite3.node"));
    expect(readFileSync(result.betterSqliteBinding!)).toEqual(sqlite);
  });

  it("applies the target matching this runtime from a v2 multi-target manifest", () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-overlay-v2-prefix-"));
    const overlayRoot = mkdtempSync(join(tmpdir(), "poracode-overlay-v2-src-"));
    dirs.push(prefix, overlayRoot);
    const other = stageBinding(overlayRoot, "linuxmusl-x64", "other-machine");
    const host = stageBinding(overlayRoot, hostDir, "this-machine");
    writeOverlay(overlayRoot, {
      formatVersion: 2,
      package: "node-pty",
      version: "1.1.0",
      targets: [
        {
          platform: "linuxmusl",
          arch: "x64",
          dir: "linuxmusl-x64",
          overlayTarget: "node_modules/node-pty/prebuilds/linuxmusl-x64",
          stagedSha256: { "pty.node": sha(other) },
        },
        {
          platform: hostPlatform,
          arch: hostArch,
          dir: hostDir,
          overlayTarget: `node_modules/node-pty/prebuilds/${hostDir}`,
          stagedSha256: { "pty.node": sha(host) },
        },
      ],
    });

    const result = applyServerNativeOverlay({ prefix, overlayRoot });
    expect(result.nodePtyTarget).toBe(
      join(prefix, "node_modules", "node-pty", "prebuilds", hostDir),
    );
    expect(readFileSync(join(result.nodePtyTarget, "pty.node"), "utf8")).toBe("this-machine");
    expect(existsSync(join(prefix, "node_modules", "node-pty", "prebuilds", "linuxmusl-x64"))).toBe(
      false,
    );
  });

  it("refuses an overlay without a target this runtime can load", () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-overlay-miss-prefix-"));
    const overlayRoot = mkdtempSync(join(tmpdir(), "poracode-overlay-miss-src-"));
    dirs.push(prefix, overlayRoot);
    stageBinding(overlayRoot, hostDir === "linux-x64" ? "linux-arm64" : "linux-x64", "alien");
    writeOverlay(overlayRoot, {
      formatVersion: 2,
      targets: [
        {
          platform: "linux",
          arch: hostDir === "linux-x64" ? "arm64" : "x64",
          dir: hostDir === "linux-x64" ? "linux-arm64" : "linux-x64",
          overlayTarget: "node_modules/node-pty/prebuilds/linux-x64",
          stagedSha256: {},
        },
      ],
    });
    expect(() => applyServerNativeOverlay({ prefix, overlayRoot })).toThrow(
      new RegExp(`no staged prebuild for ${hostPlatform}-${hostArch}`, "u"),
    );
  });

  it("refuses a staged file whose hash does not match overlay.json", () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-overlay-prefix-"));
    const overlayRoot = mkdtempSync(join(tmpdir(), "poracode-overlay-src-"));
    dirs.push(prefix, overlayRoot);
    stageBinding(overlayRoot, hostDir, "actual");
    writeOverlay(overlayRoot, {
      overlayTarget: `node_modules/node-pty/prebuilds/${hostDir}`,
      platform: hostPlatform,
      arch: hostArch,
      stagedSha256: { "pty.node": "00".repeat(32) },
    });
    expect(() => applyServerNativeOverlay({ prefix, overlayRoot })).toThrow(/hash mismatch/u);
  });
});

describe("writeCurrentSymlink", () => {
  it("points prefix/current at a release directory", () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-current-"));
    dirs.push(prefix);
    const release = join(prefix, "releases", "a");
    mkdirSync(release, { recursive: true });
    writeCurrentSymlink(prefix, release);
    writeFileSync(join(release, "marker"), "ok");
    expect(readFileSync(join(prefix, "current", "marker"), "utf8")).toBe("ok");
  });
});
