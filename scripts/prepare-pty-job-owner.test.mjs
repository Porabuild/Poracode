import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { preparePtyJobOwner } from "./prepare-pty-job-owner.mjs";
import { readPtyJobOwnerArtifact } from "../src/shared/ptyJobOwnerArtifact.ts";
import { ptyJobOwnerResource } from "../src/shared/runtimeResourceInventory.ts";

const scratch = resolve("tmp");
mkdirSync(scratch, { recursive: true });
const root = realpathSync.native(mkdtempSync(join(scratch, "pty-job-build-unit-")));
function fakeCompiler(command, args, options) {
  if (command !== "rustc") {
    assert.deepEqual(args, ["--version"]);
    return "poracode-pty-job-owner 1.0.0\n";
  }
  assert.equal(command, "rustc");
  assert(args.includes("--edition=2024"));
  assert(args.includes("warnings"));
  assert.equal(options.windowsHide, true);
  const triple = args[args.indexOf("--target") + 1];
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x00004550, 64);
  bytes.writeUInt16LE(triple.startsWith("x86_64") ? 0x8664 : 0xaa64, 68);
  bytes.writeUInt16LE(240, 84);
  bytes.writeUInt16LE(0x20b, 88);
  bytes.writeUInt16LE(2, 156);
  writeFileSync(args.at(-1), bytes);
}

