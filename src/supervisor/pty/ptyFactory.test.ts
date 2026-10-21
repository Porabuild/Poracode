import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, type IPty } from "node-pty";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSupervisorPtyFactory } from "./ptyFactory";

const native = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>());
vi.mock("node-pty", () => ({ spawn: vi.fn<typeof spawn>() }));
vi.mock("./windowsPty", () => ({
  WindowsPty: class {
    constructor(...args: unknown[]) {
      native(...args);
    }
  },
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!;
const roots: string[] = [];
beforeEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  Object.defineProperty(process, "arch", { configurable: true, value: "x64" });
  vi.stubEnv("PORACODE_WSL_HELPERS_DIR", "");
});
afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform);
  Object.defineProperty(process, "arch", originalArch);
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(realpathSync.native("tmp"), "controlled-pty-assets-"));
  roots.push(root);
  const resourcesDirectory = join(root, "resources");
  const bundleDirectory = join(root, "lib");
  const helperDirectory = join(resourcesDirectory, "pty-job-owner", "win32-x64");
  mkdirSync(helperDirectory, { recursive: true });
  mkdirSync(bundleDirectory);
  writeFileSync(join(bundleDirectory, "ptyBroker.cjs"), "// Non-executable admission fixture.");
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x00004550, 64);
  bytes.writeUInt16LE(0x8664, 68);
  bytes.writeUInt16LE(240, 84);
  bytes.writeUInt16LE(0x20b, 88);
  bytes.writeUInt16LE(2, 156);
  const helperPath = join(helperDirectory, "pty-job-owner-v1.exe");
  writeFileSync(helperPath, bytes);
  const manifestPath = join(resourcesDirectory, "pty-job-owner", "manifest.json");
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
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const factory = createSupervisorPtyFactory({ resourcesDirectory, bundleDirectory });
  const location = { kind: "windows" as const, path: root };
  const options = { name: "xterm-color", cols: 80, rows: 24, cwd: root, env: {} };
  return {
    root,
    resourcesDirectory,
    bundleDirectory,
    manifestPath,
    manifest,
    helperPath,
    factory,
    location,
    options,
  };
}

it("keeps ordinary threads and shells on the existing direct spawn with no asset read", () => {
  const direct = {} as IPty;
  vi.mocked(spawn).mockReturnValueOnce(direct);
  const options = { cols: 80, rows: 24 };
  expect(
    createSupervisorPtyFactory()(
      "ordinary",
      ["arg"],
      options,
      { kind: "windows", path: "C:\\owned" },
      false,
    ),
  ).toBe(direct);
  expect(spawn).toHaveBeenCalledExactlyOnceWith("ordinary", ["arg"], options);
  expect(native).not.toHaveBeenCalled();
});

it("uses the selected helper and broker only for a controlled native Windows execution", () => {
  const f = fixture();
  f.factory("selected-provider", ["selected-arg"], f.options, f.location, true);
  expect(native).toHaveBeenCalledExactlyOnceWith("selected-provider", ["selected-arg"], f.options, {
    helperPath: f.helperPath,
    brokerPath: join(f.bundleDirectory, "ptyBroker.cjs"),
  });
  expect(spawn).not.toHaveBeenCalled();
});

it.each(["wsl", "wsl.exe", "C:\\Windows\\System32\\wsl.exe"])(
  "refuses controlled %s without spawning or falling back",
  (command) => {
    expect(() =>
      createSupervisorPtyFactory()(command, [], {}, { kind: "windows", path: "C:\\owned" }, true),
    ).toThrow("Linux-child retirement");
    expect(spawn).not.toHaveBeenCalled();
    expect(native).not.toHaveBeenCalled();
  },
);

it("refuses a selected WSL location before asset or process effects", () => {
  expect(() =>
    createSupervisorPtyFactory()(
      "selected-provider",
      [],
      {},
      {
        kind: "wsl",
        distro: "selected-fixture",
        linuxPath: "/work",
        uncPath: "\\\\wsl.localhost\\selected-fixture\\work",
      },
      true,
    ),
  ).toThrow("selected distro");
  expect(spawn).not.toHaveBeenCalled();
  expect(native).not.toHaveBeenCalled();
});

it("retains the existing non-Windows route", () => {
  Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
  const options = { cols: 80, rows: 24 };
  createSupervisorPtyFactory()(
    "selected-provider",
    [],
    options,
    { kind: "posix", path: "/owned" },
    true,
  );
  expect(spawn).toHaveBeenCalledExactlyOnceWith("selected-provider", [], options);
  expect(native).not.toHaveBeenCalled();
});

it.each([{ formatVersion: 2 }, { protocolVersion: 2 }, { helperVersion: "2.0.0" }])(
  "preserves unsupported helper $formatVersion/$protocolVersion/$helperVersion before effects",
  (fields) => {
    const f = fixture();
    writeFileSync(f.manifestPath, JSON.stringify({ ...f.manifest, ...fields }));
    const before = readFileSync(f.manifestPath);
    expect(() => f.factory("selected-provider", [], f.options, f.location, true)).toThrow(
      "unavailable or incompatible",
    );
    expect(readFileSync(f.manifestPath)).toEqual(before);
    expect(native).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  },
);

it("refuses a missing broker and mismatched target without direct fallback", () => {
  const f = fixture();
  expect(() =>
    createSupervisorPtyFactory({
      resourcesDirectory: f.resourcesDirectory,
      bundleDirectory: f.root,
    })("selected-provider", [], f.options, f.location, true),
  ).toThrow("broker is missing");
  Object.defineProperty(process, "arch", { configurable: true, value: "arm64" });
  expect(() => f.factory("selected-provider", [], f.options, f.location, true)).toThrow(
    "unavailable or incompatible",
  );
  expect(native).not.toHaveBeenCalled();
  expect(spawn).not.toHaveBeenCalled();
});

it("uses only the unpacked packaged broker path", () => {
  const f = fixture();
  const directory = join(f.root, "app.asar", "dist", "main");
  const unpacked = join(f.root, "app.asar.unpacked", "dist", "main");
  mkdirSync(unpacked, { recursive: true });
  writeFileSync(join(unpacked, "ptyBroker.cjs"), "// Admission fixture only.");
  createSupervisorPtyFactory({
    resourcesDirectory: f.resourcesDirectory,
    bundleDirectory: directory,
  })("selected-provider", [], f.options, f.location, true);
  expect(native).toHaveBeenCalledWith("selected-provider", [], f.options, {
    helperPath: f.helperPath,
    brokerPath: join(unpacked, "ptyBroker.cjs"),
  });
});
