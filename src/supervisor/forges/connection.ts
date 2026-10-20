import { msg } from "@/shared/messages";
import { parse as parseYaml } from "yaml";
import { normalizeForgeHost, parseForgeRemote } from "@/shared/forgeRemote";
export { normalizeForgeHost, parseForgeRemote } from "@/shared/forgeRemote";
import type {
  ForgeAccountRef,
  ForgeKind,
  ForgeRepository,
  ForgeReviewCapabilities,
  ProjectLocation,
} from "@/shared/contracts";
import { ForgeApi } from "./api";
import { ForgeRuntime, runtimeConfigPath } from "./runtime";
import { object, rows, str } from "./types";

const ALL_MERGES = ["merge", "squash", "rebase"] as const;
const ALL_REVIEWS = ["approve", "request-changes", "comment"] as const;
export const FORGE_CAPABILITIES: Record<ForgeKind, ForgeReviewCapabilities> = {
  github: {
    viewedFiles: "forge",
    commentEditing: ["conversation", "inline"],
    mergeMethods: [...ALL_MERGES],
    reviewDecisions: [...ALL_REVIEWS],
    draft: true,
    reopen: true,
    updateBranch: true,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: true,
  },
  gitlab: {
    commentEditing: ["conversation", "inline"],
    viewedFiles: "host",
    mergeMethods: ["merge", "squash"],
    reviewDecisions: ["approve", "comment"],
    draft: true,
    reopen: true,
    updateBranch: false,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: false,
  },
  forgejo: {
    commentEditing: ["conversation"],
    viewedFiles: "host",
    mergeMethods: [...ALL_MERGES],
    reviewDecisions: [...ALL_REVIEWS],
    draft: true,
    reopen: true,
    updateBranch: true,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: false,
    autoFix: true,
    adminMerge: false,
  },
  gitea: {
    commentEditing: ["conversation"],
    viewedFiles: "host",
    mergeMethods: [...ALL_MERGES],
    reviewDecisions: [...ALL_REVIEWS],
    draft: true,
    reopen: true,
    updateBranch: true,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: false,
    autoFix: true,
    adminMerge: false,
  },
  bitbucket: {
    commentEditing: ["conversation", "inline"],
    viewedFiles: "host",
    mergeMethods: [...ALL_MERGES],
    reviewDecisions: [...ALL_REVIEWS],
    draft: true,
    reopen: false,
    updateBranch: false,
    rebaseBranch: false,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: false,
    autoMerge: false,
    autoFix: true,
    adminMerge: false,
  },
  "azure-devops": {
    viewedFiles: "host",
    mergeMethods: [...ALL_MERGES],
    reviewDecisions: [...ALL_REVIEWS],
    draft: true,
    reopen: true,
    updateBranch: false,
    rebaseBranch: false,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: false,
  },
  gitcafe: {
    commentEditing: ["conversation"],
    viewedFiles: "host",
    mergeMethods: [...ALL_MERGES],
    reviewDecisions: [...ALL_REVIEWS],
    draft: true,
    reopen: true,
    updateBranch: false,
    rebaseBranch: false,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: false,
  },
};

interface HostLogin {
  forge: ForgeKind;
  host: string;
  sshHost?: string;
  login?: string;
  token?: string;
  active?: boolean;
  keyring?: boolean;
}
export interface ForgeConnection {
  source: ForgeRepository;
  api?: ForgeApi;
}

function knownForge(host: string): ForgeKind | undefined {
  const name = new URL(host).hostname;
  if (name === "github.com" || name.endsWith(".ghe.com")) return "github";
  if (name === "gitlab.com") return "gitlab";
  if (name === "codeberg.org") return "forgejo";
  if (name === "gitea.com") return "gitea";
  if (name === "bitbucket.org") return "bitbucket";
  if (name === "dev.azure.com" || name.endsWith(".visualstudio.com")) return "azure-devops";
  if (name === "git.cafe" || name === "staging.git.cafe") return "gitcafe";
  return undefined;
}

function loginConfig(text: string) {
  try {
    return object(parseYaml(text));
  } catch {
    throw new Error(msg("forge.configUnreadable"));
  }
}

export class ForgeConnections {
  constructor(private readonly runtime: ForgeRuntime) {}

