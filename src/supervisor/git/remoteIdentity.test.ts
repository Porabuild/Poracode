import { describe, expect, it, vi } from "vitest";
import type { GitRemoteInfo, ProjectLocation } from "@/shared/contracts";
import { repoIdentityKey } from "@/shared/repoIdentity";
import { ForgeRuntime } from "../forges/runtime";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { resolveGitRemoteInfo } from "./remoteIdentity";

const location: ProjectLocation = { kind: "posix", path: "/repo" };
const remote: GitRemoteInfo = {
  url: "git@github.com-SDSLeon:Porabuild/Poracode.git",
  platform: "github",
  owner: "Porabuild",
  repo: "Poracode",
};

function runtimeFor(output = "hostname github.com\n") {
  return {
    run: vi.fn<ForgeRuntime["run"]>(async (_location, command) =>
      command === "git" ? "" : output,
    ),
    environment: vi.fn<ForgeRuntime["environment"]>(async () => ({})),
  };
}

describe("resolveGitRemoteInfo", () => {
  it("resolves the released alias URL through the owning host's SSH config", async () => {
    const runtime = runtimeFor();
    const result = await resolveGitRemoteInfo(location, remote, runtime);
    expect(runtime.run).toHaveBeenCalledWith(location, "ssh", [
      "-G",
      "-l",
      "git",
      "--",
      "github.com-SDSLeon",
    ]);
    expect(repoIdentityKey(result)).toBe("https://github.com/porabuild/poracode");
    expect(remote.url).toBe("git@github.com-SDSLeon:Porabuild/Poracode.git");
  });

  it("keeps an alias that resolves to another deployment distinct", async () => {
    const result = await resolveGitRemoteInfo(
      location,
      remote,
      runtimeFor("hostname git.company.example\n"),
    );
    expect(repoIdentityKey(result)).toBe("https://git.company.example/porabuild/poracode");
  });

  it.each(["port 2222", "proxycommand ssh gateway nc %h %p", "proxyjump gateway"])(
    "preserves distinct SSH routes with %s",
    async (route) => {
      const result = await resolveGitRemoteInfo(
        location,
        remote,
        runtimeFor(`hostname github.com\n${route}\n`),
      );
      expect(result).toBe(remote);
    },
  );

  it("resolves a default port with no proxy", async () => {
    const result = await resolveGitRemoteInfo(
      location,
      remote,
      runtimeFor("hostname github.com\nport 22\nproxycommand none\nproxyjump none\n"),
    );
    expect(repoIdentityKey(result)).toBe("https://github.com/porabuild/poracode");
  });

  it("passes the URL user and port to SSH without treating a hostname as options", async () => {
    const runtime = runtimeFor("hostname git.example\n");
    await resolveGitRemoteInfo(
      location,
      { ...remote, url: "ssh://alice@-alias:2222/org/repo" },
      runtime,
    );
    expect(runtime.run).toHaveBeenCalledWith(location, "ssh", [
      "-G",
      "-l",
      "alice",
      "-p",
      "2222",
      "--",
      "-alias",
    ]);
  });

  it.each(["ssh://%24%28touch%20%2Ftmp%2Fpwn%29@alias/org/repo", "ssh://git@$(command)/org/repo"])(
    "does not pass unsafe SSH config tokens from %s",
    async (url) => {
      const runtime = runtimeFor();
      const info = { ...remote, url };
      expect(await resolveGitRemoteInfo(location, info, runtime)).toBe(info);
      expect(runtime.run.mock.calls.some(([, command]) => command === "ssh")).toBe(false);
    },
  );

  it.each(["", "hostname github.com-SDSLeon\n", "hostname invalid/path\n"])(
    "retains the original URL when resolution yields %j",
    async (output) => {
      expect(await resolveGitRemoteInfo(location, remote, runtimeFor(output))).toBe(remote);
    },
  );

  it("keeps status usable when SSH is unavailable", async () => {
    const runtime = runtimeFor();
    runtime.run.mockRejectedValue(new Error("ssh unavailable"));
    expect(await resolveGitRemoteInfo(location, remote, runtime)).toBe(remote);
  });

  it("does not resolve HTTPS remotes or missing origins", async () => {
    const runtime = runtimeFor();
    const https = { ...remote, url: "https://github.com/Porabuild/Poracode.git" };
    expect(await resolveGitRemoteInfo(location, https, runtime)).toBe(https);
    expect(await resolveGitRemoteInfo(location, null, runtime)).toBeNull();
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it.each(["GIT_SSH", "GIT_SSH_COMMAND", "GIT_SSH_VARIANT"])(
    "preserves identity with a %s override",
    async (key) => {
      const runtime = runtimeFor();
      runtime.environment.mockResolvedValue({ [key]: "custom-ssh" });
      expect(await resolveGitRemoteInfo(location, remote, runtime)).toBe(remote);
      expect(runtime.run).not.toHaveBeenCalled();
    },
  );

  it.each(["core.sshcommand ssh -F work.conf", "ssh.variant plink"])(
    "preserves identity with Git config %s",
    async (config) => {
      const runtime = runtimeFor();
      runtime.run.mockResolvedValueOnce(config);
      expect(await resolveGitRemoteInfo(location, remote, runtime)).toBe(remote);
      expect(runtime.run).toHaveBeenCalledTimes(1);
    },
  );

  it("runs WSL resolution in the distro rather than using Windows SSH config", async () => {
    const wsl: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl$\\Ubuntu\\repo",
    };
    const processExec = vi.fn<WslBridgeClient["processExec"]>(async (_location, input) => ({
      ok: true,
      stdout: input.command === "git" ? "" : "hostname github.com\n",
      stderr: "",
      exitCode: 0,
    }));
    const runtime = new ForgeRuntime(() => ({ processExec }) as unknown as WslBridgeClient);
    vi.spyOn(runtime, "environment").mockResolvedValue({});
    const result = await resolveGitRemoteInfo(wsl, remote, runtime);
    expect(processExec).toHaveBeenCalledWith(
      wsl,
      expect.objectContaining({ command: "ssh", cwd: "/repo" }),
    );
    expect(repoIdentityKey(result)).toBe("https://github.com/porabuild/poracode");
  });
});
