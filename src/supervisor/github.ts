import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type ProjectLocation,
  type PrCheck,
  type PrComment,
  type PrData,
  type PrFile,
  type PrReviewDecision,
  type CloneRepoResult,
  type GhCheckAvailableResult,
  type GhGetPrChecksResult,
  type GhGetPrDetailsResult,
  type GhGetPrFilesResult,
  type GhGetPrDiffResult,
  type GhListAccountsResult,
  type GhListPullRequestsResult,
  type GhListReposResult,
  type GitHubAccountRef,
  type GitHubRepoSummary,
} from "@/shared/contracts";
import {
  mapGitHubApiRepo,
  mapPrData,
  mapPrDetails,
  mapPullRequestSummary,
  parseGhAuthAccounts,
} from "./githubMappers";

// Re-export the pure mappers previously defined inline here so the module's
// public surface stays identical for github.test.ts and bridge consumers.
export { aggregateChecksStatus, mapGitHubApiRepo, parseGhAuthAccounts } from "./githubMappers";
import { buildAgentCommand } from "./agents/base";
import { resolveClonedProjectPath } from "./git/exec";
import type { WslBridgeClient, WslProcessExecResult } from "./wsl/bridge/client";

const execFileAsync = promisify(execFile);
const GH_TIMEOUT = 30_000;
// Cloning can pull a lot of history; give it room before timing out.
const GH_CLONE_TIMEOUT = 600_000;
// Repos per page and the page cap for the picker. The list is sorted by most
// recent push, so the first few hundred cover the realistic clone targets; the
// renderer adds client-side search over whatever we return.
const GH_REPO_PAGE_SIZE = 100;
const GH_REPO_MAX_PAGES = 5;
const PULL_REQUEST_LIST_LIMIT = 1_000;
const CREATE_PR_STATUS_WAIT_MS = 15_000;
const CREATE_PR_STATUS_POLL_MS = 5_000;
const PR_VIEW_FIELDS =
  "number,url,state,title,baseRefName,isDraft,reviewDecision,statusCheckRollup,updatedAt,mergeable,mergeStateStatus,author";
// Bulk list: adds `headRefName` (to key per branch) and drops `author` (the icon
// doesn't need viewerDidAuthor, so we skip the extra `gh api user` lookup).
const PR_LIST_FIELDS =
  "number,headRefName,url,state,title,baseRefName,isDraft,reviewDecision,statusCheckRollup,updatedAt,mergeable,mergeStateStatus";
const PULL_REQUEST_LIST_FIELDS = `${PR_LIST_FIELDS},author,additions,deletions,reviewRequests`;

function selectLatestPr(items: unknown[]): Record<string, unknown> | null {
  return items.reduce<Record<string, unknown> | null>((latest, item) => {
    if (!item || typeof item !== "object") return latest;
    const pr = item as Record<string, unknown>;
    const number = typeof pr.number === "number" ? pr.number : 0;
    const latestNumber = typeof latest?.number === "number" ? latest.number : 0;
    return number > latestNumber ? pr : latest;
  }, null);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `gh` reports an unreachable remote with the GraphQL message
// "Could not resolve to a Repository with the name '<owner>/<name>'". This
// happens when the git remote points at a repo that doesn't exist on GitHub
// or that the authenticated user can't see (renamed, private, transferred).
// Polling endpoints treat this as "no PR" so the UI doesn't surface a toast
// on every branch change.
function isRepoNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("could not resolve to a repository") ||
    lower.includes("no such repository") ||
    lower.includes("repository not found")
  );
}

function isNoGitHubRepositoryError(error: unknown): boolean {
  if (isRepoNotFoundError(error)) return true;
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("not a git repository") ||
    lower.includes("no git remotes") ||
    lower.includes("none of the git remotes") ||
    lower.includes("unable to determine current repository")
  );
}

