import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FORWARD_ORIGIN_SECRET_FILE, readOrCreateForwardOriginSecret } from "./forwardOriginSecret";
import { deriveForwardOwner } from "./forwardOrigin";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function tempBaseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-forward-origin-"));
  cleanup.push(async () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe("forward origin secret persistence", () => {
  it("creates a canonical 32-byte base64url secret once and re-reads it", () => {
    const baseDir = tempBaseDir();
    const first = readOrCreateForwardOriginSecret(baseDir);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(Buffer.from(first, "base64url").toString("base64url")).toBe(first);

    expect(readOrCreateForwardOriginSecret(baseDir)).toBe(first);

    // The stored document is the versioned shape, mode 0600, secret intact.
    const stored = JSON.parse(readFileSync(join(baseDir, FORWARD_ORIGIN_SECRET_FILE), "utf8")) as {
      version: number;
      originSecret: string;
    };
    expect(stored).toEqual({ version: 1, originSecret: first });
    expect(statSync(join(baseDir, FORWARD_ORIGIN_SECRET_FILE)).mode & 0o777).toBe(0o600);

    // Ownership is stable for the same host id and differs per host/secret.
    expect(deriveForwardOwner(first, "host-a")).toBe(deriveForwardOwner(first, "host-a"));
    expect(deriveForwardOwner(first, "host-a")).not.toBe(deriveForwardOwner(first, "host-b"));
  });

  it("concurrent creators converge on a single secret", async () => {
    const baseDir = tempBaseDir();
    // Creation is synchronous; the guarantee under test is that repeated
    // reads converge on the persisted secret, not wall-clock concurrency.
    const a = readOrCreateForwardOriginSecret(baseDir);
    const b = readOrCreateForwardOriginSecret(baseDir);
    const c = readOrCreateForwardOriginSecret(baseDir);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(readOrCreateForwardOriginSecret(baseDir)).toBe(a);
  });

  it("fails loudly on a corrupt file instead of silently rotating", () => {
    const baseDir = tempBaseDir();
    writeFileSync(join(baseDir, FORWARD_ORIGIN_SECRET_FILE), "{not json", { mode: 0o600 });
    expect(() => readOrCreateForwardOriginSecret(baseDir)).toThrow(/corrupt/);

    writeFileSync(
      join(baseDir, FORWARD_ORIGIN_SECRET_FILE),
      JSON.stringify({ version: 1, originSecret: "short" }),
    );
    expect(() => readOrCreateForwardOriginSecret(baseDir)).toThrow(/unsupported format|canonical/);

    // And it never rewrites the broken file with a fresh secret.
    const before = readFileSync(join(baseDir, FORWARD_ORIGIN_SECRET_FILE), "utf8");
    expect(() => readOrCreateForwardOriginSecret(baseDir)).toThrow(/unsupported format|corrupt/);
    expect(readFileSync(join(baseDir, FORWARD_ORIGIN_SECRET_FILE), "utf8")).toBe(before);
  });

  it("never overwrites an unknown future version", () => {
    const baseDir = tempBaseDir();
    const future = JSON.stringify({ version: 99, originSecret: "future".repeat(8) });
    writeFileSync(join(baseDir, FORWARD_ORIGIN_SECRET_FILE), future, { mode: 0o600 });
    expect(() => readOrCreateForwardOriginSecret(baseDir)).toThrow(/unsupported format/);
    expect(readFileSync(join(baseDir, FORWARD_ORIGIN_SECRET_FILE), "utf8")).toBe(future);
  });

  it.skipIf(process.platform === "win32")(
    "repairs a too-permissive existing file back to 0600",
    () => {
      const baseDir = tempBaseDir();
      const secret = readOrCreateForwardOriginSecret(baseDir);
      const path = join(baseDir, FORWARD_ORIGIN_SECRET_FILE);
      chmodSync(path, 0o644);
      expect(readOrCreateForwardOriginSecret(baseDir)).toBe(secret);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    },
  );

  it("keys owner derivation on the dedicated secret, not the relay password", () => {
    // Same server id, different dedicated secret → different owner: an
    // operator-supplied relay password must never be usable here (low-entropy
    // public HMAC would enable offline guesses), so the store only accepts the
    // canonical random shape.
    const secret = readOrCreateForwardOriginSecret(tempBaseDir());
    const other = Buffer.alloc(32, 9).toString("base64url");
    expect(deriveForwardOwner(secret, randomUUID())).not.toBe(
      deriveForwardOwner(other, randomUUID()),
    );
    expect(() => deriveForwardOwner("weak-operator-password", "host-a")).toThrow(
      /canonical 32-byte origin secret/,
    );
  });
});
