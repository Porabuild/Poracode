import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { readOwnedHeadlessRelaySecret as readSecret } from "./headlessRelaySecret";

const cleanup: Array<() => Promise<void>> = [];
async function fixture(mode: "headless" | "session-only" = "headless") {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-owned-relay-key-")));
  const owner = HostOwnerController.acquire(join(root, "profile"), "headless");
  const runtime = await owner.initialize({ mode });
  cleanup.push(async () => {
    await owner.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { owner, runtime, path: join(runtime.paths.baseDir, "relay-secret") };
}

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

describe("owned headless relay credential", () => {
  it("creates a private credential once and preserves it across reads and matching injection", async () => {
    const test = await fixture();
    const secret = readSecret(test.runtime);
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    expect(readSecret(test.runtime)).toBe(secret);
    expect(readSecret(test.runtime, secret)).toBe(secret);
    expect(readFileSync(test.path, "utf8")).toBe(secret);
  });

  it("uses explicit injection without creating a credential file", async () => {
    const test = await fixture();
    expect(readSecret(test.runtime, "fixture-injected")).toBe("fixture-injected");
    expect(existsSync(test.path)).toBe(false);
  });

  it.each(["oversized", "invalid-utf8", "symlink"])(
    "preserves an invalid stored credential (%s)",
    async (shape) => {
      const test = await fixture();
      const bytes = shape === "oversized" ? Buffer.alloc(5_000, 65) : Buffer.from([0xff, 0xfe]);
      if (shape === "symlink") {
        const other = `${test.path}-other`;
        writeFileSync(other, "fixture-linked", { mode: 0o600 });
        symlinkSync(other, test.path);
      } else writeFileSync(test.path, bytes, { mode: 0o600 });
      expect(() => readSecret(test.runtime)).toThrow(/credential/u);
      expect(readFileSync(test.path)).toEqual(
        shape === "symlink" ? Buffer.from("fixture-linked") : bytes,
      );
    },
  );

  it("does not rotate an empty existing relay credential", async () => {
    const test = await fixture();
    writeFileSync(test.path, "", { mode: 0o600 });
    expect(() => readSecret(test.runtime)).toThrow(/credential/u);
    expect(readFileSync(test.path, "utf8")).toBe("");
  });

  it("rejects explicit blank injection instead of silently using another credential", async () => {
    const test = await fixture();
    writeFileSync(test.path, "fixture-previous", { mode: 0o600 });
    expect(() => readSecret(test.runtime, "  ")).toThrow(/credential/u);
    expect(readFileSync(test.path, "utf8")).toBe("fixture-previous");
  });

  it("refuses a conflicting injected credential without changing the recorded identity", async () => {
    const test = await fixture();
    writeFileSync(test.path, "fixture-previous", { mode: 0o600 });
    expect(() => readSecret(test.runtime, "fixture-other")).toThrow(/credential/u);
    expect(readFileSync(test.path, "utf8")).toBe("fixture-previous");
  });

  it("refuses retired owners before creating a relay credential", async () => {
    const test = await fixture();
    await test.owner.close();
    expect(() => readSecret(test.runtime)).toThrow(/active/u);
    expect(existsSync(test.path)).toBe(false);
  });

  it("refuses creating durable relay credentials in session-only mode", async () => {
    const test = await fixture("session-only");
    expect(() => readSecret(test.runtime)).toThrow(/session-only/u);
    expect(existsSync(test.path)).toBe(false);
  });
});
