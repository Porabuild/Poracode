import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const readAgentCommandOutputMock = vi.hoisted(() =>
  vi.fn<typeof import("./base").readAgentCommandOutput>(),
);
vi.mock("./base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./base")>()),
  readAgentCommandOutput: readAgentCommandOutputMock,
}));
import { resolveUpdateInstallPath } from "./updateInstallPath";
import { resolveSharedUpdateCommand } from "@/shared/agents/updateResolver";

describe("resolveUpdateInstallPath", () => {
  const roots: string[] = [];
  afterEach(async () => {
    readAgentCommandOutputMock.mockReset();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it.skipIf(process.platform === "win32")(
    "recognizes package-manager symlinks and keeps native symlinks independent",
    async () => {
      await mkdir("tmp", { recursive: true });
      const root = await mkdtemp(resolve("tmp/provider-update-path-"));
      roots.push(root);
      const bin = join(root, "bin");
      const packageDir = join(root, "lib/node_modules/test-agent");
      const nativeDir = join(root, ".local/share/test-agent/versions");
      await Promise.all([bin, packageDir, nativeDir].map((dir) => mkdir(dir, { recursive: true })));
      const packageBinary = join(packageDir, "agent.js");
      const nativeBinary = join(nativeDir, "2.0.0");
      await Promise.all([packageBinary, nativeBinary].map((path) => writeFile(path, "fixture")));
      const packageShim = join(bin, "package-agent");
      const nativeShim = join(bin, "native-agent");
      await Promise.all([symlink(packageBinary, packageShim), symlink(nativeBinary, nativeShim)]);
      const update = { builtIn: { binary: "test-agent", args: ["update"] }, npm: "test-agent" };
      const resolvedPackage = await resolveUpdateInstallPath(packageShim, { envKind: "posix" });
      expect(resolvedPackage).toBe(await realpath(packageBinary));
      expect(
        resolveSharedUpdateCommand({
          update,
          executablePath: resolvedPackage,
          envKind: "posix",
          installedPackageManagerOnly: true,
        })?.strategy,
      ).toBe("npm-global");
      const resolvedNative = await resolveUpdateInstallPath(nativeShim, { envKind: "posix" });
      expect(resolvedNative).toBe(await realpath(nativeBinary));
      expect(
        resolveSharedUpdateCommand({
          update,
          executablePath: resolvedNative,
          envKind: "posix",
          installedPackageManagerOnly: true,
        }),
      ).toBeUndefined();
    },
  );

  it("resolves WSL symlinks inside their distro and retains the original path on failure", async () => {
    readAgentCommandOutputMock
      .mockResolvedValueOnce({
        ok: true,
        stdout: "/usr/lib/node_modules/test-agent/bin.js\n",
        stderr: "",
      })
      .mockResolvedValueOnce({ ok: false, stdout: "", stderr: "unavailable" });
    const env = { envKind: "wsl" as const, wslDistro: "Ubuntu" };
    expect(await resolveUpdateInstallPath("/usr/bin/test-agent", env)).toBe(
      "/usr/lib/node_modules/test-agent/bin.js",
    );
    expect(readAgentCommandOutputMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "wsl", distro: "Ubuntu" }),
      "readlink",
      ["-f", "--", "/usr/bin/test-agent"],
      { timeoutMs: 5_000 },
    );
    expect(await resolveUpdateInstallPath("/usr/bin/test-agent", env)).toBe("/usr/bin/test-agent");
  });
});
