import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  PR_CHECK_FAILURE_CONCLUSIONS,
  type ProjectLocation,
  type PrAuthor,
  type PrComment,
  type PrCommitSummary,
  type PrData,
  type PrDetails,
  type PrReviewState,
  type PrReviewSummary,
  type PrState,
  type PrCheck,
  type PrFile,
  type PrReviewDecision,
  type GhCheckAvailableResult,
  type GhGetPrChecksResult,
  type GhGetPrDetailsResult,
  type GhGetPrFilesResult,
  type GhGetPrDiffResult,
} from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { buildAgentCommand, parallelWslCommandsAsync, quotePosixShellArg } from "./agents/base";
import { readSshCommandOutput } from "./ssh";

const execFileAsync = promisify(execFile);
const GH_TIMEOUT = 30_000;
const CREATE_PR_STATUS_WAIT_MS = 15_000;
const CREATE_PR_STATUS_POLL_MS = 5_000;
const PR_VIEW_FIELDS =
  "number,url,state,title,baseRefName,isDraft,reviewDecision,statusCheckRollup,updatedAt,mergeable,mergeStateStatus,author";

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

async function runGh(location: ProjectLocation, args: string[]): Promise<string> {
  const spec = buildAgentCommand(location, "gh", args);
  const cwd =
    spec.cwd ??
    (location.kind === "windows" || location.kind === "posix" ? location.path : undefined);
  const { stdout } = await execFileAsync(spec.command, spec.args, {
    windowsHide: true,
    timeout: GH_TIMEOUT,
    ...(cwd ? { cwd } : {}),
    env: spec.env ? { ...process.env, ...spec.env } : process.env,
  });
  return stdout;
}

