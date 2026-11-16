import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installCliCommand } from "./cliInstallCommand";
import { execFileSync } from "node:child_process";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.runIf(process.platform === "win32")("Windows command shim", () => {
  it("runs from a Unicode home using an ASCII relative launcher", async () => {
    const home = mkdtempSync(join(tmpdir(), "poracode-Jos\u00e9-"));
    roots.push(home);
    const local = join(home, "AppData", "Local");
    const prefix = join(local, "Poracode", "server");
    const release = join(prefix, "releases", "2.0.0");
    mkdirSync(join(release, "runtime"), { recursive: true });
    mkdirSync(join(release, "bin"), { recursive: true });
    writeFileSync(
      join(release, "standalone.json"),
      JSON.stringify({
        formatVersion: 1,
        kind: "poracode-standalone-runtime",
        version: "2.0.0",
        target: "win32-x64",
        node: { version: "26.13.0", executable: "runtime/node.exe" },
      }),
    );
    writeFileSync(join(release, "bin", "poracode.cmd"), "@echo off\r\necho unicode-shim-ok\r\n");
    symlinkSync(release, join(prefix, "current"), "junction");
    const result = await installCliCommand({
      releaseRoot: release,
      env: { LOCALAPPDATA: local },
      home,
      platform: "win32",
    });
    expect(readFileSync(result.command, "utf8")).toContain("%~dp0");
    expect(execFileSync("cmd.exe", ["/d", "/c", result.command], { encoding: "utf8" })).toContain(
      "unicode-shim-ok",
    );
  });
});

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "poracode-command-install-"));
  roots.push(home);
  const prefix = join(home, ".local", "share", "poracode", "server");
  const release = join(prefix, "releases", "2.0.0");
  mkdirSync(join(release, "runtime"), { recursive: true });
  writeFileSync(
    join(release, "standalone.json"),
    JSON.stringify({
      formatVersion: 1,
      kind: "poracode-standalone-runtime",
      version: "2.0.0",
      target: "linux-x64",
      node: { version: "26.13.0", executable: "runtime/node" },
    }),
  );
  symlinkSync("releases/2.0.0", join(prefix, "current"));
  return { home, prefix, release };
}

describe.runIf(process.platform !== "win32")("installCliCommand", () => {
  it("links the existing shared runtime and reports when PATH needs updating", async () => {
    const f = fixture();
    const result = await installCliCommand({
      releaseRoot: f.release,
      home: f.home,
      env: { PATH: "/usr/bin" },
      platform: "linux",
    });
    expect(readlinkSync(result.command)).toBe(join(f.prefix, "current", "bin", "poracode"));
    expect(result.pathNeedsUpdate).toBe(true);
    expect(
      await installCliCommand({
        releaseRoot: f.release,
        home: f.home,
        env: { PATH: join(f.home, ".local", "bin") },
        platform: "linux",
      }),
    ).toMatchObject({ pathNeedsUpdate: false });
  });

  it("preserves an existing foreign command", async () => {
    const f = fixture();
    const command = join(f.home, ".local", "bin", "poracode");
    mkdirSync(join(f.home, ".local", "bin"), { recursive: true });
    writeFileSync(command, "foreign");
    await expect(
      installCliCommand({ releaseRoot: f.release, home: f.home, env: {}, platform: "linux" }),
    ).rejects.toThrow(/already belongs/u);
    expect(existsSync(command)).toBe(true);
    expect(readFileSync(command, "utf8")).toBe("foreign");
  });

  it("does not silently offer an older shared installation as the new command", async () => {
    const f = fixture();
    const external = join(f.home, "new-runtime");
    mkdirSync(external);
    writeFileSync(
      join(external, "standalone.json"),
      JSON.stringify({
        formatVersion: 1,
        kind: "poracode-standalone-runtime",
        version: "2.1.0",
        target: "linux-x64",
        node: { version: "26.13.0", executable: "runtime/node" },
      }),
    );
    await expect(
      installCliCommand({ releaseRoot: external, home: f.home, env: {}, platform: "linux" }),
    ).rejects.toThrow(/shared installation is older/u);
    expect(existsSync(join(f.home, ".local", "bin", "poracode"))).toBe(false);
  });
});
