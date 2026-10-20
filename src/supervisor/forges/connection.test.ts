import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ForgeConnections } from "./connection";
import { ForgeRuntime } from "./runtime";
import type { ForgeAccountRef, ProjectLocation } from "@/shared/contracts";
import type { ForgeHttp, ForgeHttpRequest } from "./api";
import { parseForgeRemote } from "@/shared/forgeRemote";

const location: ProjectLocation = { kind: "windows", path: "C:\\repo" };
function fixture(
  remote: string,
  env: Record<string, string>,
  viewer: unknown,
  files: Record<string, string> = {},
  remoteName = "origin",
) {
  const runtime = new ForgeRuntime(() => undefined);
  const requests: ForgeHttpRequest[] = [];
  const tempFiles: Record<string, string>[] = [];
  vi.spyOn(runtime, "temporary").mockImplementation(
    async <T>(
      _location: ProjectLocation,
      temporaryFiles: Record<string, string>,
      operation: (dir: string) => Promise<T>,
    ): Promise<T> => {
      tempFiles.push(temporaryFiles);
      return operation("C:/owned-fixture");
    },
  );
  const send = vi.fn<ForgeHttp>(async (input) => {
    requests.push(input);
    return { status: 200, headers: {}, body: JSON.stringify(viewer) };
  });
  vi.spyOn(runtime, "run").mockImplementation(async (_location, command, args) => {
    if (command === "git")
      return args[0] === "remote"
        ? args[1] === "get-url"
          ? remote
          : `${remoteName}\t${remote} (fetch)\n${remoteName}\t${remote} (push)\n`
        : `${remoteName}/main`;
    if (command === "glab") return args[1] === "path" ? "glab-fixture.yml" : "glab-keyring-fixture";
    if (command === "az") return JSON.stringify({ accessToken: "azure-cli-fixture" });
    if (command === "cafe") return "username=alice\npassword=cafe-credential-fixture\n";
    throw new Error("unexpected command");
  });
  vi.spyOn(runtime, "environment").mockResolvedValue(env);
  vi.spyOn(runtime, "read").mockImplementation(async (_location, path) => files[path] ?? null);
  vi.spyOn(runtime, "http").mockReturnValue(send);
  const cli = vi.mocked(runtime.run);
  return { runtime, requests, cli, tempFiles, connections: new ForgeConnections(runtime) };
}