async function createGhBodyFile(
  location: ProjectLocation,
  prefix: string,
  body: string,
): Promise<{ cliPath: string; cleanup(): Promise<void> }> {
  if (location.kind === "ssh") {
    const dir = (
      await readSshCommandOutput({ ...location, path: "/" }, "mktemp", [
        "-d",
        `/tmp/${prefix}-XXXXXX`,
      ])
    ).stdout.trim();
    const filename = "body.md";
    const cliPath = `${dir}/${filename}`;
    const encoded = Buffer.from(body, "utf8").toString("base64");
    await readSshCommandOutput({ ...location, path: "/" }, "sh", [
      "-c",
      `base64 -d > "$1" <<'__LIGHTCODE_GH_BODY__'\n${encoded}\n__LIGHTCODE_GH_BODY__`,
      "sh",
      cliPath,
    ]);
    return {
      cliPath,
      cleanup: async () => {
        await readSshCommandOutput({ ...location, path: "/" }, "rm", ["-rf", "--", dir]);
      },
    };
  }

  const dirPrefix =
    location.kind === "wsl"
      ? toWslUncPath(location.distro, `/tmp/${prefix}-`)
      : join(tmpdir(), `${prefix}-`);
  const dir = await mkdtemp(dirPrefix);
  const filename = "body.md";
  const writePath = join(dir, filename);
  const cliPath = location.kind === "wsl" ? `/tmp/${basename(dir)}/${filename}` : writePath;
  await writeFile(writePath, body, { encoding: "utf-8", flag: "wx" });
  return {
    cliPath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

function mapPrState(raw: { state: string; isDraft: boolean }): PrState {
  if (raw.isDraft) return "draft";
  const s = raw.state?.toUpperCase?.() ?? "";
  if (s === "MERGED") return "merged";
  if (s === "CLOSED") return "closed";
  return "open";
}

// `gh pr {list,view} --json statusCheckRollup` returns an array of CheckRun
// (status/conclusion) and StatusContext (state) entries — not a single string.
// Aggregate so any failing check turns the PR red, even when later checks
// finish green; otherwise stay yellow until everything completes.
export function aggregateChecksStatus(rollup: unknown): string | undefined {
  if (!Array.isArray(rollup) || rollup.length === 0) return undefined;
  let hasPending = false;
  for (const entry of rollup) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const state = typeof e.state === "string" ? e.state.toUpperCase() : "";
    if (state === "ERROR" || state === "FAILURE") return "FAILURE";
    if (state === "PENDING" || state === "EXPECTED") {
      hasPending = true;
      continue;
    }
    const conclusion = typeof e.conclusion === "string" ? e.conclusion.toUpperCase() : "";
    if (PR_CHECK_FAILURE_CONCLUSIONS.has(conclusion)) return "FAILURE";
    const status = typeof e.status === "string" ? e.status.toUpperCase() : "";
    if (status && status !== "COMPLETED") hasPending = true;
  }
  return hasPending ? "PENDING" : "SUCCESS";
}

function mapPrData(raw: Record<string, unknown>, viewerLogin?: string): PrData {
  const result: PrData = {
    number: raw.number as number,
    state: mapPrState({ state: raw.state as string, isDraft: raw.isDraft as boolean }),
    title: (raw.title as string) ?? "",
    url: (raw.url as string) ?? "",
    baseBranch: (raw.baseRefName as string) ?? "",
    isDraft: (raw.isDraft as boolean) ?? false,
    updatedAt: (raw.updatedAt as string) ?? "",
  };
  const rd = raw.reviewDecision as string | undefined;
  if (rd) result.reviewDecision = rd;
  const author = raw.author as { login?: unknown } | null | undefined;
  const authorLogin = author && typeof author.login === "string" ? author.login : undefined;
  if (authorLogin && viewerLogin) {
    result.viewerDidAuthor = authorLogin === viewerLogin;
  }
  const cs = aggregateChecksStatus(raw.statusCheckRollup);
  if (cs) result.checksStatus = cs;
  const mergeable = typeof raw.mergeable === "string" ? raw.mergeable : undefined;
  if (mergeable === "MERGEABLE" || mergeable === "CONFLICTING" || mergeable === "UNKNOWN") {
    result.mergeable = mergeable;
  }
  const mss = typeof raw.mergeStateStatus === "string" ? raw.mergeStateStatus : undefined;
  if (
    mss === "BEHIND" ||
    mss === "BLOCKED" ||
    mss === "CLEAN" ||
    mss === "DIRTY" ||
    mss === "DRAFT" ||
    mss === "HAS_HOOKS" ||
    mss === "UNKNOWN" ||
    mss === "UNSTABLE"
  ) {
    result.mergeStateStatus = mss;
  }
  return result;
}

function mapPrAuthor(raw: unknown): PrAuthor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const login = typeof obj.login === "string" ? obj.login : undefined;
  if (!login) return undefined;
  const avatarUrl = typeof obj.avatarUrl === "string" ? obj.avatarUrl : undefined;
  return avatarUrl ? { login, avatarUrl } : { login };
}

function mapPrCommit(raw: unknown): PrCommitSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const oid = typeof obj.oid === "string" ? obj.oid : "";
  if (!oid) return null;
  const message = typeof obj.messageHeadline === "string" ? obj.messageHeadline : "";
  const body = typeof obj.messageBody === "string" ? obj.messageBody : undefined;
  const authoredDate = typeof obj.authoredDate === "string" ? obj.authoredDate : "";
  // `gh pr view --json commits` returns an `authors` array (not a single `author`).
  // Take the first entry as the primary author so the UI has a stable face to render.
  const authors = Array.isArray(obj.authors) ? obj.authors : [];
  const author = authors.length > 0 ? mapPrAuthor(authors[0]) : undefined;
  return {
    oid,
    abbreviatedOid: oid.slice(0, 7),
    messageHeadline: message,
    ...(body ? { messageBody: body } : {}),
    authoredDate,
    ...(author ? { author } : {}),
  };
}

function mapPrComment(raw: unknown): PrComment | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : "";
  const body = typeof obj.body === "string" ? obj.body : "";
  const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
  const author = mapPrAuthor(obj.author);
  if (!id || !author) return null;
  const url = typeof obj.url === "string" ? obj.url : undefined;
  return {
    id,
    author,
    body,
    createdAt,
    ...(url ? { url } : {}),
  };
}

