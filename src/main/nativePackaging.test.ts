import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const afterPack = require("../../build/after-pack.cjs") as (context: {
  appOutDir: string;
  electronPlatformName: string;
  arch: number;
  packager: { appInfo: { productFilename: string } };
}) => Promise<void>;
const targets = [
  "win32-x64",
  "win32-arm64",
  "darwin-x64",
  "darwin-arm64",
  "linux-x64",
  "linux-arm64",
];

describe("native N-API packaging", () => {
  let fixture: string;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  function pack(platform: string, arch: number, productFilename = "Poracode") {
    return afterPack({
      appOutDir: fixture,
      electronPlatformName: platform,
      arch,
      packager: { appInfo: { productFilename } },
    });
  }

  function prepare(platform: string, missingTarget?: string) {
    const tmp = join(process.cwd(), "tmp");
    mkdirSync(tmp, { recursive: true });
    fixture = mkdtempSync(join(tmp, "native-packaging-"));
    if (platform === "win32") writeFileSync(join(fixture, "electron_wer.dll"), "vendor helper");
    const resources =
      platform === "darwin"
        ? join(fixture, "Poracode.app", "Contents", "Resources")
        : join(fixture, "resources");
    const modules = join(resources, "app.asar.unpacked", "node_modules");
    const sqlite = join(modules, "better-sqlite3", "prebuilds");
    mkdirSync(sqlite, { recursive: true });
    for (const target of targets) {
      if (target !== missingTarget) writeFileSync(join(sqlite, `${target}.node`), target);
      const pty = join(modules, "node-pty", "prebuilds", target);
      mkdirSync(pty, { recursive: true });
      writeFileSync(join(pty, target.startsWith("win32-") ? "conpty.node" : "pty.node"), target);
    }
    vi.stubEnv("PORACODE_ALLOW_MISSING_COMPUTER_USE_HELPER", "1");
    return sqlite;
  }

  it.each(targets)("keeps only the %s prebuild without a staged rebuild", async (target) => {
    const [platform, arch] = target.split("-");
    const sqlite = prepare(platform!);
    await pack(platform!, arch === "arm64" ? 3 : 1);
    expect(readdirSync(sqlite)).toEqual([`${target}.node`]);
  });

  it("rejects a missing target binary even when a foreign binary exists", async () => {
    prepare("win32", "win32-arm64");
    await expect(pack("win32", 3)).rejects.toThrow(/better-sqlite3 native binary missing/);
  });

  it.each(["win32-x64", "win32-arm64"])("requires the ConPTY binding for %s", async (target) => {
    const sqlite = prepare("win32");
    const pty = join(sqlite, "..", "..", "node-pty", "prebuilds", target);
    rmSync(join(pty, "conpty.node"));
    writeFileSync(join(pty, "pty.node"), "obsolete binding");
    await expect(pack("win32", target.endsWith("arm64") ? 3 : 1)).rejects.toThrow(
      /node-pty native binary missing/,
    );
  });

  it.each(["Poracode", "Poracode Nightly"])(
    "stages the Windows crash helper for %s on repeated packaging",
    async (product) => {
      prepare("win32");
      await pack("win32", 1, product);
      await pack("win32", 1, product);
      expect(readFileSync(join(fixture, `${product}_wer.dll`), "utf8")).toBe("vendor helper");
      expect(existsSync(join(fixture, "electron_wer.dll"))).toBe(false);
    },
  );

  it.each(["missing", "empty"])("rejects a %s Windows crash helper", async (state) => {
    prepare("win32");
    const helper = join(fixture, "electron_wer.dll");
    if (state === "missing") rmSync(helper);
    else writeFileSync(helper, "");
    await expect(pack("win32", 3)).rejects.toThrow(/Windows crash helper missing or empty/);
  });

  it.each([
    { arch: 1, target: "linux-x64", foreign: "linux-arm64" },
    { arch: 3, target: "linux-arm64", foreign: "linux-x64" },
  ])(
    "verifies and prunes the Linux computer-use helper for $target",
    async ({ arch, target, foreign }) => {
      prepare("linux");
      vi.stubEnv("PORACODE_ALLOW_MISSING_COMPUTER_USE_HELPER", "");
      const helperRoot = join(fixture, "resources", "computer-use-helper");
      for (const id of [target, foreign]) {
        mkdirSync(join(helperRoot, id), { recursive: true });
        writeFileSync(join(helperRoot, id, "poracode-computer-use"), "elf");
      }
      writeFileSync(
        join(helperRoot, "manifest.json"),
        JSON.stringify({
          protocolVersion: 4,
          clientProtocolVersion: 4,
          minClientProtocolVersion: 1,
          targets: [target, foreign],
        }),
      );
      await pack("linux", arch);
      expect(existsSync(join(helperRoot, target, "poracode-computer-use"))).toBe(true);
      expect(existsSync(join(helperRoot, foreign))).toBe(false);
      expect(JSON.parse(readFileSync(join(helperRoot, "manifest.json"), "utf8")).targets).toEqual([
        target,
      ]);
    },
  );
});