describe("source identity and credential isolation", () => {
  it("does not expose malformed login configuration or token contents in errors", async () => {
    const f = fixture(
      "git@gitea.example:team/app.git",
      { TEA_CONFIG: "tea-fixture.yml" },
      { login: "alice" },
      { "tea-fixture.yml": "logins: [secret-fixture-token\n" },
    );
    await expect(f.connections.resolve(location)).rejects.toThrow(
      "Source host login configuration could not be read.",
    );
    expect(f.requests).toEqual([]);
  });
  it.each([
    ["git@gitlab.com:group/subgroup/app.git", "https://gitlab.com", "group/subgroup/app"],
    ["ssh://git@git.example:2222/group/app.git", "https://git.example", "group/app"],
    ["git@ssh.dev.azure.com:v3/org/project/app", "https://dev.azure.com/org", "project/app"],
    ["https://org@dev.azure.com/org/project/_git/app", "https://dev.azure.com/org", "project/app"],
    [
      "https://org.visualstudio.com/project/_git/app",
      "https://org.visualstudio.com",
      "project/app",
    ],
  ])("preserves the deployment and complete namespace for %s", (remote, host, path) => {
    expect(parseForgeRemote(remote, "origin")).toEqual({ host, path, remote: "origin" });
  });
  it.each([
    "https://git.example/team/%2fapp",
    "https://git.example/team/%00app",
    "file:///tmp/repo",
    "https://git.example/team/%2e%2e/app",
  ])("rejects malformed remote %s", (remote) => {
    expect(parseForgeRemote(remote, "origin")).toBeNull();
  });
  it("binds a GitLab token to its exact deployment URL and verifies the principal", async () => {
    const f = fixture(
      "https://git.example/gitlab/team/group/app.git",
      {
        GITLAB_HOST: "https://git.example/gitlab",
        GITLAB_TOKEN: "gitlab-fixture",
        GH_TOKEN: "provider-not-used",
      },
      { username: "alice" },
    );
    const account: ForgeAccountRef = {
      forge: "gitlab",
      host: "https://git.example/gitlab",
      login: "alice",
    };
    const result = await f.connections.resolve(location, account);
    expect(result?.source).toMatchObject({ repository: "team/group/app", account });
    expect(f.requests[0]).toMatchObject({
      url: "https://git.example/gitlab/api/v4/user",
      headers: { Authorization: "Bearer gitlab-fixture" },
    });
    expect(f.cli.mock.calls.some((call) => call[1] === "glab" && call[2][1] === "get")).toBe(false);
  });
  it("rejects a mismatched host before using any credential", async () => {
    const f = fixture(
      "https://gitlab.com/team/app.git",
      { GITLAB_TOKEN: "gitlab-fixture" },
      { username: "alice" },
    );
    await expect(
      f.connections.resolve(location, {
        forge: "gitlab",
        host: "https://other.example",
        login: "alice",
      }),
    ).rejects.toThrow(/does not match/);
    expect(f.requests).toEqual([]);
  });
  it("discovers an enterprise GitLab deployment from GITLAB_URI", async () => {
    const f = fixture(
      "https://git.example/tools/gitlab/team/app.git",
      { GITLAB_URI: "https://git.example/tools/gitlab", GITLAB_TOKEN: "uri-fixture" },
      { username: "alice" },
    );
    const result = await f.connections.resolve(location);
    expect(result?.source).toMatchObject({
      forge: "gitlab",
      host: "https://git.example/tools/gitlab",
      repository: "team/app",
      account: { login: "alice" },
    });
    expect(f.requests[0]).toMatchObject({
      url: "https://git.example/tools/gitlab/api/v4/user",
      headers: { Authorization: "Bearer uri-fixture" },
    });
  });
  it("never retries an explicit account as another signed-in user", async () => {
    const f = fixture(
      "https://gitlab.com/team/app.git",
      { GITLAB_TOKEN: "gitlab-fixture" },
      { username: "bob" },
    );
    await expect(
      f.connections.resolve(location, {
        forge: "gitlab",
        host: "https://gitlab.com",
        login: "alice",
      }),
    ).rejects.toThrow(/different account/);
    expect(f.requests).toHaveLength(1);
    expect(f.cli.mock.calls.some((call) => call[1] === "glab" && call[2][1] === "get")).toBe(false);
  });
  it("does not send a global GitLab token to an enterprise host", async () => {
    const f = fixture(
      "https://git.example/team/app.git",
      { GITLAB_TOKEN: "gitlab-com-only" },
      { username: "alice" },
      { "glab-fixture.yml": "hosts:\n  git.example:\n    use_keyring: true\n" },
    );
    await f.connections.resolve(location, {
      forge: "gitlab",
      host: "https://git.example",
      login: "alice",
    });
    expect(f.tempFiles[0]).toEqual({
      "config.yml": JSON.stringify({ hosts: { "git.example": { use_keyring: true } } }),
    });
    expect(f.cli).toHaveBeenCalledWith(
      expect.objectContaining({ path: "C:/owned-fixture" }),
      "glab",
      ["config", "get", "token", "--host", "git.example"],
      expect.objectContaining({
        GITLAB_TOKEN: "",
        OAUTH_TOKEN: "",
        GLAB_CONFIG_DIR: "C:/owned-fixture",
      }),
    );
    expect(f.requests[0]?.headers.Authorization).toBe("Bearer glab-keyring-fixture");
  });
  it("selects a matching tea account without switching its default login", async () => {
    const config =
      "logins:\n  - name: work\n    url: https://gitea.example\n    user: alice\n    token: alice-fixture\n  - name: personal\n    url: https://gitea.example\n    user: bob\n    token: bob-fixture\n    default: true\n";
    const f = fixture(
      "git@gitea.example:team/app.git",
      { TEA_CONFIG: "tea-fixture.yml" },
      { login: "alice" },
      { "tea-fixture.yml": config },
    );
    const result = await f.connections.resolve(location, {
      forge: "gitea",
      host: "https://gitea.example",
      login: "alice",
    });
    expect(result?.source.account?.login).toBe("alice");
    expect(f.requests[0]?.headers.Authorization).toBe("token alice-fixture");
    expect(f.runtime.run).toHaveBeenCalledTimes(4);
  });
  it.each([
    ["https://dev.azure.com/org/project/_git/app", true],
    ["git@ssh.dev.azure.com:v3/org/project/app", true],
    ["https://dev.azure.com/other/project/_git/app", false],
    ["git@ssh.dev.azure.com:v3/other/project/app", false],
  ])("checks Azure push organization identity for %s", async (pushUrl, autoFix) => {
    const f = fixture(
      "https://dev.azure.com/org/project/_git/app",
      {
        AZURE_DEVOPS_ORG_SERVICE_URL: "https://dev.azure.com/org",
        AZURE_DEVOPS_EXT_PAT: "azure-fixture",
      },
      { authenticatedUser: { id: "guid", uniqueName: "alice@example.com" } },
    );
    const run = f.cli.getMockImplementation()!;
    f.cli.mockImplementation((target, command, args) =>
      command === "git" && args[1] === "get-url"
        ? Promise.resolve(pushUrl)
        : run(target, command, args),
    );
    const result = await f.connections.resolve(location, {
      forge: "azure-devops",
      host: "https://dev.azure.com/org",
      login: "guid",
    });
    expect(result?.source.repository).toBe("project/app");
    expect(result?.source.capabilities.autoFix).toBe(autoFix);
    expect(f.requests[0]?.url).toBe(
      "https://dev.azure.com/org/_apis/connectionData?api-version=7.1-preview.1",
    );
    expect(f.requests[0]?.headers.Authorization).toBe(
      `Basic ${Buffer.from(":azure-fixture").toString("base64")}`,
    );
  });
  it("does not send a global Azure PAT to a different org or arbitrary server", async () => {
    const f = fixture(
      "https://other.example/project/app.git",
      {
        AZURE_DEVOPS_ORG_SERVICE_URL: "https://dev.azure.com/org",
        AZURE_DEVOPS_EXT_PAT: "azure-fixture",
      },
      {},
    );
    await expect(
      f.connections.resolve(location, {
        forge: "azure-devops",
        host: "https://other.example",
        login: "guid",
      }),
    ).rejects.toThrow(/scoped/);
    expect(f.requests).toEqual([]);
  });
  it("resolves credentials in the WSL project runtime", async () => {
    const wsl: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    };
    const f = fixture(
      "git@git.cafe:team/app.git",
      { CAFE_TOKEN: "cafe-fixture" },
      { handle: "alice" },
    );
    await f.connections.resolve(wsl);
    expect(f.runtime.environment).toHaveBeenCalledWith(wsl);
    expect(f.runtime.http).toHaveBeenCalledWith(wsl);
    expect(f.requests[0]?.url).toBe("https://git.cafe/api/auth/principal");
  });

  it("honors GitLab's deployment subfolder for both token and API scope", async () => {
    const f = fixture(
      "https://git.example/tools/gitlab/team/app.git",
      {
        GITLAB_HOST: "git.example",
        GITLAB_SUBFOLDER: "/tools/gitlab/",
        GITLAB_TOKEN: "subfolder-fixture",
      },
      { username: "alice" },
    );
    const result = await f.connections.resolve(location);
    expect(result?.source).toMatchObject({
      host: "https://git.example/tools/gitlab",
      repository: "team/app",
    });
    expect(f.requests[0]).toMatchObject({
      url: "https://git.example/tools/gitlab/api/v4/user",
      headers: { Authorization: "Bearer subfolder-fixture" },
    });
  });

  it("uses glab's own config path without consulting repository/global token fallbacks", async () => {
    const f = fixture(
      "git@git.example:team/app.git",
      {},
      { username: "alice" },
      {
        "glab-fixture.yml":
          "token: global-not-used\nhosts:\n  git.example:\n    token: host-fixture\n",
      },
    );
    await f.connections.resolve(location);
    expect(f.cli).toHaveBeenCalledWith(location, "glab", ["config", "path"]);
    expect(f.requests[0]?.headers.Authorization).toBe("Bearer host-fixture");
    expect(f.tempFiles).toEqual([]);
  });

  it("keeps keyring lookup offline and clears ambient OAuth and repository selectors", async () => {
    const f = fixture(
      "git@git.example:team/app.git",
      { OAUTH_TOKEN: "plugin-not-used", GLAB_CONFIG_DIR: "fixture-config" },
      { username: "alice" },
      { "fixture-config/config.yml": "hosts:\n  git.example:\n    use_keyring: true\n" },
    );
    await f.connections.resolve(location);
    expect(f.cli).toHaveBeenCalledWith(
      expect.objectContaining({ path: "C:/owned-fixture" }),
      "glab",
      ["config", "get", "token", "--host", "git.example"],
      expect.objectContaining({
        OAUTH_TOKEN: "",
        GITLAB_TOKEN: "",
        GITLAB_ACCESS_TOKEN: "",
        GLAB_TOKEN: "",
        CI_JOB_TOKEN: "",
        GIT_DIR: "",
        GIT_WORK_TREE: "",
        GLAB_REPO: "",
      }),
    );
    expect(f.cli.mock.calls.some((call) => call[2][0] === "api")).toBe(false);
    expect(f.requests[0]?.headers.Authorization).toBe("Bearer glab-keyring-fixture");
  });

  it("reads Cafe's host credential offline, then uses the bounded HTTP transport", async () => {
    const f = fixture(
      "git@git.cafe:team/app.git",
      { CAFE_AUTH_FILE: "cafe-fixture.json" },
      { handle: "alice" },
      {
        "cafe-fixture.json": JSON.stringify({
          version: 1,
          hosts: {
            "git.cafe": {
              apiUrl: "https://git.cafe/api",
              username: "alice",
              expiresAt: null,
              unknown: "not-copied",
            },
            "other.example": { apiUrl: "https://other.example/api" },
          },
        }),
      },
    );
    await f.connections.resolve(location);
    expect(f.cli).toHaveBeenCalledWith(
      location,
      "cafe",
      [
        "auth",
        "http",
        "credential",
        "get",
        "--host",
        "https://git.cafe/api",
        "--no-input",
        "--no-update-check",
      ],
      {
        CAFE_AUTH_FILE: "C:/owned-fixture/cafe.json",
        CAFE_TOKEN: "",
        CAFE_GIT_HOST: "git.cafe",
      },
      false,
      "protocol=https\nhost=git.cafe\n\n",
    );
    expect(f.tempFiles).toEqual([
      {
        "cafe.json": JSON.stringify({
          version: 1,
          hosts: {
            "git.cafe": { apiUrl: "https://git.cafe/api", username: "alice", expiresAt: null },
          },
        }),
      },
    ]);
    expect(f.requests[0]?.headers.Authorization).toBe("Bearer cafe-credential-fixture");
  });

  it.each([undefined, "other/gitlab"])(
    "does not look up a hostname keyring without exact GitLab deployment metadata (%s)",
    async (subfolder) => {
      const config = subfolder
        ? `hosts:\n  git.example:\n    subfolder: ${subfolder}\n    use_keyring: true\n`
        : "hosts: {}\n";
      const f = fixture(
        "https://git.example/tools/gitlab/team/app.git",
        {},
        { username: "alice" },
        { "glab-fixture.yml": config },
      );
      await expect(
        f.connections.resolve(location, {
          forge: "gitlab",
          host: "https://git.example/tools/gitlab",
          login: "alice",
        }),
      ).rejects.toThrow(/scoped/);
      expect(f.cli.mock.calls.some((call) => call[1] === "glab" && call[2][1] === "get")).toBe(
        false,
      );
      expect(f.requests).toEqual([]);
    },
  );

  it.each([undefined, "https://git.cafe/other/api", "https://other.example/api"])(
    "does not read Cafe's keyring for mismatched deployment metadata (%s)",
    async (apiUrl) => {
      const f = fixture(
        "git@git.cafe:team/app.git",
        { CAFE_AUTH_FILE: "cafe-fixture.json" },
        { handle: "alice" },
        { "cafe-fixture.json": JSON.stringify({ version: 1, hosts: { "git.cafe": { apiUrl } } }) },
      );
      await expect(f.connections.resolve(location)).rejects.toThrow(/scoped/);
      expect(f.cli.mock.calls.some((call) => call[1] === "cafe")).toBe(false);
      expect(f.requests).toEqual([]);
    },
  );

  it("does not advertise origin-based auto-fix for a different upstream remote", async () => {
    const f = fixture(
      "git@gitlab.com:team/app.git",
      { GITLAB_TOKEN: "fixture" },
      { username: "alice" },
      {},
      "upstream",
    );
    expect((await f.connections.resolve(location))?.source).toMatchObject({
      remote: "upstream",
      capabilities: { autoFix: false },
    });
  });

  it.each([
    { name: "the origin URL", pushUrls: [], allowed: true },
    {
      name: "equivalent HTTPS and SSH push URLs",
      pushUrls: ["https://gitlab.com/team/app.git", "git@gitlab.com:team/app.git"],
      allowed: true,
    },
    {
      name: "a different push repository",
      pushUrls: ["https://gitlab.com/other/app.git"],
      allowed: false,
    },
    {
      name: "a different push host",
      pushUrls: ["https://other.example/team/app.git"],
      allowed: false,
    },
    {
      name: "one unsafe URL among multiple push destinations",
      pushUrls: ["https://gitlab.com/team/app.git", "https://gitlab.com/other/app.git"],
      allowed: false,
    },
    {
      name: "a proven SSH alias",
      pushUrls: ["git@gl-work:team/app.git"],
      alias: "gl-work",
      allowed: true,
    },
    {
      name: "an unproven SSH alias",
      pushUrls: ["git@gl-other:team/app.git"],
      alias: "gl-work",
      allowed: false,
    },
    {
      name: "an HTTPS hostname matching only an SSH alias",
      pushUrls: ["https://gl-work/team/app.git"],
      alias: "gl-work",
      allowed: false,
    },
    { name: "pushInsteadOf to another repository", pushUrls: [], rewrite: true, allowed: false },
  ])(
    "admits Auto Fix only for proven effective push destinations: $name",
    async ({ pushUrls, alias, rewrite, allowed }) => {
      const scratch = resolve("tmp");
      mkdirSync(scratch, { recursive: true });
      const root = mkdtempSync(join(scratch, "forge-push-regression-"));
      const git = (args: string[]) =>
        execFileSync("git", ["-C", root, ...args], {
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: join(root, "empty-global"),
            GIT_CONFIG_NOSYSTEM: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
      try {
        git(["init", "--quiet"]);
        git(["remote", "add", "origin", "https://gitlab.com/team/app.git"]);
        for (const url of pushUrls) git(["config", "--add", "remote.origin.pushurl", url]);
        if (rewrite)
          git([
            "config",
            "url.https://gitlab.com/other/.pushInsteadOf",
            "https://gitlab.com/team/",
          ]);
        const f = fixture(
          "https://gitlab.com/team/app.git",
          { GITLAB_TOKEN: "fixture" },
          { username: "alice" },
          alias
            ? {
                "glab-fixture.yml": `hosts:\n  gitlab.com:\n    ssh_host: ${alias}\n    token: fixture\n`,
              }
            : {},
        );
        const original = f.cli.getMockImplementation()!;
        f.cli.mockImplementation(async (...args) =>
          args[1] === "git" ? git(args[2]) : original(...args),
        );
        const result = await f.connections.resolve(location);
        expect(result?.source.capabilities.autoFix).toBe(allowed);
        expect(f.cli).toHaveBeenCalledWith(location, "git", [
          "remote",
          "get-url",
          "--push",
          "--all",
          "origin",
        ]);
        expect(f.requests).toHaveLength(1);
        expect(f.requests[0]?.url).toBe("https://gitlab.com/api/v4/user");
      } finally {
        expect(relative(scratch, root)).not.toMatch(/^\.\./);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
