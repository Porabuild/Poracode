import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readServiceLauncher } from "./serverServiceLauncher";

const scratch = realpathSync.native(join(process.cwd(), "tmp"));
const roots: string[] = [];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const root = mkdtempSync(join(scratch, "service-launcher-admission-"));
  roots.push(root);
  const directory = join(root, "resources", "service-launcher");
  mkdirSync(join(directory, "win32-x64"), { recursive: true });
  // Header fixture only: never executed or described as a qualified helper.
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x00004550, 64);
  bytes.writeUInt16LE(0x8664, 68);
  bytes.writeUInt16LE(240, 84);
  bytes.writeUInt16LE(0x20b, 88);
  bytes.writeUInt16LE(2, 156);
  const file = join(directory, "win32-x64", "service-launcher-v1.exe");
  const manifest = {
    formatVersion: 1,
    protocolVersion: 1,
    helperVersion: "1.0.0",
    sourceSha256: "a".repeat(64),
    targets: {
      "win32-x64": {
        relativePath: "win32-x64/service-launcher-v1.exe",
        bytes: bytes.length,
        sha256: hash(bytes),
      },
    },
  };
  const path = join(directory, "manifest.json");
  writeFileSync(file, bytes);
  const save = (input: unknown = manifest) => writeFileSync(path, JSON.stringify(input));
  save();
  return { root, directory, bytes, file, path, manifest, save };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!realpathSync.native(root).startsWith(`${scratch}${sep}`))
      throw new Error("Refusing cleanup outside the owned test scratch directory.");
    rmSync(root, { recursive: true, force: true });
  }
});

describe("immutable native service launcher admission", () => {
  it("accepts a pinned version1 x64 GUI artifact without changing staged files", () => {
    const f = fixture(),
      before = readFileSync(f.path);
    expect(readServiceLauncher(f.root, "x64")).toMatchObject({
      path: f.file,
      target: "win32-x64",
      artifact: { sha256: hash(f.bytes) },
    });
    expect(readFileSync(f.path)).toEqual(before);
    expect(readFileSync(f.file)).toEqual(f.bytes);
  });
  it.each([
    { formatVersion: 2 },
    { protocolVersion: 2 },
    { helperVersion: "2.0.0" },
    { futureField: true },
  ])("preserves future metadata and refuses it (%j)", (fields) => {
    const f = fixture();
    f.save({ ...f.manifest, ...fields });
    const before = readFileSync(f.path);
    expect(() => readServiceLauncher(f.root, "x64")).toThrow("existing files were preserved");
    expect(readFileSync(f.path)).toEqual(before);
  });
  it("does not fall back across native architectures", () => {
    const f = fixture();
    expect(() => readServiceLauncher(f.root, "arm64")).toThrow("win32-arm64");
    expect(() => readServiceLauncher(f.root, "ia32")).toThrow("architecture");
  });
  it("rejects a changed helper even when its size remains identical", () => {
    const f = fixture();
    f.bytes[200] = 1;
    writeFileSync(f.file, f.bytes);
    expect(() => readServiceLauncher(f.root, "x64")).toThrow("no usable");
  });
  it.each(["console", "machine", "truncated"])(
    "rejects an invalid executable even with matching content hash (%s)",
    (kind) => {
      const f = fixture();
      if (kind === "console") f.bytes.writeUInt16LE(3, 156);
      else if (kind === "machine") f.bytes.writeUInt16LE(0xaa64, 68);
      else f.bytes.writeUInt16LE(65000, 84);
      writeFileSync(f.file, f.bytes);
      f.manifest.targets["win32-x64"].sha256 = hash(f.bytes);
      f.save();
      expect(() => readServiceLauncher(f.root, "x64")).toThrow("no usable");
    },
  );
  it("refuses an aliased resource parent instead of adopting another artifact tree", () => {
    const f = fixture();
    const moved = join(f.root, "other resources");
    renameSync(f.directory, moved);
    symlinkSync(moved, f.directory, "junction");
    expect(() => readServiceLauncher(f.root, "x64")).toThrow("no usable");
  });
  it("refuses a traversal or private extra selector in a manifest entry", () => {
    const f = fixture();
    f.save({
      ...f.manifest,
      targets: {
        "win32-x64": {
          ...f.manifest.targets["win32-x64"],
          relativePath: "../service-launcher-v1.exe",
          credentialKey: "not-a-launcher-field",
        },
      },
    });
    expect(() => readServiceLauncher(f.root, "x64")).toThrow("no usable");
  });
});
