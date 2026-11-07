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
    expect(result?.url).toBe("https://github.com/Porabuild/Poracode.git");
    expect(remote.url).toBe("git@github.com-SDSLeon:Porabuild/Poracode.git");
  });

  it.each([
    {
      alias: "gh-personal",
      hostname: "github.com",
      owner: "alice",
      repo: "notes-app",
      platform: "github",
      identity: "https://github.com/alice/notes-app",
    },
    {
      alias: "github.com-SDSLeon",
      hostname: "github.com",
      owner: "Porabuild",
      repo: "HeroGPUI",
      platform: "github",
      identity: "https://github.com/porabuild/herogpui",
    },
    {
      alias: "gitlab-work",
      hostname: "gitlab.com",
      owner: "team-rocket",
      repo: "service-api",
      platform: "gitlab",
      identity: "https://gitlab.com/team-rocket/service-api",
    },
    {
      alias: "enterprise-work",
      hostname: "git.company.example",
      owner: "platform",
      repo: "internal-tools",
      platform: "unknown",
      identity: "https://git.company.example/platform/internal-tools",
    },
  ] as const)(
    "resolves $alias through the owning host to $hostname without rewriting the configured URL",
    async ({ alias, hostname, owner, repo, platform, identity }) => {
      const configured: GitRemoteInfo = {
        url: `git@${alias}:${owner}/${repo}.git`,
        platform,
        owner,
        repo,
      };
      const result = await resolveGitRemoteInfo(
        location,
        configured,
        runtimeFor(`hostname ${hostname}\n`),
      );

      expect(repoIdentityKey(result)).toBe(identity);
      expect(result?.owner).toBe(owner);
      expect(result?.repo).toBe(repo);
      expect(configured.url).toBe(`git@${alias}:${owner}/${repo}.git`);
      expect(result?.url.startsWith("https://")).toBe(true);
      expect(result?.url).toContain(hostname);
      expect(result?.url).not.toContain(alias);
    },
  );

  it("keeps the same alias on two owning hosts in distinct namespaces", async () => {
    const configured: GitRemoteInfo = {
      url: "git@github.com-work:team/shared-name.git",
      platform: "github",
      owner: "team",
      repo: "shared-name",
    };
    const [github, enterprise] = await Promise.all([
      resolveGitRemoteInfo(location, configured, runtimeFor("hostname github.com\n")),
      resolveGitRemoteInfo(location, configured, runtimeFor("hostname git.company.example\n")),
    ]);

    expect(repoIdentityKey(github)).toBe("https://github.com/team/shared-name");
    expect(repoIdentityKey(enterprise)).toBe("https://git.company.example/team/shared-name");
    expect(repoIdentityKey(github)).not.toBe(repoIdentityKey(enterprise));
    expect(github?.url).toMatch(/^https:\/\/github\.com\//);
    expect(enterprise?.url).toMatch(/^https:\/\/git\.company\.example\//);
    expect(configured.url).toBe("git@github.com-work:team/shared-name.git");
  });

  it("keeps an alias that resolves to another deployment distinct", async () => {
    const result = await resolveGitRemoteInfo(
      location,
      remote,
      runtimeFor("hostname git.company.example\n"),
    );
    expect(repoIdentityKey(result)).toBe("https://git.company.example/porabuild/poracode");
    expect(result?.url).toBe("https://git.company.example/Porabuild/Poracode.git");
  });

  it.each([
    {
      label: "GitHub canonical SSH",
      configured: "git@github.com:Porabuild/Poracode.git",
      hostname: "github.com",
      identity: "https://github.com/porabuild/poracode",
      url: "https://github.com/Porabuild/Poracode.git",
    },
    {
      label: "GitLab canonical SSH",
      configured: "git@gitlab.com:team-rocket/service-api.git",
      hostname: "gitlab.com",
      identity: "https://gitlab.com/team-rocket/service-api",
      url: "https://gitlab.com/team-rocket/service-api.git",
    },
    {
      label: "enterprise canonical SSH",
      configured: "git@git.company.example:platform/internal-tools.git",
      hostname: "git.company.example",
      identity: "https://git.company.example/platform/internal-tools",
      url: "https://git.company.example/platform/internal-tools.git",
    },
    {
      label: "canonical ssh URL",
      configured: "SSH://git@github.com/Porabuild/Poracode.git",
      hostname: "github.com",
      identity: "https://github.com/porabuild/poracode",
      url: "https://github.com/Porabuild/Poracode.git",
    },
    {
      label: "configured host that SSH resolves to itself",
      configured: "git@github.com-SDSLeon:Porabuild/Poracode.git",
      hostname: "github.com-SDSLeon",
      identity: "https://github.com-sdsleon/porabuild/poracode",
      url: "https://github.com-SDSLeon/Porabuild/Poracode.git",
    },
  ] as const)(
    "canonicalizes $label even when the configured hostname is unchanged",
    async ({ configured, hostname, identity, url }) => {
      const result = await resolveGitRemoteInfo(
        location,
        { url: configured, platform: "github", owner: "Porabuild", repo: "Poracode" },
        runtimeFor(`hostname ${hostname}\n`),
      );
      expect(result?.url).toBe(url);
      expect(repoIdentityKey(result)).toBe(identity);
    },
  );

  it("keeps Azure SSH path semantics when canonicalizing", async () => {
    const result = await resolveGitRemoteInfo(
      location,
      {
        url: "git@ssh.dev.azure.com:v3/acme/project/repo.git",
        platform: "unknown",
        owner: "v3/acme/project",
        repo: "repo",
      },
      runtimeFor("hostname ssh.dev.azure.com\n"),
    );
    expect(result?.url).toBe("https://ssh.dev.azure.com/v3/acme/project/repo.git");
    expect(repoIdentityKey(result)).toBe("https://dev.azure.com/acme/project/repo");
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
      expect(repoIdentityKey(result)).toBeNull();
    },
  );

  it("resolves a default port with no proxy", async () => {
    const result = await resolveGitRemoteInfo(
      location,
      remote,
      runtimeFor("hostname github.com\nport 22\nproxycommand none\nproxyjump none\n"),
    );
    expect(repoIdentityKey(result)).toBe("https://github.com/porabuild/poracode");
    expect(result?.url).toBe("https://github.com/Porabuild/Poracode.git");
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
      const result = await resolveGitRemoteInfo(location, info, runtime);
      expect(result).toBe(info);
      expect(repoIdentityKey(result)).toBeNull();
      expect(runtime.run.mock.calls.some(([, command]) => command === "ssh")).toBe(false);
    },
  );

  it.each(["", "hostname invalid/path\n"])(
    "retains the original URL when resolution yields %j",
    async (output) => {
      const result = await resolveGitRemoteInfo(location, remote, runtimeFor(output));
      expect(result).toBe(remote);
      expect(repoIdentityKey(result)).toBeNull();
    },
  );

  it("keeps status usable when SSH is unavailable", async () => {
    const runtime = runtimeFor();
    runtime.run.mockRejectedValue(new Error("ssh unavailable"));
    const result = await resolveGitRemoteInfo(location, remote, runtime);
    expect(result).toBe(remote);
    expect(repoIdentityKey(result)).toBeNull();
  });

  it("does not resolve HTTPS remotes or missing origins", async () => {
    const runtime = runtimeFor();
    const https = { ...remote, url: "https://github.com/Porabuild/Poracode.git" };
    expect(await resolveGitRemoteInfo(location, https, runtime)).toBe(https);
    expect(await resolveGitRemoteInfo(location, null, runtime)).toBeNull();
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it.each(["GIT_SSH", "GIT_SSH_COMMAND", "GIT_SSH_VARIANT"])(
    "keeps the origin unconfirmed with a %s override",
    async (key) => {
      const runtime = runtimeFor();
      runtime.environment.mockResolvedValue({ [key]: "custom-ssh" });
      const result = await resolveGitRemoteInfo(location, remote, runtime);
      expect(result).toBe(remote);
      expect(repoIdentityKey(result)).toBeNull();
      expect(runtime.run).not.toHaveBeenCalled();
    },
  );

  it.each(["core.sshcommand ssh -F work.conf", "ssh.variant plink"])(
    "keeps the origin unconfirmed with Git config %s",
    async (config) => {
      const runtime = runtimeFor();
      runtime.run.mockResolvedValueOnce(config);
      const result = await resolveGitRemoteInfo(location, remote, runtime);
      expect(result).toBe(remote);
      expect(repoIdentityKey(result)).toBeNull();
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
