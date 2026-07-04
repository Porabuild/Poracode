import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Drive the migration by pointing homedir() at a throwaway dir.
const ctx = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => ctx.home };
});

import { prepareLightcodeDataRoot } from "./lightcodeData";

describe("legacy global-folder migration (~/.lightcode -> ~/.poracode)", () => {
  beforeEach(() => {
    ctx.home = mkdtempSync(join(tmpdir(), "poracode-migrate-"));
  });
  afterEach(() => {
    rmSync(ctx.home, { recursive: true, force: true });
  });

  const legacyDir = () => join(ctx.home, ".lightcode");
  const newDir = () => join(ctx.home, ".poracode");

  it("imports the legacy dir, skips worktrees/cache/logs, keeps the backup, leaves no temp", () => {
    mkdirSync(join(legacyDir(), "claude-profiles"), { recursive: true });
    mkdirSync(join(legacyDir(), "worktrees", "repo"), { recursive: true });
    mkdirSync(join(legacyDir(), "cache"), { recursive: true });
    mkdirSync(join(legacyDir(), "logs"), { recursive: true });
    writeFileSync(join(legacyDir(), "settings.json"), '{"theme":"dark"}');
    writeFileSync(join(legacyDir(), "state.sqlite"), "db-bytes");
    writeFileSync(join(legacyDir(), "keybindings.json"), "{}");
    writeFileSync(join(legacyDir(), "claude-profiles", "default.json"), "{}");
    writeFileSync(join(legacyDir(), "worktrees", "repo", "huge-checkout"), "x".repeat(1000));
    writeFileSync(join(legacyDir(), "cache", "blob"), "cache");
    writeFileSync(join(legacyDir(), "logs", "app.log"), "log");

    prepareLightcodeDataRoot();

    // Meaningful app data copied across.
    expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    expect(existsSync(join(newDir(), "state.sqlite"))).toBe(true);
    expect(existsSync(join(newDir(), "keybindings.json"))).toBe(true);
    expect(existsSync(join(newDir(), "claude-profiles", "default.json"))).toBe(true);
    // Large/regenerable subtrees are NOT copied.
    expect(existsSync(join(newDir(), "worktrees", "repo", "huge-checkout"))).toBe(false);
    expect(existsSync(join(newDir(), "cache", "blob"))).toBe(false);
    expect(existsSync(join(newDir(), "logs", "app.log"))).toBe(false);
    // Legacy dir is preserved as a backup (copy, not move).
    expect(existsSync(join(legacyDir(), "settings.json"))).toBe(true);
    // The atomic-rename temp dir is gone.
    expect(existsSync(`${newDir()}.migrating`)).toBe(false);
  });

  it("recovers from a crashed prior run (stale temp dir) and still imports cleanly", () => {
    mkdirSync(legacyDir(), { recursive: true });
    writeFileSync(join(legacyDir(), "settings.json"), "ok");
    // Simulate a crash mid-copy: a leftover temp dir with partial junk.
    const temp = `${newDir()}.migrating`;
    mkdirSync(temp, { recursive: true });
    writeFileSync(join(temp, "partial-junk"), "junk");

    prepareLightcodeDataRoot();

    expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe("ok");
    expect(existsSync(join(newDir(), "partial-junk"))).toBe(false); // stale junk cleared
    expect(existsSync(temp)).toBe(false);
  });

  it("does not overwrite an existing new dir", () => {
    mkdirSync(legacyDir(), { recursive: true });
    writeFileSync(join(legacyDir(), "settings.json"), "from-legacy");
    mkdirSync(newDir(), { recursive: true });

    prepareLightcodeDataRoot();

    // Migration is skipped because the new dir already exists.
    expect(existsSync(join(newDir(), "settings.json"))).toBe(false);
  });

  it("is a no-op for a fresh install with no legacy dir", () => {
    prepareLightcodeDataRoot();
    expect(existsSync(newDir())).toBe(true); // created fresh
    expect(existsSync(legacyDir())).toBe(false);
  });
});
