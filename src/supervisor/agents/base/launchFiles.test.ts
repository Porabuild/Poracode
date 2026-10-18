import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecFileOptions } from "node:child_process";
import { toWslUncPath } from "@/shared/wsl";
import { setWslStagingService } from "../../wsl/staging";
import { stageLaunchFiles } from "./launchFiles";

const { execFileAsync } = vi.hoisted(() => ({
  execFileAsync:
    vi.fn<
      (
        file: string,
        args: readonly string[],
        options: ExecFileOptions,
      ) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>
    >(),
}));

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  execFileAsync.mockImplementation(promisify(actual.execFile));
  return {
    ...actual,
    execFile: Object.assign(vi.fn(), { [promisify.custom]: execFileAsync }),
  };
});

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  setWslStagingService(undefined);
});

describe("private launch files", () => {
  it.runIf(process.platform === "win32")(
    "writes private files only after asynchronous Windows permission setup",
    async () => {
      const identity = Promise.withResolvers<{ stdout: string; stderr: string }>();
      const permissions = Promise.withResolvers<{ stdout: string; stderr: string }>();
      execFileAsync
        .mockImplementationOnce(() => identity.promise)
        .mockImplementationOnce(() => permissions.promise);

      const staging = stageLaunchFiles({ kind: "windows", path: "C:\\repo" }, "permissions", {
        "config.json": "dummy",
      });
      identity.resolve({ stdout: '"test","S-1-5-21-123"', stderr: "" });
      await vi.waitFor(() =>
        expect(execFileAsync).toHaveBeenLastCalledWith(
          expect.stringMatching(/icacls\.exe$/u),
          expect.any(Array),
          { windowsHide: true },
        ),
      );
      const directory = (execFileAsync.mock.calls.at(-1)![1] as string[])[0]!;
      expect(existsSync(join(directory, "config.json"))).toBe(false);
      permissions.resolve({ stdout: "", stderr: "" });
      const files = await staging;
      cleanup.push(() => void files.cleanup());
      expect(readFileSync(join(files.directory, "config.json"), "utf8")).toBe("dummy");
    },
  );

  it.runIf(process.platform === "win32")(
    "removes the empty directory when Windows permission setup fails",
    async () => {
      execFileAsync
        .mockResolvedValueOnce({ stdout: '"test","S-1-5-21-123"', stderr: "" })
        .mockRejectedValueOnce(new Error("ACL refused"));
      await expect(
        stageLaunchFiles({ kind: "windows", path: "C:\\repo" }, "permissions", {
          "config.json": "dummy",
        }),
      ).rejects.toThrow("ACL refused");
      const directory = (execFileAsync.mock.calls.at(-1)![1] as string[])[0]!;
      expect(existsSync(directory)).toBe(false);
    },
  );

  it("isolates simultaneous launches and removes only its own files", async () => {
    const first = await stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", {
      "nested/config.json": "secret",
    });
    const second = await stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", {
      "config.json": "other",
    });
    cleanup.push(
      () => void first.cleanup(),
      () => void second.cleanup(),
    );
    expect(first.directory).not.toBe(second.directory);
    expect(readFileSync(join(first.directory, "nested/config.json"), "utf8")).toBe("secret");
    await first.cleanup();
    await first.cleanup();
    expect(existsSync(first.directory)).toBe(false);
    expect(existsSync(second.directory)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "creates owner-only directories and files on POSIX",
    async () => {
      const files = await stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", {
        "config.json": "private",
      });
      cleanup.push(() => void files.cleanup());
      expect(statSync(files.directory).mode & 0o777).toBe(0o700);
      expect(statSync(join(files.directory, "config.json")).mode & 0o777).toBe(0o600);
    },
  );

  it.each(["../outside", "/absolute", "C:\\absolute", "nested/../../outside"])(
    "rejects escaping path %s",
    async (path) => {
      await expect(
        stageLaunchFiles({ kind: "posix", path: "/project" }, "fixture", { [path]: "secret" }),
      ).rejects.toThrow("inside its directory");
    },
  );

  it("writes WSL launch files through the staging worker with private modes", async () => {
    const dirs: { distro: string; path: string; mode?: number }[] = [];
    const writes: { distro: string; path: string; content: string; mode?: number }[] = [];
    const removed: string[] = [];
    setWslStagingService({
      mkdirp: async (distro: string, path: string, options?: { mode?: number }) => {
        dirs.push({ distro, path, ...(options?.mode !== undefined ? { mode: options.mode } : {}) });
      },
      writeTextFile: async (
        distro: string,
        path: string,
        content: string,
        options?: { mode?: number },
      ) => {
        writes.push({
          distro,
          path,
          content,
          ...(options?.mode !== undefined ? { mode: options.mode } : {}),
        });
      },
      remove: async (_distro: string, path: string) => {
        removed.push(path);
      },
    } as never);

    const files = await stageLaunchFiles(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\project",
      },
      "fixture",
      { "config.json": "secret" },
    );

    expect(files.directory).toMatch(/^\/tmp\/poracode-fixture-/u);
    expect(dirs).toEqual([
      { distro: "Ubuntu", path: toWslUncPath("Ubuntu", files.directory), mode: 0o700 },
    ]);
    expect(writes[0]).toMatchObject({ distro: "Ubuntu", content: "secret", mode: 0o600 });
    expect(writes[0]!.path).toContain("\\tmp\\poracode-fixture-");

    await files.cleanup();
    expect(removed[0]).toBe(dirs[0]!.path);

    // A failed write removes the partial directory instead of leaking it.
    setWslStagingService({
      mkdirp: async () => {},
      writeTextFile: async () => {
        throw new Error("distro unavailable");
      },
      remove: async (_distro: string, path: string) => {
        removed.push(path);
      },
    } as never);
    await expect(
      stageLaunchFiles(
        { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "unused" },
        "fixture",
        { "config.json": "secret" },
      ),
    ).rejects.toThrow("distro unavailable");
    expect(removed).toHaveLength(2);
  });
});
