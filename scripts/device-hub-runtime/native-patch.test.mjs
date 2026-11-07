import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareDeviceHub } from "../prepare-device-hub.mjs";
import {
  DEVICE_HUB_ARTIFACT_VERSION,
  DEVICE_HUB_NATIVE_MODULE_PATH,
  DEVICE_HUB_NATIVE_MODULE_SHA256,
  DEVICE_HUB_NATIVE_PATCH_RECEIPT,
  DEVICE_HUB_NATIVE_PATCH_SHA256,
  DEVICE_HUB_NATIVE_RECEIPT_PATH,
  DEVICE_HUB_NATIVE_UPSTREAM_SHA256,
  DEVICE_HUB_SCRCPY_PATH,
} from "../../src/shared/deviceHubArtifact.ts";

// Qualification gate: npm ci --ignore-scripts in this toolchain, then stage
// the pinned artifact. No test installs, downloads or starts a real device.
const root = new URL("../../", import.meta.url);
const staged = new URL(`resources/device-hub/${process.platform}-${process.arch}/`, root);
const upstream = new URL(
  "node_modules/expo-device-hub/vendor/serve-emu/dist/scrcpy.js",
  import.meta.url,
);
const source =
  process.env.PORACODE_DEVICE_HUB_TEST_BEFORE === "1"
    ? upstream
    : new URL(DEVICE_HUB_NATIVE_MODULE_PATH, staged);
const { startScrcpy } = await import(pathToFileURL(fileURLToPath(source)).href);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jar = Buffer.from("fixture pinned server bytes");
const fingerprint = hash(jar);
const cache = `/data/local/tmp/serve-emu-scrcpy-server-v4.0.jar-${fingerprint.slice(0, 24)}`;
const temporary = `${cache}.12345678.tmp`;
const working = "/data/local/tmp/serve-emu-scrcpy-12345678.jar";

void test("stages the platform closure and replaces artifact 1 without dropping simulator JS", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "hub-layout-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", scratch]);
  execFileSync("git", ["-C", scratch, "config", "core.autocrlf", "true"]);
  const output = join(scratch, "output");
  const target = join(output, `${process.platform}-${process.arch}`);
  await mkdir(target, { recursive: true });
  const previous = JSON.parse(await readFile(new URL("manifest.json", staged), "utf8"));
  await writeFile(join(target, "manifest.json"), JSON.stringify({ ...previous, version: 1 }));
  const result = await prepareDeviceHub({
    source: fileURLToPath(new URL("./", import.meta.url)),
    output,
    scratch,
    scrcpyServer: fileURLToPath(new URL(DEVICE_HUB_SCRCPY_PATH, staged)),
    runtimeAbi: previous.runtimeAbi,
  });
  const manifest = JSON.parse(await readFile(join(result.target, "manifest.json"), "utf8"));
  assert.equal(manifest.version, DEVICE_HUB_ARTIFACT_VERSION);
  assert.equal(
    JSON.parse(await readFile(join(result.previous, "manifest.json"), "utf8")).version,
    1,
  );
  const simulatorRoot = "node_modules/expo-device-hub/vendor/serve-sim/dist/";
  assert.ok(manifest.files.some((file) => file.path === `${simulatorRoot}middleware.js`));
  assert.equal(
    manifest.files.some((file) => file.path.startsWith(`${simulatorRoot}native/`)),
    process.platform === "darwin",
  );
  if (process.platform !== "darwin") {
    for (const directory of ["bin", "native", "simcam"])
      await assert.rejects(readFile(join(result.target, simulatorRoot, directory)), {
        code: "ENOENT",
      });
  }
  for (const file of manifest.files)
    assert.equal(hash(await readFile(join(result.target, file.path))), file.sha256, file.path);
});

function fixture(cached, failure) {
  const files = new Map(cached === undefined ? [] : [[cache, cached]]);
  const calls = [];
  const controller = new AbortController();
  let spawns = 0;
  let forwarded = false;
  let child;
  const result = (status = 0, stdout = "") => ({ status, stdout, stderr: "" });
  const deps = {
    ensureServer: async () => "/fixture/pinned-server",
    serverFingerprint: async () => fingerprint,
    randomScid: () => "12345678",
    runAdb: async (serial, args, options) => {
      assert.equal(serial, "fixture-serial");
      assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 30000);
      options.signal.throwIfAborted();
      calls.push(args);
      if (args[0] === "push") {
        if (failure === "push") return result(1);
        files.set(args[2], failure === "truncated" ? jar.subarray(0, 3) : jar);
        if (failure === "cancel") controller.abort(new Error("fixture push cancelled"));
      } else if (args[0] === "shell" && args[1] === "test") {
        return result(files.has(args[3]) ? 0 : 1);
      } else if (args[0] === "shell" && args[1] === "sha256sum") {
        if (failure === "hash" && args[2] === temporary) return result(1);
        const bytes = files.get(args[2]);
        return bytes ? result(0, `${hash(bytes)}  ${args[2]}\n`) : result(1);
      } else if (args[0] === "shell" && ["cp", "mv"].includes(args[1])) {
        assert.ok(files.has(args[2]));
        files.set(
          args[3],
          failure === "working" && args[1] === "cp" ? Buffer.from("corrupt") : files.get(args[2]),
        );
        if (args[1] === "mv") files.delete(args[2]);
      } else if (args[0] === "shell" && args[1] === "rm") {
        assert.deepEqual(args, ["shell", "rm", "-f", temporary, working]);
        for (const path of args.slice(3)) files.delete(path);
      } else if (args[0] === "forward") {
        if (args[1] === "tcp:0") {
          forwarded = true;
          return result(0, "23456\n");
        }
        if (args[1] === "--list")
          return result(
            0,
            forwarded ? "fixture-serial tcp:23456 localabstract:scrcpy_12345678\n" : "",
          );
        if (args[1] === "--remove") forwarded = false;
        else throw new Error(`Unexpected forward: ${args}`);
      } else if (args[0] === "shell" && args[1] === "cat") {
        assert.equal(args[2], "/proc/net/unix");
        return result(0, "@scrcpy_12345678");
      } else throw new Error(`Unexpected ADB operation: ${args}`);
      return result();
    },
    spawnAdb: (serial, args) => {
      spawns++;
      assert.equal(serial, "fixture-serial");
      assert.equal(args[1], `CLASSPATH=${working}`);
      assert.equal(hash(files.get(working)), fingerprint);
      child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill() {
          queueMicrotask(() => child.emit("exit", 0, null));
          return true;
        },
      });
      return child;
    },
    connect: async () => {
      const socket = new PassThrough();
      const preamble = Buffer.alloc(81);
      preamble.write("Fixture", 1);
      preamble.write("h264", 65);
      preamble.writeUInt32BE(0x80000000, 69);
      preamble.writeUInt32BE(576, 73);
      preamble.writeUInt32BE(1280, 77);
      socket.write(preamble);
      return socket;
    },
  };
  return {
    files,
    calls,
    controller,
    deps,
    get spawns() {
      return spawns;
    },
    get forwarded() {
      return forwarded;
    },
  };
}

