import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptOpenCode2Binary,
  isOpenCode1PackagePath,
  isOpenCode2Stub,
  parseOpenCode2Version,
  requireOpenCode2Version,
  unwrapOpenCode2Binary,
} from "./binary";
const roots: string[] = [];
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
function root() {
  const path = mkdtempSync(join(tmpdir(), "opencode2-binary-"));
  roots.push(path);
  return path;
}

describe("OpenCode 2 executable migration", () => {
  it("unwraps the current npm migration stub without running it", () => {
    const path = root();
    const stub = join(path, "opencode2.cjs");
    const binary = join(path, "opencode.exe");
    const alias = join(path, "opencode2");
    writeFileSync(
      stub,
      'console.log("opencode2 is now just opencode. run opencode")\nprocess.exit(1)\n',
    );
    writeFileSync(binary, "binary");
    symlinkSync(stub, alias);
    expect(isOpenCode2Stub(alias)).toBe(true);
    expect(unwrapOpenCode2Binary(alias)).toBe(realpathSync(binary));
    expect(isOpenCode2Stub(unwrapOpenCode2Binary(alias))).toBe(false);
  });
  it("resolves Windows npm shims to the package executable", () => {
    const path = root();
    const shim = join(path, "opencode2.cmd");
    const bin = join(path, "node_modules", "@opencode", "cli", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(shim, "shim");
    writeFileSync(join(bin, "opencode.exe"), "binary");
    expect(unwrapOpenCode2Binary(shim)).toBe(realpathSync(join(bin, "opencode.exe")));
  });
  it("keeps a standalone legacy binary separate from an adjacent executable", () => {
    const path = root();
    const binary = join(path, "opencode2.exe");
    writeFileSync(binary, "legacy beta");
    writeFileSync(join(path, "opencode.exe"), "other provider");
    expect(unwrapOpenCode2Binary(binary)).toBe(binary);
    expect(isOpenCode2Stub(binary)).toBe(false);
  });

  it("rejects the V1 npm package layout even if the filename is opencode", () => {
    expect(isOpenCode1PackagePath("/usr/local/lib/node_modules/opencode-ai/bin/opencode")).toBe(
      true,
    );
    expect(
      acceptOpenCode2Binary("/usr/local/lib/node_modules/opencode-ai/bin/opencode", "1.18.30"),
    ).toBe(false);
    expect(
      isOpenCode1PackagePath("/Users/me/.opencode2/node_modules/@opencode/cli/bin/opencode.exe"),
    ).toBe(false);
  });

  it("does not treat a lone npm stub as a runnable binary", () => {
    const path = root();
    const stub = join(path, "opencode2.cjs");
    writeFileSync(
      stub,
      'console.log("opencode2 is now just opencode. run opencode")\nprocess.exit(1)\n',
    );
    expect(isOpenCode2Stub(stub)).toBe(true);
    expect(unwrapOpenCode2Binary(stub)).toBe(stub);
  });
});

it("accepts published 2.0.0 and the last compatible beta, and rejects the previous protocol", () => {
  expect(parseOpenCode2Version("opencode v2.0.0\n")).toBe("2.0.0");
  expect(parseOpenCode2Version("opencode v0.0.0-beta-19500\n")).toBe("0.0.0-beta-19500");
  expect(parseOpenCode2Version("opencode v1.18.30\n")).toBeUndefined();
  expect(() => requireOpenCode2Version("0.0.0-beta-19425")).toThrow(
    "Update OpenCode 2 to 2.0.0 or newer",
  );
  expect(() => requireOpenCode2Version("0.0.0-beta-19500")).not.toThrow();
  expect(() => requireOpenCode2Version("2.0.0")).not.toThrow();
  expect(() => requireOpenCode2Version("1.18.30")).toThrow("Update OpenCode 2 to 2.0.0 or newer");
});
