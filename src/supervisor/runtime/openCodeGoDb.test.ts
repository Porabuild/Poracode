import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasOpenCodeGoAuth, normalizeRows, readOpenCodeGoApiKey } from "./openCodeGoDb";

describe("normalizeRows", () => {
  it("scales epoch-second timestamps to milliseconds and keeps ms ones", () => {
    const rows = normalizeRows([
      { createdMs: 1_700_000_000, cost: 0.5 },
      { createdMs: 1_700_000_000_000, cost: 1.25 },
    ]);
    expect(rows).toEqual([
      { createdMs: 1_700_000_000_000, cost: 0.5 },
      { createdMs: 1_700_000_000_000, cost: 1.25 },
    ]);
  });

  it("drops rows with non-numeric, negative, or non-finite values", () => {
    const rows = normalizeRows([
      { createdMs: "x", cost: 1 },
      { createdMs: 1_700_000_000_000, cost: -1 },
      { createdMs: 1_700_000_000_000, cost: Number.NaN },
      { createdMs: 0, cost: 1 },
      { createdMs: 1_700_000_000_000, cost: 2 },
    ]);
    expect(rows).toEqual([{ createdMs: 1_700_000_000_000, cost: 2 }]);
  });
});

const osMock = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => osMock.home };
});

describe("readOpenCodeGoApiKey", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "opencode-go-db-test-"));
    osMock.home = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function writeAuthJson(entries: Record<string, unknown>): void {
    const dir = join(home, ".local", "share", "opencode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "auth.json"), JSON.stringify(entries), "utf8");
  }

  it("reads and trims the opencode-go key", () => {
    writeAuthJson({ "opencode-go": { type: "api", key: "  go-key-123  " } });
    expect(readOpenCodeGoApiKey()).toBe("go-key-123");
    expect(hasOpenCodeGoAuth()).toBe(true);
  });

  it("falls back to the opencode (Zen) key when no opencode-go entry exists", () => {
    writeAuthJson({ opencode: { type: "api", key: "zen-key-456" } });
    expect(readOpenCodeGoApiKey()).toBe("zen-key-456");
    expect(hasOpenCodeGoAuth()).toBe(true);
  });

  it("prefers the opencode-go entry over the opencode fallback", () => {
    writeAuthJson({
      "opencode-go": { type: "api", key: "go-key" },
      opencode: { type: "api", key: "zen-key" },
    });
    expect(readOpenCodeGoApiKey()).toBe("go-key");
  });

  it("returns undefined for missing files, entries, or blank keys", () => {
    expect(readOpenCodeGoApiKey()).toBeUndefined();
    expect(hasOpenCodeGoAuth()).toBe(false);

    writeAuthJson({ "opencode-go": { type: "api", key: "   " } });
    expect(readOpenCodeGoApiKey()).toBeUndefined();
    expect(hasOpenCodeGoAuth()).toBe(false);

    writeAuthJson({ "opencode-go": "not-an-object" });
    expect(readOpenCodeGoApiKey()).toBeUndefined();
  });

  it("ignores malformed auth.json files", () => {
    const dir = join(home, ".local", "share", "opencode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "auth.json"), "{not json", "utf8");
    expect(readOpenCodeGoApiKey()).toBeUndefined();
    expect(hasOpenCodeGoAuth()).toBe(false);
  });
});
