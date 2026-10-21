import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ptyJobReplySchema } from "./contracts/ptyJobOwner";
import { readPtyJobOwnerArtifact } from "./ptyJobOwnerArtifact";

mkdirSync("tmp", { recursive: true });
const scratch = realpathSync.native(join(process.cwd(), "tmp"));
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(scratch, "pty-job-admission-"));
  roots.push(root);
  const folder = join(root, "win32-x64");
  mkdirSync(folder);
  // Header fixture only; no executable is launched by these admission tests.
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x00004550, 64);
  bytes.writeUInt16LE(0x8664, 68);
  bytes.writeUInt16LE(240, 84);
  bytes.writeUInt16LE(0x20b, 88);
  bytes.writeUInt16LE(2, 156);
  const file = join(folder, "pty-job-owner-v1.exe"),
    manifestPath = join(root, "manifest.json");
  const manifest = {
    formatVersion: 1,
    protocolVersion: 1,
    helperVersion: "1.0.0",
    sourceSha256: "a".repeat(64),
    targets: {
      "win32-x64": {
        relativePath: "win32-x64/pty-job-owner-v1.exe",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    },
  };
  const save = (input: unknown = manifest) => writeFileSync(manifestPath, JSON.stringify(input));
  writeFileSync(file, bytes);
  save();
  return { root, bytes, file, manifest, manifestPath, save };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!realpathSync.native(root).startsWith(`${scratch}${sep}`))
      throw new Error("Refuse cleanup outside owned scratch.");
    rmSync(root, { recursive: true, force: true });
  }
});

it("admits pinned format1 native target bytes without rewriting the manifest", () => {
  const f = fixture(),
    before = readFileSync(f.manifestPath);
  expect(readPtyJobOwnerArtifact(f.root, "win32-x64")).toMatchObject({
    path: f.file,
    target: "win32-x64",
    bytes: f.bytes,
  });
  expect(readFileSync(f.manifestPath)).toEqual(before);
});

it.each([
  { formatVersion: 0 },
  { formatVersion: 2 },
  { protocolVersion: 0 },
  { protocolVersion: 2 },
  { helperVersion: "2.0.0" },
  { future: true },
])("preserves unsupported metadata and refuses before selecting an executable: %j", (delta) => {
  const f = fixture();
  f.save({ ...f.manifest, ...delta });
  const before = readFileSync(f.manifestPath);
  expect(() => readPtyJobOwnerArtifact(f.root, "win32-x64")).toThrow(/Invalid|Unrecognized/);
  expect(readFileSync(f.manifestPath)).toEqual(before);
  expect(readFileSync(f.file)).toEqual(f.bytes);
});

it("never substitutes another native architecture", () => {
  const f = fixture();
  expect(() => readPtyJobOwnerArtifact(f.root, "win32-arm64")).toThrow(/No staged.*win32-arm64/);
});

it("refuses a changed binary without altering it", () => {
  const f = fixture(),
    changed = Buffer.from(f.bytes);
  changed[511] = 1;
  writeFileSync(f.file, changed);
  expect(() => readPtyJobOwnerArtifact(f.root, "win32-x64")).toThrow(/content or native/);
  expect(readFileSync(f.file)).toEqual(changed);
});

it.each(["../outside.exe", "/outside.exe", "win32-x64/another.exe"])(
  "refuses artifact path substitution %s",
  (relativePath) => {
    const f = fixture();
    f.manifest.targets["win32-x64"].relativePath = relativePath;
    f.save();
    expect(() => readPtyJobOwnerArtifact(f.root, "win32-x64")).toThrow(/Invalid/);
  },
);

it("refuses an aliased resource root", () => {
  const f = fixture(),
    alias = join(f.root, "alias");
  symlinkSync(f.root, alias, process.platform === "win32" ? "junction" : "dir");
  expect(() => readPtyJobOwnerArtifact(alias, "win32-x64")).toThrow(/custody/);
});

it.each([0, 1, 0xaa64])(
  "refuses truncated, console or foreign machine images even with matching hashes: %s",
  (change) => {
    const f = fixture();
    if (change === 0) f.bytes.writeUInt32LE(500, 0x3c);
    else if (change === 1) f.bytes.writeUInt16LE(3, 156);
    else f.bytes.writeUInt16LE(change, 68);
    f.manifest.targets["win32-x64"].sha256 = createHash("sha256").update(f.bytes).digest("hex");
    writeFileSync(f.file, f.bytes);
    f.save();
    expect(() => readPtyJobOwnerArtifact(f.root, "win32-x64")).toThrow(/content or native/);
  },
);

it("keeps the new helper reply protocol closed and creation ticks exact", () => {
  const nonce = "a".repeat(48),
    ticks = "18446744073709551615";
  expect(ptyJobReplySchema.parse(["prepared-v1", nonce, "1", "101", ticks])[4]).toBe(ticks);
  expect(ptyJobReplySchema.safeParse(["ready-v2", nonce]).success).toBe(false);
  expect(ptyJobReplySchema.safeParse(["retired-v1", nonce, "1"]).success).toBe(false);
  expect(ptyJobReplySchema.safeParse(["assigned-v1", nonce, "1", "101", "future"]).success).toBe(
    false,
  );
});