function classifyError(error: unknown, operation: string): Error {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (
    lower.includes("command not found") ||
    lower.includes("is not recognized") ||
    lower.includes("enoent")
  ) {
    return new Error(
      `GitHub CLI (gh) is not installed or not on PATH. Install it from https://cli.github.com`,
    );
  }

  if (
    lower.includes("authentication failed") ||
    lower.includes("not logged in") ||
    lower.includes("gh auth login") ||
    lower.includes("no oauth token")
  ) {
    return new Error(`GitHub CLI is not authenticated. Run "gh auth login" in the terminal.`);
  }

  return new Error(`gh ${operation} failed: ${msg}`);
}

interface RunGhOptions {
  /** Extra env (e.g. `GH_TOKEN`) merged into the gh invocation. */
  env?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * `gh` gives GH_REPO precedence over the repository at cwd. Project-scoped
 * operations must never inherit that process-wide override, or a command can
 * be sent to an unrelated repository.
 */
function projectGhEnvironment(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  delete env.GH_REPO;
  return env;
}

async function runGh(
  location: ProjectLocation,
  args: string[],
  wslClient: WslBridgeClient | undefined,
  options?: RunGhOptions,
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? GH_TIMEOUT;
  if (location.kind === "wsl") {
    if (!wslClient) {
      throw new Error(`WSL bridge unavailable for GitHub CLI in distro "${location.distro}"`);
    }
    const result = await wslClient.processExec(location, {
      command: "gh",
      cwd: location.linuxPath,
      args,
      loginEnv: true,
      timeoutMs,
      // The bridge cannot delete a forwarded variable, so explicitly clear it
      // inside the WSL process. Local invocations remove it below.
      env: { ...options?.env, GH_REPO: "" },
    });
    if (result.ok) return result.stdout;
    throw processResultToError(result);
  }

  const spec = buildAgentCommand(location, "gh", args, undefined, options?.env);
  const cwd = spec.cwd ?? location.path;
  const { stdout } = await execFileAsync(spec.command, spec.args, {
    windowsHide: true,
    timeout: timeoutMs,
    ...(cwd ? { cwd } : {}),
    env: projectGhEnvironment({ ...spec.env, ...options?.env }),
  });
  return stdout;
}

async function runGhBatch(
  location: ProjectLocation & { kind: "wsl" },
  commands: string[][],
  wslClient: WslBridgeClient | undefined,
): Promise<WslProcessExecResult[]> {
  if (!wslClient) {
    throw new Error(`WSL bridge unavailable for GitHub CLI in distro "${location.distro}"`);
  }
  const result = await wslClient.processBatch(location, {
    timeoutMs: GH_TIMEOUT,
    commands: commands.map((args) => ({
      command: "gh",
      cwd: location.linuxPath,
      args,
      loginEnv: true,
      // Keep batched read calls scoped to the project just like processExec.
      env: { GH_REPO: "" },
    })),
  });
  return result.results;
}

function processResultToError(result: WslProcessExecResult): Error {
  const error = new Error(
    result.error || result.stderr || `process exited ${result.exitCode}`,
  ) as Error & { stdout?: string; stderr?: string; code?: number; signal?: string };
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  error.code = result.exitCode;
  if (result.signal) error.signal = result.signal;
  return error;
}

async function createGhBodyFile(
  location: ProjectLocation,
  prefix: string,
  body: string,
  wslClient?: WslBridgeClient,
): Promise<{ cliPath: string; cleanup(): Promise<void> }> {
  if (location.kind === "wsl") {
    if (!wslClient) {
      throw new Error(`WSL bridge unavailable for GitHub CLI in distro "${location.distro}"`);
    }
    const tmpLocation = { ...location, linuxPath: "/tmp" };
    const dirResult = await wslClient.processExec(tmpLocation, {
      command: "mktemp",
      cwd: "/tmp",
      args: ["-d", `/tmp/${prefix}-XXXXXX`],
      loginEnv: true,
      timeoutMs: GH_TIMEOUT,
    });
    if (!dirResult.ok) throw processResultToError(dirResult);
    const dir = dirResult.stdout.trim();
    const cliPath = `${dir}/body.md`;
    await wslClient.writeNewFile(tmpLocation, cliPath, Buffer.from(body, "utf8"));
    return {
      cliPath,
      cleanup: () => wslClient.rm(tmpLocation, dir, { recursive: true, force: true }),
    };
  }

  const dirPrefix = join(tmpdir(), `${prefix}-`);
  const dir = await mkdtemp(dirPrefix);
  const filename = "body.md";
  const writePath = join(dir, filename);
  const cliPath = writePath;
  await writeFile(writePath, body, { encoding: "utf-8", flag: "wx" });
  return {
    cliPath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** Read `stdout` off a child-process / bridge error, if present. */
function extractStdout(error: unknown): string {
  if (error && typeof error === "object" && "stdout" in error) {
    const value = (error as { stdout: unknown }).stdout;
    if (typeof value === "string") return value;
  }
  return "";
}

/** Stable cache key for {@link GitHubService.viewerLoginCache}. */
function locationKey(location: ProjectLocation): string {
  if (location.kind === "wsl") return `wsl:${location.distro}:${location.linuxPath}`;
  return `${location.kind}:${location.path}`;
}

export class GitHubService {
  /** `gh api user` is the same answer per (kind, path) — cache to avoid one call per PR fetch. */
  private viewerLoginCache = new Map<string, string | null>();
  private wslClient: WslBridgeClient | undefined;

  setWslClient(client: WslBridgeClient | undefined): void {
    this.wslClient = client;
  }

  private runGh(
    location: ProjectLocation,
    args: string[],
    options?: RunGhOptions,
  ): Promise<string> {
    return runGh(location, args, this.wslClient, options);
  }

  private runGhBatch(
    location: ProjectLocation & { kind: "wsl" },
    commands: string[][],
  ): Promise<WslProcessExecResult[]> {
    return runGhBatch(location, commands, this.wslClient);
  }

  async checkGhAvailable(location: ProjectLocation): Promise<GhCheckAvailableResult> {
    try {
      await this.runGh(location, ["--version"]);
      return { available: true };
    } catch {
      return { available: false };
    }
  }

  /**
   * List the accounts `gh` is signed in to. Returns an empty list (rather than
   * throwing) when gh is missing or signed out, so the picker can degrade to a
   * "sign in / paste a URL" state. gh exits non-zero when any account's token
   * is invalid yet still prints the others to stdout, so we parse that too.
   */
  async listAccounts(location: ProjectLocation): Promise<GhListAccountsResult> {
    try {
      const stdout = await this.runGh(location, ["auth", "status"]);
      return { accounts: parseGhAuthAccounts(stdout) };
    } catch (err) {
      return { accounts: parseGhAuthAccounts(extractStdout(err)) };
    }
  }

  /**
   * Resolve the stored token for a specific account so we can scope gh to it
   * (every account listed by `gh auth status` has a retrievable token). Throws a
   * clear error rather than returning undefined, so callers never silently fall
   * back to gh's *active* account — which would list/clone the wrong account.
   */
  private async getAccountToken(
    location: ProjectLocation,
    account: GitHubAccountRef,
  ): Promise<string> {
    let token = "";
    try {
      const stdout = await this.runGh(location, [
        "auth",
        "token",
        "--hostname",
        account.host,
        "--user",
        account.login,
      ]);
      token = stdout.trim();
    } catch {
      token = "";
    }
    if (!token) {
      throw new Error(
        `Couldn't access the GitHub account "${account.login}". Run "gh auth login" and try again.`,
      );
    }
    return token;
  }

  /**
   * List repositories the given account can clone — its own plus org repos —
   * most-recently-pushed first. Runs `gh api user/repos` scoped to the account's
   * token (via `GH_TOKEN`) so it works for accounts that aren't gh's active one,
   * without mutating the user's active account.
   */
  async listRepos(
    location: ProjectLocation,
    account: GitHubAccountRef,
  ): Promise<GhListReposResult> {
    const token = await this.getAccountToken(location, account);
    const env = { GH_TOKEN: token };
    try {
      const repos: GitHubRepoSummary[] = [];
      const seen = new Set<string>();
      for (let page = 1; page <= GH_REPO_MAX_PAGES; page++) {
        const path =
          `user/repos?per_page=${GH_REPO_PAGE_SIZE}` +
          `&affiliation=owner,collaborator,organization_member&sort=pushed&page=${page}`;
        const stdout = await this.runGh(location, ["api", path], { env });
        const items = JSON.parse(stdout);
        if (!Array.isArray(items) || items.length === 0) break;
        for (const item of items) {
          const repo = mapGitHubApiRepo(item);
          if (repo && !seen.has(repo.nameWithOwner)) {
            seen.add(repo.nameWithOwner);
            repos.push(repo);
          }
        }
        if (items.length < GH_REPO_PAGE_SIZE) break;
      }
      return { repos };
    } catch (err) {
      throw classifyError(err, "repo list");
    }
  }

  /** Clone a `gh`-browsed repository into `parent/name`, scoped to its account. */
  async cloneRepo(
    parent: ProjectLocation,
    name: string,
    nameWithOwner: string,
    account: GitHubAccountRef,
  ): Promise<CloneRepoResult> {
    const token = await this.getAccountToken(parent, account);
    try {
      await this.runGh(parent, ["repo", "clone", nameWithOwner, name], {
        timeoutMs: GH_CLONE_TIMEOUT,
        env: { GH_TOKEN: token },
      });
      return { path: resolveClonedProjectPath(parent, name) };
    } catch (err) {
      throw classifyError(err, "repo clone");
    }
  }

  private async getViewerLogin(
    location: ProjectLocation,
    forceRefresh = false,
  ): Promise<string | undefined> {
    const key = locationKey(location);
    if (!forceRefresh) {
      const cached = this.viewerLoginCache.get(key);
      if (cached !== undefined) return cached ?? undefined;
    }
    try {
      const stdout = await this.runGh(location, ["api", "user", "--jq", ".login"]);
      const login = stdout.trim();
      this.viewerLoginCache.set(key, login || null);
      return login || undefined;
    } catch {
      this.viewerLoginCache.set(key, null);
      return undefined;
    }
  }

  private async viewPrData(
    location: ProjectLocation,
    branch: string,
    viewerLogin?: string,
  ): Promise<PrData> {
    const stdout = await this.runGh(location, ["pr", "view", branch, "--json", PR_VIEW_FIELDS]);
    return mapPrData(JSON.parse(stdout), viewerLogin);
  }

  private async waitForCreatedPrStatus(
    location: ProjectLocation,
    branch: string,
    viewerLogin?: string,
  ): Promise<PrData> {
    const deadline = Date.now() + CREATE_PR_STATUS_WAIT_MS;
    let latest = await this.viewPrData(location, branch, viewerLogin);
    while (
      !latest.isDraft &&
      latest.state === "open" &&
      latest.checksStatus !== "PENDING" &&
      latest.checksStatus !== "FAILURE" &&
      Date.now() < deadline
    ) {
      await delay(CREATE_PR_STATUS_POLL_MS);
      latest = await this.viewPrData(location, branch, viewerLogin);
    }
    if (!latest.isDraft && latest.state === "open" && !latest.checksStatus) {
      return { ...latest, checksStatus: "PENDING" };
    }
    return latest;
  }

  async createPr(
    location: ProjectLocation,
    branch: string,
    baseBranch: string,
    title: string,
    body: string,
    isDraft: boolean,
  ): Promise<PrData> {
    const tempFile = await createGhBodyFile(location, "poracode-pr-body", body, this.wslClient);
    try {
      const createArgs = [
        "pr",
        "create",
        "--base",
        baseBranch,
        "--head",
        branch,
        "--title",
        title,
        "--body-file",
        tempFile.cliPath,
        ...(isDraft ? ["--draft"] : []),
      ];
      await this.runGh(location, createArgs);

      // `gh pr create` doesn't support --json. GitHub can briefly return an
      // empty or incomplete statusCheckRollup before Actions queues checks, so
      // wait briefly before handing the new PR to the renderer.
      const viewerLogin = await this.getViewerLogin(location);
      return await this.waitForCreatedPrStatus(location, branch, viewerLogin);
    } catch (err) {
      throw classifyError(err, "pr create");
    } finally {
      await tempFile.cleanup().catch(() => {});
    }
  }

  async getPrForBranch(location: ProjectLocation, branch: string): Promise<PrData | null> {
    const prListArgs = [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "all",
      "--limit",
      "20",
      "--json",
      PR_VIEW_FIELDS,
    ];

    // WSL: collapse `gh pr list` + `gh api user` (for viewerDidAuthor) into one
    // bridge batch running inside the distro.
    if (location.kind === "wsl") {
      const cachedLogin = this.viewerLoginCache.get(locationKey(location));
      const needsLogin = cachedLogin === undefined;
      const commands = [prListArgs, ...(needsLogin ? [["api", "user", "--jq", ".login"]] : [])];
      try {
        const results = await this.runGhBatch(location, commands);
        const prResult = results[0]!;
        if (!prResult.ok) {
          throw new Error(`gh pr list exited ${prResult.exitCode}`);
        }
        let viewerLogin: string | undefined;
        if (needsLogin && results[1]?.ok) {
          viewerLogin = results[1].stdout.trim() || undefined;
          this.viewerLoginCache.set(locationKey(location), viewerLogin ?? null);
        } else if (cachedLogin) {
          viewerLogin = cachedLogin;
        }
        const items = JSON.parse(prResult.stdout);
        if (!Array.isArray(items) || items.length === 0) return null;
        const latest = selectLatestPr(items);
        return latest ? mapPrData(latest, viewerLogin) : null;
      } catch (err) {
        throw classifyError(err, "pr list");
      }
    }

    // Non-WSL: per-call spawn overhead is negligible — keep simple Promise.all.
    try {
      const [stdout, viewerLogin] = await Promise.all([
        this.runGh(location, prListArgs),
        this.getViewerLogin(location),
      ]);
      const items = JSON.parse(stdout);
      if (!Array.isArray(items) || items.length === 0) return null;
      const latest = selectLatestPr(items);
      return latest ? mapPrData(latest, viewerLogin) : null;
    } catch (err) {
      if (isRepoNotFoundError(err)) return null;
      throw classifyError(err, "pr list");
    }
  }

  /**
   * List every PR in the repo in a single `gh` call, keyed by head branch name
   * (latest PR per branch). Powers PR-status icons for all branches in the
   * branch selector without a per-branch fetch.
   */
  async listPrs(location: ProjectLocation): Promise<Record<string, PrData>> {
    const args = ["pr", "list", "--state", "all", "--limit", "100", "--json", PR_LIST_FIELDS];
    try {
      const stdout = await this.runGh(location, args);
      const items = JSON.parse(stdout);
      if (!Array.isArray(items)) return {};
      // Group PRs by head branch, then reuse the single-branch "highest PR number
      // wins" rule (selectLatestPr) to pick one per branch.
      const byBranch = new Map<string, unknown[]>();
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const branch = (item as Record<string, unknown>).headRefName;
        if (typeof branch !== "string" || !branch) continue;
        const group = byBranch.get(branch);
        if (group) group.push(item);
        else byBranch.set(branch, [item]);
      }
      const result: Record<string, PrData> = {};
      for (const [branch, group] of byBranch) {
        const latest = selectLatestPr(group);
        if (latest) result[branch] = mapPrData(latest);
      }
      return result;
    } catch (err) {
      if (isRepoNotFoundError(err)) return {};
      throw classifyError(err, "pr list");
    }
  }

  /** List open PRs with viewer-specific metadata for the global Pull Requests page. */
  async listPullRequests(location: ProjectLocation): Promise<GhListPullRequestsResult> {
    const args = [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      String(PULL_REQUEST_LIST_LIMIT),
      "--json",
      PULL_REQUEST_LIST_FIELDS,
    ];

    try {
      let stdout: string;
      let viewerLogin: string | undefined;

      if (location.kind === "wsl") {
        const key = locationKey(location);
        const results = await this.runGhBatch(location, [args, ["api", "user", "--jq", ".login"]]);
        const listResult = results[0]!;
        if (!listResult.ok) throw processResultToError(listResult);
        stdout = listResult.stdout;
        viewerLogin = results[1]?.ok ? results[1].stdout.trim() || undefined : undefined;
        this.viewerLoginCache.set(key, viewerLogin ?? null);
      } else {
        [stdout, viewerLogin] = await Promise.all([
          this.runGh(location, args),
          this.getViewerLogin(location, true),
        ]);
      }

      const items = JSON.parse(stdout);
      const pullRequests = Array.isArray(items)
        ? items
            .filter((item): item is Record<string, unknown> =>
              Boolean(item && typeof item === "object"),
            )
            .map((item) => mapPullRequestSummary(item, viewerLogin))
        : [];
      return {
        pullRequests,
        ...(viewerLogin ? { viewerLogin } : {}),
      };
    } catch (err) {
      if (isNoGitHubRepositoryError(err)) return { pullRequests: [] };
      throw classifyError(err, "pr list");
    }
  }

  async mergePr(
    location: ProjectLocation,
    prNumber: number,
    method: "merge" | "squash" | "rebase",
    admin = false,
  ): Promise<void> {
    try {
      const args = ["pr", "merge", String(prNumber), `--${method}`];
      if (admin) args.push("--admin");
      await this.runGh(location, args);
    } catch (err) {
      throw classifyError(err, "pr merge");
    }
  }

  async closePr(location: ProjectLocation, prNumber: number): Promise<void> {
    try {
      await this.runGh(location, ["pr", "close", String(prNumber)]);
    } catch (err) {
      throw classifyError(err, "pr close");
    }
  }

  async reopenPr(location: ProjectLocation, prNumber: number): Promise<void> {
    try {
      await this.runGh(location, ["pr", "reopen", String(prNumber)]);
    } catch (err) {
      throw classifyError(err, "pr reopen");
    }
  }

  async markPrReady(location: ProjectLocation, prNumber: number): Promise<void> {
    try {
      await this.runGh(location, ["pr", "ready", String(prNumber)]);
    } catch (err) {
      throw classifyError(err, "pr ready");
    }
  }

  /** `gh pr update-branch <n>` — merge (or rebase) the base branch into the PR branch. */
  async updatePrBranch(location: ProjectLocation, prNumber: number, rebase = false): Promise<void> {
    try {
      const args = ["pr", "update-branch", String(prNumber)];
      if (rebase) args.push("--rebase");
      await this.runGh(location, args);
    } catch (err) {
      throw classifyError(err, "pr update-branch");
    }
  }

  async getPrChecks(location: ProjectLocation, branch: string): Promise<GhGetPrChecksResult> {
    try {
      const stdout = await this.runGh(location, [
        "pr",
        "checks",
        branch,
        "--json",
        "name,state,conclusion",
      ]);
      const items = JSON.parse(stdout);
      const checks: PrCheck[] = Array.isArray(items)
        ? items.map((c: Record<string, string>) => ({
            name: c.name ?? "",
            state: c.state ?? "",
            conclusion: c.conclusion ?? "",
          }))
        : [];
      return { checks };
    } catch (err) {
      throw classifyError(err, "pr checks");
    }
  }

  async getPrFiles(location: ProjectLocation, prNumber: number): Promise<GhGetPrFilesResult> {
    try {
      const stdout = await this.runGh(location, [
        "pr",
        "view",
        String(prNumber),
        "--json",
        "files",
      ]);
      const parsed = JSON.parse(stdout) as { files?: unknown };
      const raw = Array.isArray(parsed.files) ? parsed.files : [];
      const files: PrFile[] = raw.map((entry) => {
        const e = entry as Record<string, unknown>;
        return {
          path: typeof e.path === "string" ? e.path : "",
          additions: typeof e.additions === "number" ? e.additions : 0,
          deletions: typeof e.deletions === "number" ? e.deletions : 0,
        };
      });
      return { files };
    } catch (err) {
      throw classifyError(err, "pr view --json files");
    }
  }

  async getPrDiff(location: ProjectLocation, prNumber: number): Promise<GhGetPrDiffResult> {
    try {
      const stdout = await this.runGh(location, ["pr", "diff", String(prNumber)]);
      return { diff: stdout };
    } catch (err) {
      throw classifyError(err, "pr diff");
    }
  }

  async getPrDetails(location: ProjectLocation, prNumber: number): Promise<GhGetPrDetailsResult> {
    try {
      const stdout = await this.runGh(location, [
        "pr",
        "view",
        String(prNumber),
        "--json",
        [
          "number",
          "title",
          "body",
          "author",
          "baseRefName",
          "headRefName",
          "additions",
          "deletions",
          "changedFiles",
          "createdAt",
          "mergedAt",
          "mergedBy",
          "closedAt",
          "commits",
          "comments",
          "reviews",
          "statusCheckRollup",
        ].join(","),
      ]);
      const raw = JSON.parse(stdout) as Record<string, unknown>;
      return { details: mapPrDetails(raw) };
    } catch (err) {
      throw classifyError(err, "pr view --json (details)");
    }
  }

  async postPrComment(
    location: ProjectLocation,
    prNumber: number,
    body: string,
  ): Promise<PrComment> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new Error("Comment body is required.");
    }
    const tempFile = await createGhBodyFile(
      location,
      "poracode-pr-comment",
      trimmed,
      this.wslClient,
    );
    try {
      const commentArgs = ["pr", "comment", String(prNumber), "--body-file", tempFile.cliPath];
      const [stdout, viewerLogin] = await Promise.all([
        this.runGh(location, commentArgs),
        this.getViewerLogin(location),
      ]);
      // `gh pr comment` prints the URL of the new comment. Fall back to a synthesized
      // record so the renderer can append the new comment optimistically even when
      // gh's stdout shape changes between releases.
      const url = stdout.trim().split(/\s+/).pop() ?? "";
      const created: PrComment = {
        id: url || `local-${Date.now()}`,
        author: { login: viewerLogin ?? "you" },
        body: trimmed,
        createdAt: new Date().toISOString(),
        ...(url ? { url } : {}),
      };
      return created;
    } catch (err) {
      throw classifyError(err, "pr comment");
    } finally {
      await tempFile.cleanup().catch(() => {});
    }
  }

  async submitPrReview(
    location: ProjectLocation,
    prNumber: number,
    decision: PrReviewDecision,
    body: string,
  ): Promise<void> {
    const flag =
      decision === "approve"
        ? "--approve"
        : decision === "request-changes"
          ? "--request-changes"
          : "--comment";
    const trimmed = body ?? "";
    if (decision !== "approve" && trimmed.trim().length === 0) {
      throw new Error("Review body is required for comment and request-changes.");
    }

    if (trimmed.length === 0) {
      try {
        await this.runGh(location, ["pr", "review", String(prNumber), flag]);
        return;
      } catch (err) {
        throw classifyError(err, "pr review");
      }
    }

    const tempFile = await createGhBodyFile(
      location,
      "poracode-pr-review",
      trimmed,
      this.wslClient,
    );
    try {
      await this.runGh(location, [
        "pr",
        "review",
        String(prNumber),
        flag,
        "--body-file",
        tempFile.cliPath,
      ]);
    } catch (err) {
      throw classifyError(err, "pr review");
    } finally {
      await tempFile.cleanup().catch(() => {});
    }
  }
}