function mapPrReview(raw: unknown): PrReviewSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : "";
  const author = mapPrAuthor(obj.author);
  if (!id || !author) return null;
  const stateRaw = typeof obj.state === "string" ? obj.state.toUpperCase() : "";
  const state: PrReviewState =
    stateRaw === "APPROVED" ||
    stateRaw === "CHANGES_REQUESTED" ||
    stateRaw === "COMMENTED" ||
    stateRaw === "DISMISSED" ||
    stateRaw === "PENDING"
      ? stateRaw
      : "COMMENTED";
  const submittedAt = typeof obj.submittedAt === "string" ? obj.submittedAt : undefined;
  const body = typeof obj.body === "string" ? obj.body : "";
  const url = typeof obj.url === "string" ? obj.url : undefined;
  return {
    id,
    author,
    state,
    body,
    ...(submittedAt ? { submittedAt } : {}),
    ...(url ? { url } : {}),
  };
}

function mapStatusCheck(raw: unknown): PrCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // statusCheckRollup is a union: CheckRun (workflow check) or StatusContext (legacy commit status).
  // CheckRun fields: name, status, conclusion, detailsUrl, workflowName
  // StatusContext fields: context (name), state, targetUrl, description
  const name =
    typeof obj.name === "string" ? obj.name : typeof obj.context === "string" ? obj.context : "";
  if (!name) return null;
  const conclusion = typeof obj.conclusion === "string" ? obj.conclusion : "";
  const state =
    typeof obj.status === "string" ? obj.status : typeof obj.state === "string" ? obj.state : "";
  const url =
    typeof obj.detailsUrl === "string"
      ? obj.detailsUrl
      : typeof obj.targetUrl === "string"
        ? obj.targetUrl
        : undefined;
  const workflowName = typeof obj.workflowName === "string" ? obj.workflowName : undefined;
  return {
    name,
    state,
    conclusion,
    ...(url ? { url } : {}),
    ...(workflowName ? { workflowName } : {}),
  };
}

function mapPrDetails(raw: Record<string, unknown>): PrDetails {
  const commits = Array.isArray(raw.commits)
    ? raw.commits.map(mapPrCommit).filter((c): c is PrCommitSummary => c !== null)
    : [];
  const comments = Array.isArray(raw.comments)
    ? raw.comments.map(mapPrComment).filter((c): c is PrComment => c !== null)
    : [];
  const reviews = Array.isArray(raw.reviews)
    ? raw.reviews.map(mapPrReview).filter((r): r is PrReviewSummary => r !== null)
    : [];
  const checks = Array.isArray(raw.statusCheckRollup)
    ? raw.statusCheckRollup.map(mapStatusCheck).filter((c): c is PrCheck => c !== null)
    : [];
  const mergedBy = mapPrAuthor(raw.mergedBy) ?? null;
  const author = mapPrAuthor(raw.author);
  return {
    number: typeof raw.number === "number" ? raw.number : 0,
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    ...(author ? { author } : {}),
    baseBranch: typeof raw.baseRefName === "string" ? raw.baseRefName : "",
    headBranch: typeof raw.headRefName === "string" ? raw.headRefName : "",
    additions: typeof raw.additions === "number" ? raw.additions : 0,
    deletions: typeof raw.deletions === "number" ? raw.deletions : 0,
    changedFiles: typeof raw.changedFiles === "number" ? raw.changedFiles : 0,
    ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {}),
    mergedAt: typeof raw.mergedAt === "string" ? raw.mergedAt : null,
    mergedBy,
    closedAt: typeof raw.closedAt === "string" ? raw.closedAt : null,
    commits,
    comments,
    reviews,
    checks,
  };
}

/** Stable cache key for {@link GitHubService.viewerLoginCache}. */
function locationKey(location: ProjectLocation): string {
  if (location.kind === "wsl") return `wsl:${location.distro}:${location.linuxPath}`;
  if (location.kind === "ssh") return `ssh:${location.host}:${location.path}`;
  return `${location.kind}:${location.path}`;
}

export class GitHubService {
  /** `gh api user` is the same answer per (kind, path) — cache to avoid one call per PR fetch. */
  private viewerLoginCache = new Map<string, string | null>();

  async checkGhAvailable(location: ProjectLocation): Promise<GhCheckAvailableResult> {
    try {
      await runGh(location, ["--version"]);
      return { available: true };
    } catch {
      return { available: false };
    }
  }

