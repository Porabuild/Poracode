import { getWslCommand } from "./shellBasics";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageLaunchFiles } from "./launchFiles";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn<typeof execFileSync>() }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    mkdirSync: vi.fn<typeof fs.mkdirSync>(fs.mkdirSync),
    writeFileSync: vi.fn<typeof fs.writeFileSync>(fs.writeFileSync),
    rmSync: vi.fn<typeof fs.rmSync>(fs.rmSync),
  };
});
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  vi.resetAllMocks();
});

describe("private launch files", () => {
  it("isolates simultaneous launches and removes only its own files", () => {
    const first = stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", {
      "nested/config.json": "secret",
    });
    const second = stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", {
      "config.json": "other",
    });
    cleanup.push(first.cleanup, second.cleanup);
    expect(first.directory).not.toBe(second.directory);
    expect(readFileSync(join(first.directory, "nested/config.json"), "utf8")).toBe("secret");
    first.cleanup();
    first.cleanup();
    expect(existsSync(first.directory)).toBe(false);
    expect(existsSync(second.directory)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "creates owner-only directories and files on POSIX",
    () => {
      const files = stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", {
        "config.json": "private",
      });
      cleanup.push(files.cleanup);
      expect(statSync(files.directory).mode & 0o777).toBe(0o700);
      expect(statSync(join(files.directory, "config.json")).mode & 0o777).toBe(0o600);
    },
  );

  it.each(["../outside", "/absolute", "C:\\absolute", "nested/../../outside"])(
    "rejects escaping path %s",
    (path) => {
      expect(() =>
        stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", { [path]: "secret" }),
      ).toThrow("inside its directory");
    },
  );

  it("protects WSL directories inside Linux before writing over UNC", () => {
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(writeFileSync).mockImplementation(() => undefined);
    vi.mocked(rmSync).mockImplementation(() => undefined);
    const result = stageLaunchFiles(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\project",
      },
      "fixture",
      { "config.json": "secret" },
    );
    result.cleanup();
    expect(execFileSync).toHaveBeenCalledWith(
      getWslCommand(),
      ["-d", "Ubuntu", "--exec", "mkdir", "--mode=700", "--", result.directory],
      { windowsHide: true },
    );
    expect(vi.mocked(execFileSync).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(writeFileSync).mock.invocationCallOrder[0]!,
    );
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("distro unavailable");
    });
    vi.mocked(writeFileSync).mockClear();
    expect(() =>
      stageLaunchFiles(
        { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "unused" },
        "fixture",
        { "config.json": "secret" },
      ),
    ).toThrow("distro unavailable");
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});