void test("pins the pristine source, maintained patch, result and versioned receipt", async () => {
  assert.equal(hash(await readFile(upstream)), DEVICE_HUB_NATIVE_UPSTREAM_SHA256);
  assert.equal(
    hash(await readFile(new URL("patches/expo-device-hub@0.15.3.patch", root))),
    DEVICE_HUB_NATIVE_PATCH_SHA256,
  );
  assert.equal(
    hash(await readFile(new URL(DEVICE_HUB_NATIVE_MODULE_PATH, staged))),
    DEVICE_HUB_NATIVE_MODULE_SHA256,
  );
  assert.deepEqual(
    JSON.parse(await readFile(new URL(DEVICE_HUB_NATIVE_RECEIPT_PATH, staged))),
    DEVICE_HUB_NATIVE_PATCH_RECEIPT,
  );
});

void test("staging refuses unexpected or already-patched upstream bytes before promotion", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "poracode-native-patch-test-"));
  try {
    const fixtureSource = join(scratch, "toolchain");
    const modulePath = join(fixtureSource, DEVICE_HUB_NATIVE_MODULE_PATH);
    await mkdir(dirname(modulePath), { recursive: true });
    await writeFile(
      join(fixtureSource, "package-lock.json"),
      await readFile(new URL("package-lock.json", import.meta.url)),
    );
    await writeFile(
      join(fixtureSource, "node_modules/expo-device-hub/package.json"),
      await readFile(new URL("node_modules/expo-device-hub/package.json", import.meta.url)),
    );
    for (const bytes of [
      Buffer.from("unexpected upstream"),
      await readFile(new URL(DEVICE_HUB_NATIVE_MODULE_PATH, staged)),
    ]) {
      await writeFile(modulePath, bytes);
      await assert.rejects(
        prepareDeviceHub({
          source: fixtureSource,
          output: join(scratch, "output"),
          runtimeAbi: "149",
          scrcpyServer: fileURLToPath(new URL(DEVICE_HUB_SCRCPY_PATH, staged)),
        }),
        /pristine upstream module differs/,
      );
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

for (const [name, cached] of [
  ["valid", jar],
  ["zero", Buffer.alloc(0)],
  ["nonzero corrupt", Buffer.from("corrupt")],
  ["missing", undefined],
]) {
  void test(`${name} cache: exact validation precedes valid H264 startup and owned cleanup`, async () => {
    const f = fixture(cached);
    const session = await startScrcpy(
      { serial: "fixture-serial", signal: f.controller.signal },
      f.deps,
    );
    assert.equal(session.meta.codecId, "h264");
    assert.equal(session.meta.width, 576);
    assert.equal(session.meta.height, 1280);
    assert.equal(f.calls.filter((args) => args[0] === "push").length, name === "valid" ? 0 : 1);
    assert.equal(
      f.calls.filter((args) => args[1] === "sha256sum").length,
      name === "valid" ? 2 : 3,
    );
    assert.equal(hash(f.files.get(cache)), fingerprint);
    await session.close();
    assert.equal(f.files.has(temporary), false);
    assert.equal(f.files.has(working), false);
    assert.equal(f.forwarded, false);
    assert.equal(f.spawns, 1);
  });
}

for (const failure of ["push", "truncated", "hash", "working", "cancel"]) {
  void test(`${failure}: refuses startup and joins only owned temporary/working cleanup`, async () => {
    const cached = Buffer.from("preserved corrupt cache");
    const f = fixture(cached, failure);
    await assert.rejects(
      startScrcpy({ serial: "fixture-serial", signal: f.controller.signal }, f.deps),
    );
    assert.equal(f.spawns, 0);
    assert.equal(f.forwarded, false);
    assert.equal(f.files.has(temporary), false);
    assert.equal(f.files.has(working), false);
    if (failure !== "working") assert.deepEqual(f.files.get(cache), cached);
    assert.ok(f.calls.some((args) => args[1] === "rm"));
  });
}