  private async getViewerLogin(location: ProjectLocation): Promise<string | undefined> {
    const key = locationKey(location);
    const cached = this.viewerLoginCache.get(key);
    if (cached !== undefined) return cached ?? undefined;
    try {
      const stdout = await runGh(location, ["api", "user", "--jq", ".login"]);
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
    const stdout = await runGh(location, ["pr", "view", branch, "--json", PR_VIEW_FIELDS]);
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
    // Write body to temp file to avoid shell escaping issues. For WSL projects,
    // gh runs inside the distro and can't read a Windows path, so write into
    // the distro's /tmp via UNC and pass the Linux path to --body-file.
    const tempFile = await createGhBodyFile(location, "lightcode-pr-body", body);
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
      await runGh(location, createArgs);

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

    // WSL: collapse `gh pr list` + `gh api user` (for viewerDidAuthor) into a
    // single wsl.exe spawn running the two gh calls in parallel. Saves one
    // bash-init cycle (~500–1000ms on cold paths).
    if (location.kind === "wsl") {
      const cachedLogin = this.viewerLoginCache.get(locationKey(location));
      const needsLogin = cachedLogin === undefined;
      const commands = [
        { cwd: location.linuxPath, cmd: `gh ${prListArgs.map(quotePosixShellArg).join(" ")}` },
        ...(needsLogin ? [{ cwd: location.linuxPath, cmd: `gh api user --jq .login` }] : []),
      ];
      try {
        const results = await parallelWslCommandsAsync(location.distro, commands, {
          timeoutMs: GH_TIMEOUT,
        });
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
        runGh(location, prListArgs),
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

  async mergePr(
    location: ProjectLocation,
    prNumber: number,
    method: "merge" | "squash" | "rebase",
    admin = false,
  ): Promise<void> {
    try {
      const args = ["pr", "merge", String(prNumber), `--${method}`];
      if (admin) args.push("--admin");
      await runGh(location, args);
    } catch (err) {
      throw classifyError(err, "pr merge");
    }
  }

  async closePr(location: ProjectLocation, prNumber: number): Promise<void> {
    try {
      await runGh(location, ["pr", "close", String(prNumber)]);
    } catch (err) {
      throw classifyError(err, "pr close");
    }
  }

  async reopenPr(location: ProjectLocation, prNumber: number): Promise<void> {
    try {
      await runGh(location, ["pr", "reopen", String(prNumber)]);
    } catch (err) {
      throw classifyError(err, "pr reopen");
    }
  }

  async markPrReady(location: ProjectLocation, prNumber: number): Promise<void> {
    try {
      await runGh(location, ["pr", "ready", String(prNumber)]);
    } catch (err) {
      throw classifyError(err, "pr ready");
    }
  }

  /** `gh pr update-branch <n>` — merge (or rebase) the base branch into the PR branch. */
  async updatePrBranch(location: ProjectLocation, prNumber: number, rebase = false): Promise<void> {
    try {
      const args = ["pr", "update-branch", String(prNumber)];
      if (rebase) args.push("--rebase");
      await runGh(location, args);
    } catch (err) {
      throw classifyError(err, "pr update-branch");
    }
  }

  async getPrChecks(location: ProjectLocation, branch: string): Promise<GhGetPrChecksResult> {
    try {
      const stdout = await runGh(location, [
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
      const stdout = await runGh(location, ["pr", "view", String(prNumber), "--json", "files"]);
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
      const stdout = await runGh(location, ["pr", "diff", String(prNumber)]);
      return { diff: stdout };
    } catch (err) {
      throw classifyError(err, "pr diff");
    }
  }

  async getPrDetails(location: ProjectLocation, prNumber: number): Promise<GhGetPrDetailsResult> {
    try {
      const stdout = await runGh(location, [
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
    const tempFile = await createGhBodyFile(location, "lightcode-pr-comment", trimmed);
    try {
      const [stdout, viewerLogin] = await Promise.all([
        runGh(location, ["pr", "comment", String(prNumber), "--body-file", tempFile.cliPath]),
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
        await runGh(location, ["pr", "review", String(prNumber), flag]);
        return;
      } catch (err) {
        throw classifyError(err, "pr review");
      }
    }

    const tempFile = await createGhBodyFile(location, "lightcode-pr-review", trimmed);
    try {
      await runGh(location, [
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
