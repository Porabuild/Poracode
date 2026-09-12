import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptOpenCode1Binary,
  clearOpenCode1BinaryCache,
  isOpenCode1CliVersion,
  isOpenCode2ForeignInstallPath,
  resolveOpenCode1Binary,
} from "./binary";
import {
  acceptOpenCode2Binary,
  parseOpenCode2Version,
  supportsOpenCode2Version,
} from "../opencode2/binary";

const mocks = vi.hoisted(() => ({
  readAgentCommandOutput: vi.fn<() => Promise<{ ok: boolean; stdout: string; stderr: string }>>(),
  resolveExecutablePathAsync: vi.fn<() => Promise<string | undefined>>(),
  resolveAgentBinaryPath: vi.fn<() => string | undefined>(),
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readAgentCommandOutput: mocks.readAgentCommandOutput,
  resolveExecutablePathAsync: mocks.resolveExecutablePathAsync,
}));

vi.mock("../binaryResolver", () => ({
  resolveAgentBinaryPath: mocks.resolveAgentBinaryPath,
}));

afterEach(() => {
  clearOpenCode1BinaryCache();
});

describe("OpenCode 1 vs OpenCode 2 CLI identity", () => {
  it("accepts only the 1.x version line as OpenCode 1", () => {
    expect(isOpenCode1CliVersion("1.18.30")).toBe(true);
    expect(isOpenCode1CliVersion("v1.14.19")).toBe(true);
    expect(isOpenCode1CliVersion("1.18.30-beta.1")).toBe(true);
    expect(isOpenCode1CliVersion("2.0.0")).toBe(false);
    expect(isOpenCode1CliVersion("v2.0.0")).toBe(false);
    expect(isOpenCode1CliVersion("0.0.0-beta-19500")).toBe(false);
    expect(isOpenCode1CliVersion("0.0.0-beta")).toBe(false);
    expect(isOpenCode1CliVersion(undefined)).toBe(false);
  });

  it("treats the V2 managed prefix and @opencode/cli package as foreign", () => {
    expect(
      isOpenCode2ForeignInstallPath(
        "/Users/me/.opencode2/node_modules/@opencode/cli/bin/opencode.exe",
      ),
    ).toBe(true);
    expect(
      isOpenCode2ForeignInstallPath(
        "C:\\Users\\me\\.opencode2\\node_modules\\@opencode\\cli\\bin\\opencode.exe",
      ),
    ).toBe(true);
    expect(
      isOpenCode2ForeignInstallPath("/usr/local/lib/node_modules/@opencode/cli/bin/opencode.exe"),
    ).toBe(true);
    expect(isOpenCode2ForeignInstallPath("/Users/me/.opencode/bin/opencode")).toBe(false);
    expect(isOpenCode2ForeignInstallPath("/opt/homebrew/bin/opencode")).toBe(false);
  });

  it("never lets both adapters accept the same binary", () => {
    const cases: Array<{ path: string; v1: string | undefined; v2Output: string }> = [
      { path: "/opt/homebrew/bin/opencode", v1: "1.18.30", v2Output: "opencode v1.18.30" },
      {
        path: "/Users/me/.opencode2/node_modules/@opencode/cli/bin/opencode.exe",
        v1: "2.0.0",
        v2Output: "opencode v2.0.0",
      },
      {
        path: "/usr/local/lib/node_modules/opencode-ai/bin/opencode",
        v1: "1.18.27",
        v2Output: "1.18.27",
      },
      { path: "/usr/bin/opencode", v1: "2.0.0", v2Output: "opencode v2.0.0" },
      {
        path: "/tmp/opencode2.cjs",
        v1: undefined,
        v2Output: "opencode2 is now just opencode. run opencode",
      },
    ];
    for (const row of cases) {
      const v1 = acceptOpenCode1Binary(row.path, row.v1);
      const v2 = acceptOpenCode2Binary(row.path, parseOpenCode2Version(row.v2Output));
      expect(v1 && v2, `${row.path} ${row.v1}`).toBe(false);
    }
  });

  it("lets OpenCode 2 take a PATH `opencode` that reports 2.0.0", () => {
    expect(acceptOpenCode1Binary("/usr/bin/opencode", "2.0.0")).toBe(false);
    expect(supportsOpenCode2Version("2.0.0")).toBe(true);
    expect(acceptOpenCode2Binary("/usr/bin/opencode", "2.0.0")).toBe(true);
  });
});

describe("resolveOpenCode1Binary", () => {
  it("keeps a 1.x PATH binary and ignores a 2.0.0 PATH binary", async () => {
    mocks.resolveExecutablePathAsync.mockReset().mockResolvedValue("/opt/homebrew/bin/opencode");
    mocks.resolveAgentBinaryPath.mockReset().mockReturnValue("/opt/homebrew/bin/opencode");
    mocks.readAgentCommandOutput.mockReset().mockResolvedValue({
      ok: true,
      stdout: "opencode v1.18.30\n",
      stderr: "",
    });
    await expect(resolveOpenCode1Binary({ kind: "posix", path: "/repo" })).resolves.toBe(
      "/opt/homebrew/bin/opencode",
    );

    mocks.readAgentCommandOutput.mockResolvedValue({
      ok: true,
      stdout: "opencode v2.0.0\n",
      stderr: "",
    });
    await expect(
      resolveOpenCode1Binary({ kind: "posix", path: "/other" }),
    ).resolves.toBeUndefined();
  });

  it("does not probe --version on a managed OpenCode 2 prefix path", async () => {
    const v2 = "/Users/me/.opencode2/node_modules/@opencode/cli/bin/opencode.exe";
    mocks.resolveExecutablePathAsync.mockReset().mockResolvedValue(v2);
    mocks.resolveAgentBinaryPath.mockReset().mockReturnValue(v2);
    mocks.readAgentCommandOutput.mockReset();
    await expect(resolveOpenCode1Binary({ kind: "posix", path: "/repo" })).resolves.toBeUndefined();
    expect(mocks.readAgentCommandOutput).not.toHaveBeenCalled();
  });
});
