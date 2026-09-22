import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toWslUncPath } from "@/shared/wsl";
import { setWslStagingService } from "../../wsl/staging";
import { stageLaunchFiles } from "./launchFiles";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  setWslStagingService(undefined);
});

describe("private launch files", () => {
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
