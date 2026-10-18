import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { batchWslCommandsAsync } from "../base";
import * as probeCwd from "../probeCwd";
import * as argv from "./argv";
import { deepSeekEnvFileHasKey, deepSeekHasStoredCredentials, probeDeepSeekAuth } from "./auth";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, readFile: vi.fn<typeof original.readFile>(original.readFile) };
});
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: vi.fn<typeof original.homedir>(original.homedir) };
});
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  batchWslCommandsAsync: vi.fn<typeof batchWslCommandsAsync>(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("DeepSeek credential presence", () => {
  it.each([
    undefined,
    "",
    "{}",
    "version: 1\nrefs: {}",
    "version: 1\nrefs: malformed",
    "version: 1\nrefs:\n  DEEPSEEK_API_KEY: ''",
    "version: 1\nrefs:\n  DEEPSEEK_API_KEY: 123",
    "DEEPSEEK_API_KEY: legacy-key",
    "version: 2\nrefs:\n  DEEPSEEK_API_KEY: future-key",
    "version: 1\nrefs: [broken",
    "version: 1\nrecords:\n  deepseek-account-platform/device:\n    kind: grant\n    payload:\n      token: device-id",
  ])("does not infer sign-in from an empty, invalid, or unrelated artifact (%s)", (raw) => {
    expect(deepSeekHasStoredCredentials(raw)).toBe(false);
  });

  it("recognizes a stored API key and a saved Harness account grant", () => {
    expect(deepSeekHasStoredCredentials("version: 1\nrefs:\n  DEEPSEEK_API_KEY: fixture-key")).toBe(
      true,
    );
    expect(deepSeekHasStoredCredentials("version: 1\nrefs:\n  CUSTOM_MODEL_KEY: fixture-key")).toBe(
      true,
    );
    expect(
      deepSeekHasStoredCredentials(
        "version: 1\nrecords:\n  deepseek-account-platform/default:\n    kind: grant\n    payload:\n      version: 1\n      issuer: https://platform.deepseek.com\n      token: fixture-grant",
      ),
    ).toBe(true);
  });

  it("reads dotenv syntax without treating a comment or empty value as a key", () => {
    expect(deepSeekEnvFileHasKey("# DEEPSEEK_API_KEY=fixture-key")).toBe(false);
    expect(deepSeekEnvFileHasKey('DEEPSEEK_API_KEY=""')).toBe(false);
    expect(deepSeekEnvFileHasKey('export DEEPSEEK_API_KEY="fixture-key"')).toBe(true);
  });

  it("honors the native Harness home and leaves unverified custom routes unknown", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-deepseek-auth-"));
    try {
      const location = {
        kind: process.platform === "win32" ? "windows" : "posix",
        path: root,
      } as const;
      vi.spyOn(argv, "buildDeepSeekCommand").mockReturnValue({
        command: "dsh",
        args: ["acp"],
        env: { DSH_HOME: root },
      });
      expect(await probeDeepSeekAuth({ location, executablePath: "dsh" })).toBe("unknown");
      await writeFile(
        join(root, ".credentials.yaml"),
        "version: 1\nrefs:\n  DEEPSEEK_API_KEY: fixture-key",
      );
      expect(await probeDeepSeekAuth({ location, executablePath: "dsh" })).toBe("authenticated");
      await rm(join(root, ".credentials.yaml"));
      await writeFile(join(root, ".env"), 'DEEPSEEK_API_KEY="fixture-key"');
      expect(await probeDeepSeekAuth({ location, executablePath: "dsh" })).toBe("authenticated");
      vi.mocked(argv.buildDeepSeekCommand).mockReturnValue({
        command: "dsh",
        args: ["acp"],
        env: { DSH_HOME: root, DEEPSEEK_API_KEY: "" },
      });
      expect(await probeDeepSeekAuth({ location, executablePath: "dsh" })).toBe("authenticated");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    [undefined, "/fixture/home/.dsh"],
    ["", "/fixture/home/.dsh"],
    [" \t", "/fixture/home/.dsh"],
    ["~", "/fixture/home"],
    ["~/custom", "/fixture/home/custom"],
    ["~\\custom", "/fixture/home/custom"],
    ["relative-home", "/fixture/probe/relative-home"],
    ["/custom with spaces ", "/custom with spaces "],
  ])("resolves native Harness home %s against the actual probe cwd", async (configured, root) => {
    const location = { kind: "posix", path: "/fixture/launch" } as const;
    vi.spyOn(os, "homedir").mockReturnValue("/fixture/home");
    vi.spyOn(probeCwd, "resolveProbeSpawnCwd").mockReturnValue("/fixture/probe");
    vi.spyOn(argv, "buildDeepSeekCommand").mockReturnValue({
      command: "dsh",
      args: ["acp"],
      cwd: location.path,
      env: { ...(configured !== undefined ? { DSH_HOME: configured } : {}) },
    });
    const read = vi.spyOn(fs, "readFile").mockImplementation(async (path) => {
      if (path === `${root}/.credentials.yaml`)
        return "version: 1\nrefs:\n  DEEPSEEK_API_KEY: fixture-key";
      throw new Error("fixture file absent");
    });
    expect(await probeDeepSeekAuth({ location, executablePath: "dsh" })).toBe("authenticated");
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      `${root}/.credentials.yaml`,
      `${root}/.env`,
    ]);
    expect(probeCwd.resolveProbeSpawnCwd).toHaveBeenCalledWith(location, location.path);
  });

  it.each([
    ["~\\custom", "C:\\Users\\Fixture\\custom"],
    ["relative-home", "C:\\probe\\relative-home"],
    [" \t", "C:\\Users\\Fixture\\.dsh"],
  ])("keeps Windows home %s in Windows path semantics", async (configured, root) => {
    const location = { kind: "windows", path: "C:\\probe" } as const;
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\Fixture");
    vi.spyOn(argv, "buildDeepSeekCommand").mockReturnValue({
      command: "dsh",
      args: ["acp"],
      cwd: location.path,
      env: { DSH_HOME: configured },
    });
    const read = vi.spyOn(fs, "readFile").mockImplementation(async (path) => {
      if (path === `${root}\\.credentials.yaml`)
        return "version: 1\nrefs:\n  DEEPSEEK_API_KEY: fixture-key";
      throw new Error("fixture file absent");
    });
    expect(await probeDeepSeekAuth({ location, executablePath: "dsh" })).toBe("authenticated");
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      `${root}\\.credentials.yaml`,
      `${root}\\.env`,
    ]);
  });

  it("checks distro credentials without inheriting host authentication", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "host-only-key");
    const location = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/work",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\work",
    } as const;
    const metadata = { ok: true, stdout: "\0/home/test\0\0" };
    vi.mocked(batchWslCommandsAsync)
      .mockResolvedValueOnce([metadata])
      .mockResolvedValueOnce([
        { ok: false, stdout: "" },
        { ok: false, stdout: "" },
      ]);
    expect(await probeDeepSeekAuth({ location, executablePath: "/bin/dsh" })).toBe("unknown");
    vi.mocked(batchWslCommandsAsync)
      .mockResolvedValueOnce([metadata])
      .mockResolvedValueOnce([
        { ok: true, stdout: "version: 1\nrefs:\n  DEEPSEEK_API_KEY: distro-key" },
        { ok: false, stdout: "" },
      ]);
    expect(await probeDeepSeekAuth({ location, executablePath: "/bin/dsh" })).toBe("authenticated");
  });

  it.each([
    ["", "/home/distro/.dsh"],
    [" \t", "/home/distro/.dsh"],
    ["~", "/home/distro"],
    ["~/custom", "/home/distro/custom"],
    ["~\\custom", "/home/distro/custom"],
    ["relative home", "/work/probe/relative home"],
    ["/custom home ", "/custom home "],
    ["quote'home", "/work/probe/quote'\\''home"],
  ])(
    "resolves WSL home %s and accepts dotenv after an empty inherited key",
    async (configured, quotedRoot) => {
      const location = {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/work/probe",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\probe",
      } as const;
      vi.mocked(batchWslCommandsAsync)
        .mockResolvedValueOnce([{ ok: true, stdout: `\0/home/distro\0${configured}\0` }])
        .mockResolvedValueOnce([
          { ok: false, stdout: "" },
          { ok: true, stdout: "DEEPSEEK_API_KEY=fixture-key" },
        ]);
      expect(await probeDeepSeekAuth({ location, executablePath: "/bin/dsh" })).toBe(
        "authenticated",
      );
      expect(batchWslCommandsAsync).toHaveBeenLastCalledWith(
        "Ubuntu",
        [
          `cat '${quotedRoot}/.credentials.yaml' 2>/dev/null`,
          `cat '${quotedRoot}/.env' 2>/dev/null`,
        ],
        undefined,
      );
    },
  );

  it("does not guess a WSL credential path when the distro environment probe fails", async () => {
    vi.mocked(batchWslCommandsAsync).mockResolvedValueOnce([{ ok: false, stdout: "" }]);
    const location = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/work",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\work",
    } as const;
    expect(await probeDeepSeekAuth({ location, executablePath: "/bin/dsh" })).toBe("unknown");
    expect(batchWslCommandsAsync).toHaveBeenCalledOnce();
  });
});