  async resolve(
    location: ProjectLocation,
    account?: ForgeAccountRef,
  ): Promise<ForgeConnection | null> {
    let output: string;
    try {
      output = await this.runtime.run(location, "git", ["remote", "-v"]);
    } catch {
      return null;
    }
    const remotes = output.split(/\r?\n/).flatMap((line) => {
      const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line);
      const parsed = match ? parseForgeRemote(match[2]!, match[1]!) : null;
      return parsed ? [parsed] : [];
    });
    if (!remotes.length) return null;
    let upstream: string | undefined;
    try {
      upstream = (
        await this.runtime.run(location, "git", [
          "rev-parse",
          "--abbrev-ref",
          "--symbolic-full-name",
          "@{upstream}",
        ])
      )
        .trim()
        .split("/")[0];
    } catch {
      /* New branches have no upstream. */
    }
    const selected =
      remotes.find((r) => r.remote === upstream) ??
      remotes.find((r) => r.remote === "origin") ??
      (remotes.length === 1 ? remotes[0] : undefined);
    if (!selected) throw new Error(msg("forge.remotesAmbiguous"));
    const env = await this.runtime.environment(location);
    const logins = await this.logins(location, env);
    const requestedHost = account ? normalizeForgeHost(account.host) : undefined;
    const matchHost = (login: { host: string; sshHost?: string }) => {
      const url = new URL(login.host),
        base = url.pathname.replace(/^\/+|\/+$/g, "");
      return (
        (url.origin === selected.host && (!base || selected.path.startsWith(`${base}/`))) ||
        login.sshHost === new URL(selected.host).hostname
      );
    };
    const matching = logins.filter(matchHost).sort((a, b) => b.host.length - a.host.length);
    const explicit = requestedHost ? { host: requestedHost, forge: account!.forge } : undefined;
    if (
      explicit &&
      !matchHost(explicit) &&
      explicit.host !== selected.host &&
      !matching.some((l) => l.host === explicit.host && l.forge === explicit.forge) &&
      !(explicit.forge === "github" && !knownForge(selected.host))
    )
      throw new Error(msg("forge.hostMismatch"));
    const login = explicit ?? matching[0];
    const host = login?.host ?? selected.host;
    const subpath = new URL(host).pathname.replace(/^\/+|\/+$/g, "");
    const path =
      subpath && selected.path.startsWith(`${subpath}/`)
        ? selected.path.slice(subpath.length + 1)
        : selected.path;
    const forge = login?.forge ?? knownForge(host) ?? "github";
    if (account && knownForge(host) && knownForge(host) !== forge)
      throw new Error(msg("forge.hostMismatch"));
    const source: ForgeRepository = {
      forge,
      host,
      repository: path,
      remote: selected.remote,
      capabilities: { ...structuredClone(FORGE_CAPABILITIES[forge]), reviewGuides: true },
      ...(account ? { account } : {}),
    };
    source.capabilities.autoFix = false;
    if (source.remote === "origin") {
      try {
        // Git expands pushurl and pushInsteadOf here; the fetch URL cannot prove
        // where a fix agent's `git push origin` would publish its changes.
        const pushUrls = (
          await this.runtime.run(location, "git", [
            "remote",
            "get-url",
            "--push",
            "--all",
            "origin",
          ])
        )
          .trim()
          .split(/\r?\n/)
          .filter(Boolean);
        const deployment = new URL(host);
        source.capabilities.autoFix =
          pushUrls.length > 0 &&
          pushUrls.every((url) => {
            const push = parseForgeRemote(url, "origin");
            if (!push) return false;
            const direct =
              push.host === host ||
              (push.host === deployment.origin &&
                (!subpath || push.path.startsWith(`${subpath}/`)));
            const ssh = url.startsWith("ssh://") || !url.includes("://");
            const alias =
              ssh &&
              logins.some(
                (entry) =>
                  entry.forge === forge &&
                  entry.host === host &&
                  entry.sshHost === new URL(push.host).hostname,
              );
            const repository =
              subpath && push.path.startsWith(`${subpath}/`)
                ? push.path.slice(subpath.length + 1)
                : push.path;
            return (
              (direct || alias) &&
              (forge === "github"
                ? repository.toLowerCase() === source.repository.toLowerCase()
                : repository === source.repository)
            );
          });
      } catch {
        // Read-only review remains available when the push target cannot be proved.
      }
    }
    if (forge === "github") return { source };
    if (forge !== "gitlab" && forge !== "azure-devops" && path.split("/").length !== 2)
      throw new Error(msg("forge.responseInvalid"));
    const header = this.environmentCredential(forge, host, env);
    let headers: Record<string, string> = header ? { Authorization: header } : {};
    const send = this.runtime.http(location);
    if (!header && (forge === "gitea" || forge === "forgejo")) {
      const candidates = matching.filter(
        (l) => l.token && l.host === host && (!account || l.login === account.login),
      );
      const chosen =
        candidates.find((l) => l.active) ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (!chosen) throw new Error(msg("forge.credentials"));
      headers = { Authorization: `token ${chosen.token}` };
    } else if (!header && forge === "gitlab") {
      const stored = matching.find(
        (l) => l.forge === "gitlab" && l.host === host && (l.token || l.keyring),
      );
      if (!stored) throw new Error(msg("forge.credentials"));
      const token =
        stored?.token && !stored.keyring
          ? stored.token
          : await this.runtime.temporary(
              location,
              {
                "config.yml": JSON.stringify({
                  hosts: {
                    [new URL(host).host]: {
                      use_keyring: true,
                      ...(stored?.token ? { token: stored.token } : {}),
                    },
                  },
                }),
              },
              async (dir) => {
                const isolatedLocation =
                  location.kind === "wsl"
                    ? { ...location, linuxPath: dir }
                    : { ...location, path: dir };
                return (
                  await this.runtime.run(
                    isolatedLocation,
                    "glab",
                    ["config", "get", "token", "--host", new URL(host).host],
                    {
                      GLAB_CONFIG_DIR: dir,
                      GITLAB_TOKEN: "",
                      GITLAB_ACCESS_TOKEN: "",
                      GLAB_TOKEN: "",
                      OAUTH_TOKEN: "",
                      CI_JOB_TOKEN: "",
                      GIT_DIR: "",
                      GIT_WORK_TREE: "",
                      GLAB_REPO: "",
                    },
                  )
                ).trim();
              },
            );
      if (!token) throw new Error(msg("forge.credentials"));
      headers = { Authorization: `Bearer ${token}` };
    } else if (!header && forge === "gitcafe") {
      // Cafe's keyring is indexed by hostname; public login metadata must
      // identify this exact deployment before its credential may be used.
      const authFile =
        env.CAFE_AUTH_FILE || runtimeConfigPath({ ...env, APPDATA: "" }, "gitcafe", "cafe.json");
      const stored = await this.runtime.read(location, authFile);
      let metadata: Record<string, unknown> = {};
      try {
        const config = object(JSON.parse(stored || "{}"));
        if (config.version === 1) metadata = object(object(config.hosts)[new URL(host).host]);
      } catch {
        throw new Error(msg("forge.credentials"));
      }
      const apiUrl = str(metadata.apiUrl);
      if (!apiUrl || normalizeForgeHost(apiUrl.replace(/\/api\/?$/, "")) !== host)
        throw new Error(msg("forge.credentials"));
      const credentialOutput = await this.runtime.temporary(
        location,
        {
          "cafe.json": JSON.stringify({
            version: 1,
            hosts: {
              [new URL(host).host]: {
                apiUrl,
                ...(str(metadata.username) ? { username: str(metadata.username) } : {}),
                ...(metadata.expiresAt === undefined ? {} : { expiresAt: metadata.expiresAt }),
              },
            },
          }),
        },
        (dir) =>
          this.runtime.run(
            location,
            "cafe",
            [
              "auth",
              "http",
              "credential",
              "get",
              "--host",
              `${host}/api`,
              "--no-input",
              "--no-update-check",
            ],
            {
              CAFE_AUTH_FILE: `${dir}/cafe.json`,
              CAFE_TOKEN: "",
              CAFE_GIT_HOST: new URL(host).host,
            },
            false,
            `protocol=https\nhost=${new URL(host).host}\n\n`,
          ),
      );
      const token = /^password=(.+)$/m.exec(credentialOutput)?.[1]?.trim();
      if (!token) throw new Error(msg("forge.credentials"));
      headers = { Authorization: `Bearer ${token}` };
    } else if (!header && forge === "azure-devops") {
      if (knownForge(host) !== "azure-devops") throw new Error(msg("forge.credentials"));
      const token = object(
        JSON.parse(
          await this.runtime.run(location, "az", [
            "account",
            "get-access-token",
            "--resource",
            "499b84ac-1321-427f-aa17-267ca6975798",
            "--output",
            "json",
          ]),
        ),
      );
      if (!str(token.accessToken)) throw new Error(msg("forge.credentials"));
      headers = { Authorization: `Bearer ${str(token.accessToken)}` };
    } else if (!header) throw new Error(msg("forge.credentials"));
    const root =
      forge === "gitlab"
        ? `${host}/api/v4`
        : forge === "gitea" || forge === "forgejo"
          ? `${host}/api/v1`
          : forge === "bitbucket"
            ? "https://api.bitbucket.org/2.0"
            : forge === "gitcafe"
              ? `${host}/api`
              : host;
    const api = new ForgeApi(root, headers, send);
    const viewer =
      forge === "gitcafe"
        ? await api.json("auth/principal")
        : forge === "azure-devops"
          ? object(
              (await api.json("_apis/connectionData?api-version=7.1-preview.1")).authenticatedUser,
            )
          : await api.json("user");
    const identity =
      (forge === "azure-devops" ? str(viewer.id) : "") ||
      str(viewer.username) ||
      str(viewer.login) ||
      str(viewer.handle) ||
      str(viewer.uniqueName) ||
      str(viewer.uuid) ||
      str(viewer.id);
    if (!identity || (account && identity !== account.login))
      throw new Error(msg("forge.accountMismatch"));
    source.account = { forge, host, login: identity };
    return { source, api };
  }

  private environmentCredential(
    forge: ForgeKind,
    host: string,
    env: Record<string, string>,
  ): string | undefined {
    const scoped = (value: string | undefined, configured: string | undefined, fallback: string) =>
      value && normalizeForgeHost(configured || fallback) === host ? value : undefined;
    let token: string | undefined;
    if (forge === "gitlab")
      token = scoped(
        env.GITLAB_TOKEN || env.GITLAB_ACCESS_TOKEN || env.GLAB_TOKEN,
        `${(env.GITLAB_HOST || env.GITLAB_URI || "https://gitlab.com").replace(/\/+$/, "")}${env.GITLAB_SUBFOLDER ? `/${env.GITLAB_SUBFOLDER.replace(/^\/+|\/+$/g, "")}` : ""}`,
        "https://gitlab.com",
      );
    if (forge === "forgejo")
      token = scoped(env.FORGEJO_TOKEN, env.FORGEJO_HOST, "https://codeberg.org");
    if (forge === "gitea") token = scoped(env.GITEA_TOKEN, env.GITEA_HOST, "https://gitea.com");
    if (forge === "gitcafe")
      token = scoped(env.CAFE_TOKEN, env.CAFE_HOST?.replace(/\/api\/?$/, ""), "https://git.cafe");
    if (forge === "bitbucket" && host === "https://bitbucket.org") {
      if (env.BITBUCKET_ACCESS_TOKEN) return `Bearer ${env.BITBUCKET_ACCESS_TOKEN}`;
      if (env.BITBUCKET_EMAIL && env.BITBUCKET_API_TOKEN)
        return `Basic ${Buffer.from(`${env.BITBUCKET_EMAIL}:${env.BITBUCKET_API_TOKEN}`).toString("base64")}`;
    }
    if (forge === "azure-devops") {
      token = env.AZURE_DEVOPS_ORG_SERVICE_URL
        ? scoped(env.AZURE_DEVOPS_EXT_PAT, env.AZURE_DEVOPS_ORG_SERVICE_URL, host)
        : undefined;
      if (token) return `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
    }
    return token ? `Bearer ${token}` : undefined;
  }

  private async logins(
    location: ProjectLocation,
    env: Record<string, string>,
  ): Promise<HostLogin[]> {
    const result: HostLogin[] = [];
    for (const [forge, key] of [
      ["gitlab", "GITLAB_HOST"],
      ["forgejo", "FORGEJO_HOST"],
      ["gitea", "GITEA_HOST"],
      ["gitcafe", "CAFE_HOST"],
    ] as const) {
      const configuredHost = env[key] || (forge === "gitlab" ? env.GITLAB_URI : undefined);
      if (configuredHost)
        result.push({
          forge,
          host: normalizeForgeHost(
            `${configuredHost.replace(/\/api\/?$/, "").replace(/\/+$/, "")}${forge === "gitlab" && env.GITLAB_SUBFOLDER ? `/${env.GITLAB_SUBFOLDER.replace(/^\/+|\/+$/g, "")}` : ""}`,
          ),
        });
    }
    const teaPath = env.TEA_CONFIG || runtimeConfigPath(env, "tea", "config.yml");
    const tea = await this.runtime.read(location, teaPath);
    if (tea)
      for (const item of rows(loginConfig(tea).logins)) {
        if (!str(item.url)) continue;
        const host = normalizeForgeHost(str(item.url));
        result.push({
          forge: knownForge(host) === "forgejo" ? "forgejo" : "gitea",
          host,
          login: str(item.user),
          token: str(item.token),
          active: item.default === true,
          ...(str(item.ssh_host) ? { sshHost: str(item.ssh_host) } : {}),
        });
      }
    let glabPath = env.GLAB_CONFIG_DIR ? `${env.GLAB_CONFIG_DIR}/config.yml` : "";
    if (!glabPath) {
      try {
        glabPath = (await this.runtime.run(location, "glab", ["config", "path"])).trim();
      } catch {
        /* glab is optional for other forges. */
      }
    }
    const glab = glabPath ? await this.runtime.read(location, glabPath) : null;
    if (glab)
      for (const [hostname, raw] of Object.entries(object(loginConfig(glab).hosts))) {
        const config = object(raw);
        const base = str(config.subfolder).replace(/^\/+|\/+$/g, "");
        result.push({
          forge: "gitlab",
          host: normalizeForgeHost(`https://${hostname}${base ? `/${base}` : ""}`),
          ...(str(config.token) ? { token: str(config.token) } : {}),
          keyring: config.use_keyring === true || config.use_keyring === "true",
          ...(str(config.ssh_host) ? { sshHost: str(config.ssh_host) } : {}),
        });
      }
    return result;
  }
}
