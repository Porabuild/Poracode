import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOrCreateHeadlessSecretKey } from "./headlessSecretKey";

describe("readOrCreateHeadlessSecretKey", () => {
  let baseDir: string;
  const savedEnv = process.env.PORACODE_SECRET_STORAGE_KEY;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "lc-key-"));
    delete process.env.PORACODE_SECRET_STORAGE_KEY;
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.PORACODE_SECRET_STORAGE_KEY;
    else process.env.PORACODE_SECRET_STORAGE_KEY = savedEnv;
  });

  it("generates a 32-byte base64 key and persists it for reuse", () => {
    const first = readOrCreateHeadlessSecretKey(baseDir);
    expect(Buffer.from(first, "base64")).toHaveLength(32);

    const onDisk = readFileSync(join(baseDir, "secret-key.headless"), "utf8").trim();
    expect(onDisk).toBe(first);

    // A second call reads the persisted key rather than minting a new one.
    expect(readOrCreateHeadlessSecretKey(baseDir)).toBe(first);
  });

  it("prefers a valid key from the environment over the file", () => {
    const envKey = Buffer.alloc(32, 3).toString("base64");
    process.env.PORACODE_SECRET_STORAGE_KEY = envKey;
    expect(readOrCreateHeadlessSecretKey(baseDir)).toBe(envKey);
  });

  it("rejects an environment key that is not 32 bytes", () => {
    process.env.PORACODE_SECRET_STORAGE_KEY = Buffer.from("too-short").toString("base64");
    expect(() => readOrCreateHeadlessSecretKey(baseDir)).toThrow(/32-byte/);
  });
});
