import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptOpenCodeBinary,
  isOpenCode1PackagePath,
  isOpenCodeStub,
  parseOpenCodeVersion,
  requireOpenCodeVersion,
  unwrapOpenCodeBinary,
} from "./binary";

const roots: string[] = [];
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

function root() {
  const path = mkdtempSync(join(tmpdir(), "opencode-binary-"));
  roots.push(path);
  return path;
}

describe("OpenCode executable migration", () => {
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
    expect(isOpenCodeStub(alias)).toBe(true);
    expect(unwrapOpenCodeBinary(alias)).toBe(realpathSync(binary));
    expect(isOpenCodeStub(unwrapOpenCodeBinary(alias))).toBe(false);
  });

  it("resolves Windows npm shims to the package executable", () => {
    const path = root();
    const shim = join(path, "opencode2.cmd");
    const bin = join(path, "node_modules", "@opencode", "cli", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(shim, "shim");
    writeFileSync(join(bin, "opencode.exe"), "binary");
    expect(unwrapOpenCodeBinary(shim)).toBe(realpathSync(join(bin, "opencode.exe")));
  });

  it("keeps a standalone legacy binary separate from an adjacent executable", () => {
    const path = root();
    const binary = join(path, "opencode2.exe");
    writeFileSync(binary, "legacy beta");
    writeFileSync(join(path, "opencode.exe"), "other provider");
    expect(unwrapOpenCodeBinary(binary)).toBe(binary);
    expect(isOpenCodeStub(binary)).toBe(false);
  });

  it("rejects the V1 npm package layout even if the filename is opencode", () => {
    expect(isOpenCode1PackagePath("/usr/local/lib/node_modules/opencode-ai/bin/opencode")).toBe(
      true,
    );
    expect(
      acceptOpenCodeBinary("/usr/local/lib/node_modules/opencode-ai/bin/opencode", "1.18.30"),
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
    expect(isOpenCodeStub(stub)).toBe(true);
    expect(unwrapOpenCodeBinary(stub)).toBe(stub);
  });
});

it("accepts published 2.4.1 and rejects older protocols", () => {
  expect(parseOpenCodeVersion("opencode v2.4.1\n")).toBe("2.4.1");
  expect(parseOpenCodeVersion("opencode v0.0.0-beta-19500\n")).toBe("0.0.0-beta-19500");
  expect(parseOpenCodeVersion("opencode v1.18.30\n")).toBeUndefined();
  expect(() => requireOpenCodeVersion("0.0.0-beta-19425")).toThrow(
    "Update it in provider settings",
  );
  expect(() => requireOpenCodeVersion("0.0.0-beta-19500")).toThrow(
    "Update it in provider settings",
  );
  expect(() => requireOpenCodeVersion("2.0.25")).toThrow("Update it in provider settings");
  // The previous pin predates the deprecated MCP aliases this adapter no longer calls.
  expect(() => requireOpenCodeVersion("2.0.26")).toThrow("Update it in provider settings");
  expect(() => requireOpenCodeVersion("2.4.0")).toThrow("Update it in provider settings");
  expect(() => requireOpenCodeVersion("2.4.1")).not.toThrow();
  expect(() => requireOpenCodeVersion("2.5.0")).not.toThrow();
  expect(() => requireOpenCodeVersion("1.18.30")).toThrow("Update it in provider settings");
});