if (process.platform !== "win32" || !["x64", "arm64"].includes(process.arch)) {
  void test("unsupported builder refuses before invoking a compiler", () => {
    let calls = 0;
    assert.throws(() => preparePtyJobOwner({ outDir: root, run: () => calls++ }), /native Windows/);
    assert.equal(calls, 0);
  });
  if (process.platform !== "win32")
    void test("host-only preparation skips non-Windows without a compiler or output", () => {
      let calls = 0;
      assert.equal(
        preparePtyJobOwner({
          outDir: join(root, "not-created"),
          ifSupported: true,
          run: () => calls++,
        }),
        null,
      );
      assert.equal(calls, 0);
    });
} else {
  void test("stages selected native GUI bytes with a closed versioned manifest", () => {
    const outDir = join(root, "valid");
    const manifest = preparePtyJobOwner({ outDir, run: fakeCompiler });
    assert.equal(manifest.formatVersion, 1);
    assert.equal(manifest.protocolVersion, 1);
    const artifact = readPtyJobOwnerArtifact(outDir, `win32-${process.arch}`);
    assert.equal(artifact.artifact.sha256, manifest.targets[`win32-${process.arch}`].sha256);
  });

  void test("stages both advertised windows families from one run", () => {
    const outDir = join(root, "both-families");
    const manifest = preparePtyJobOwner({ outDir, run: fakeCompiler });
    assert.equal(Object.keys(manifest.targets).length, 2);
    for (const target of ["win32-x64", "win32-arm64"]) {
      const artifact = readPtyJobOwnerArtifact(outDir, target);
      assert.equal(artifact.artifact.sha256, manifest.targets[target].sha256);
    }
  });

  void test("skips a failing optional cross target without corrupting the staged host", () => {
    const outDir = join(root, "cross-skip");
    const manifest = preparePtyJobOwner({
      outDir,
      run: (command, args, options) => {
        if (command === "rustc" && args.includes("aarch64-pc-windows-msvc"))
          throw new Error("aarch64-pc-windows-msvc: linker not found");
        return fakeCompiler(command, args, options);
      },
    });
    assert.equal(manifest.targets["win32-arm64"], undefined);
    const artifact = readPtyJobOwnerArtifact(outDir, `win32-${process.arch}`);
    assert.equal(artifact.artifact.sha256, manifest.targets[`win32-${process.arch}`].sha256);
    assert.throws(
      () => readPtyJobOwnerArtifact(outDir, "win32-arm64"),
      /No staged PTY job owner for win32-arm64/,
    );
  });

  void test("reruns after a cross skip to stage only the missing target", () => {
    const outDir = join(root, "cross-retry");
    const skipped = preparePtyJobOwner({
      outDir,
      run: (command, args, options) => {
        if (command === "rustc" && args.includes("aarch64-pc-windows-msvc"))
          throw new Error("aarch64-pc-windows-msvc: linker not found");
        return fakeCompiler(command, args, options);
      },
    });
    const commands = [];
    const manifest = preparePtyJobOwner({
      outDir,
      run: (command, args, options) => {
        if (command === "rustc") commands.push(args[args.indexOf("--target") + 1]);
        return fakeCompiler(command, args, options);
      },
    });
    assert.deepEqual(commands, ["aarch64-pc-windows-msvc"]);
    assert.equal(
      manifest.targets[`win32-${process.arch}`].sha256,
      skipped.targets[`win32-${process.arch}`].sha256,
    );
    readPtyJobOwnerArtifact(outDir, "win32-arm64");
  });

  void test("refuses a compiled helper version mismatch before publishing a manifest", () => {
    const outDir = join(root, "wrong-helper-version");
    assert.throws(
      () =>
        preparePtyJobOwner({
          outDir,
          run: (command, args, options) =>
            command === "rustc"
              ? fakeCompiler(command, args, options)
              : "poracode-pty-job-owner 2.0.0\n",
        }),
      /compiled.*version differs/,
    );
    assert.throws(() => readPtyJobOwnerArtifact(outDir, `win32-${process.arch}`), /ENOENT/);
  });

  void test("retains compiler sidecars outside the published resource and admits only declared bytes", () => {
    const outDir = join(root, "sidecars");
    let sidecar;
    preparePtyJobOwner({
      outDir,
      run: (command, args, options) => {
        const result = fakeCompiler(command, args, options);
        if (command === "rustc") {
          sidecar = `${args.at(-1)}.pdb`;
          writeFileSync(sidecar, "retained compiler debug data");
        }
        return result;
      },
    });
    assert.equal(readFileSync(sidecar, "utf8"), "retained compiler debug data");
    const paths = ptyJobOwnerResource(outDir).files.map((file) => file.path);
    assert.equal(paths.length, 3);
    assert(paths.includes("manifest.json"));
    for (const target of ["win32-x64", "win32-arm64"])
      assert(paths.includes(`${target}/pty-job-owner-v1.exe`));
  });

  void test("reuses verified matching bytes without recompiling or rewriting the manifest", () => {
    const outDir = join(root, "cached");
    const manifest = preparePtyJobOwner({ outDir, run: fakeCompiler });
    const file = join(outDir, "manifest.json"),
      before = readFileSync(file);
    const commands = [];
    assert.deepEqual(
      preparePtyJobOwner({
        outDir,
        run: (command, args, options) => {
          assert.notEqual(command, "rustc");
          commands.push(command);
          return fakeCompiler(command, args, options);
        },
      }),
      manifest,
    );
    assert.equal(commands.length, 1);
    assert.deepEqual(readFileSync(file), before);
  });

  void test("preserves changed cached executable bytes without a rebuild fallback", () => {
    const outDir = join(root, "changed-cache");
    preparePtyJobOwner({ outDir, run: fakeCompiler });
    const path = join(outDir, `win32-${process.arch}`, "pty-job-owner-v1.exe");
    writeFileSync(path, "changed owned fixture");
    let calls = 0;
    assert.throws(() => preparePtyJobOwner({ outDir, run: () => calls++ }), /content.*differs/);
    assert.equal(calls, 0);
    assert.equal(readFileSync(path, "utf8"), "changed owned fixture");
  });

  for (const fields of [{ formatVersion: 2 }, { protocolVersion: 2 }, { helperVersion: "2.0.0" }]) {
    void test(`preserves ${JSON.stringify(fields)} before any compiler/staging effect`, () => {
      const outDir = join(root, `future-${Object.keys(fields)[0]}`);
      const manifest = preparePtyJobOwner({ outDir, run: fakeCompiler });
      const file = join(outDir, "manifest.json");
      writeFileSync(file, JSON.stringify({ ...manifest, ...fields }));
      const before = readFileSync(file);
      let calls = 0;
      assert.throws(() => preparePtyJobOwner({ outDir, run: () => calls++ }));
      assert.equal(calls, 0);
      assert.deepEqual(readFileSync(file), before);
    });
  }

  void test("preserves a partial build rather than overwriting it", () => {
    const outDir = join(root, "partial");
    mkdirSync(join(outDir, `win32-${process.arch}`), { recursive: true });
    const pending = join(outDir, `win32-${process.arch}`, "pty-job-owner-v1.exe.pending.exe");
    writeFileSync(pending, "retained partial artifact");
    let calls = 0;
    assert.throws(() => preparePtyJobOwner({ outDir, run: () => calls++ }), /partial.*preserve/);
    assert.equal(calls, 0);
    assert.equal(readFileSync(pending, "utf8"), "retained partial artifact");
  });

  void test("preserves a partial manifest before invoking the compiler", () => {
    const outDir = join(root, "partial-manifest");
    mkdirSync(outDir);
    const pending = join(outDir, "manifest.json.pending");
    writeFileSync(pending, "retained partial manifest");
    let calls = 0;
    assert.throws(() => preparePtyJobOwner({ outDir, run: () => calls++ }), /partial.*preserve/);
    assert.equal(calls, 0);
    assert.equal(readFileSync(pending, "utf8"), "retained partial manifest");
  });
}
