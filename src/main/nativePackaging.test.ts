import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const afterPack = require("../../build/after-pack.cjs") as (context: {
  appOutDir: string;
  electronPlatformName: string;
  arch: number;
}) => Promise<void>;
const targets = ["win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64", "linux-x64"];

describe("SQLite N-API packaging", () => {
  let fixture: string;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  function prepare(platform: string, missingTarget?: string) {
    const tmp = join(process.cwd(), "tmp");
    mkdirSync(tmp, { recursive: true });
    fixture = mkdtempSync(join(tmp, "native-packaging-"));
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
      writeFileSync(join(pty, "pty.node"), target);
    }
    vi.stubEnv("PORACODE_ALLOW_MISSING_COMPUTER_USE_HELPER", "1");
    return sqlite;
  }

  it.each(targets)("keeps only the %s prebuild without a staged rebuild", async (target) => {
    const [platform, arch] = target.split("-");
    const sqlite = prepare(platform!);
    await afterPack({
      appOutDir: fixture,
      electronPlatformName: platform!,
      arch: arch === "arm64" ? 3 : 1,
    });
    expect(readdirSync(sqlite)).toEqual([`${target}.node`]);
  });

  it("rejects a missing target binary even when a foreign binary exists", async () => {
    prepare("win32", "win32-arm64");
    await expect(
      afterPack({ appOutDir: fixture, electronPlatformName: "win32", arch: 3 }),
    ).rejects.toThrow(/better-sqlite3 native binary missing/);
  });
});
