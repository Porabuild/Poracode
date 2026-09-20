import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assembleServerTarball } from "../../scripts/assemble-server-tarball.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("assembleServerTarball (V6 D.2)", () => {
  it("fails when native-overlay is missing", () => {
    const outDir = mkdtempSync(join(tmpdir(), "poracode-tarball-"));
    dirs.push(outDir);
    expect(() =>
      assembleServerTarball({
        outDir,
        mainBundleDir: join(outDir, "missing-main"),
        overlaySource: join(outDir, "missing-overlay"),
      }),
    ).toThrow(/native-overlay missing/u);
  });

  it("ships the multi-target native overlay and pins the native dependencies", () => {
    const outDir = mkdtempSync(join(tmpdir(), "poracode-tarball-out-"));
    const mainBundleDir = mkdtempSync(join(tmpdir(), "poracode-tarball-main-"));
    const overlaySource = mkdtempSync(join(tmpdir(), "poracode-tarball-overlay-"));
    dirs.push(outDir, mainBundleDir, overlaySource);

    const bundleBytes = Buffer.from("module.exports = {};\n");
    writeFileSync(join(mainBundleDir, "server.cjs"), bundleBytes);
    writeFileSync(
      join(mainBundleDir, "server.ssh-runtime-manifest.json"),
      `${JSON.stringify({
        files: [
          { path: "server.cjs", sha256: createHash("sha256").update(bundleBytes).digest("hex") },
        ],
        dependencies: ["node-pty"],
      })}\n`,
    );

    const stagedDir = join(overlaySource, "node-pty", "linux-arm64");
    mkdirSync(stagedDir, { recursive: true });
    const binding = Buffer.from("arm64-binding");
    writeFileSync(join(stagedDir, "pty.node"), binding);
    writeFileSync(
      join(overlaySource, "node-pty", "overlay.json"),
      `${JSON.stringify({
        formatVersion: 2,
        package: "node-pty",
        version: "1.1.0",
        targets: [
          {
            platform: "linux",
            arch: "x64",
            dir: "linux-x64",
            overlayTarget: "node_modules/node-pty/prebuilds/linux-x64",
            stagedSha256: {},
          },
          {
            platform: "linux",
            arch: "arm64",
            dir: "linux-arm64",
            overlayTarget: "node_modules/node-pty/prebuilds/linux-arm64",
            stagedSha256: { "pty.node": createHash("sha256").update(binding).digest("hex") },
          },
        ],
      })}\n`,
    );

    const result = assembleServerTarball({ outDir, mainBundleDir, overlaySource });
    const shippedOverlay = JSON.parse(
      readFileSync(join(result.stageDir, "native-overlay", "node-pty", "overlay.json"), "utf8"),
    );
    expect(shippedOverlay.formatVersion).toBe(2);
    expect(shippedOverlay.targets.map((target: { dir: string }) => target.dir)).toEqual([
      "linux-x64",
      "linux-arm64",
    ]);
    expect(
      readFileSync(join(result.stageDir, "native-overlay", "node-pty", "linux-arm64", "pty.node")),
    ).toEqual(binding);
    const shippedPackage = JSON.parse(readFileSync(join(result.stageDir, "package.json"), "utf8"));
    expect(shippedPackage.dependencies["node-pty"]).toBe(
      JSON.parse(readFileSync(join(process.cwd(), "node_modules/node-pty/package.json"), "utf8"))
        .version,
    );
    expect(
      readFileSync(join(result.stageDir, "scripts", "server-native-overlay.mjs"), "utf8"),
    ).toContain("export function applyServerNativeOverlay");
    const dockerfile = readFileSync(join(result.stageDir, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("npm install --omit=dev --ignore-scripts");
    expect(dockerfile).toContain("applyServerNativeOverlay");
    expect(dockerfile).toContain("chown node:node /var/lib/poracode");
    expect(isGzipFile(result.tarballPath)).toBe(true);
  });
});

function isGzipFile(path: string): boolean {
  return readFileSync(path).subarray(0, 2).toString("latin1") === "\x1f\x8b";
}
