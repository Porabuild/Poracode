/**
 * Pure mappers that translate raw `gh` CLI / GitHub REST payloads into the
 * shared `Pr*` / `GitHub*` contract types. Extracted from `github.ts` so the
 * GitHubService composes over them instead of co-owning ~250 lines of
 * payload-shaping. Every function here is pure (raw in → typed value out).
 */

import {
  PR_CHECK_FAILURE_CONCLUSIONS,
  type GitHubActionsJob,
  type GitHubActionsRun,
  type GitHubActionsStep,
  type GitHubActionsWorkflow,
  type GitHubAccount,
  type GitHubRepoSummary,
  type PrAuthor,
  type PrCheck,
  type PrComment,
  type PrCommitSummary,
  type PrData,
  type PrDetails,
  type PrReviewState,
  type PrReviewSummary,
  type PrState,
  type PullRequestSummary,
} from "@/shared/contracts";

function optionalString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw ? raw : undefined;
}

export function mapGitHubActionsWorkflow(raw: unknown): GitHubActionsWorkflow | null {
  if (!raw || typeof raw !== "object") return null;
  const workflow = raw as Record<string, unknown>;
  const id = typeof workflow.id === "number" ? workflow.id : 0;
  const name = typeof workflow.name === "string" ? workflow.name : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    path: typeof workflow.path === "string" ? workflow.path : "",
    state: typeof workflow.state === "string" ? workflow.state : "",
  };
}

function mapGitHubActionsStep(raw: unknown): GitHubActionsStep | null {
  if (!raw || typeof raw !== "object") return null;
  const step = raw as Record<string, unknown>;
  const number = typeof step.number === "number" ? step.number : 0;
  const name = typeof step.name === "string" ? step.name : "";
  if (!number || !name) return null;
  const startedAt = optionalString(step.startedAt);
  const completedAt = optionalString(step.completedAt);
  return {
    number,
    name,
    status: typeof step.status === "string" ? step.status : "",
    conclusion: typeof step.conclusion === "string" ? step.conclusion : "",
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

function mapGitHubActionsJob(raw: unknown): GitHubActionsJob | null {
  if (!raw || typeof raw !== "object") return null;
  const job = raw as Record<string, unknown>;
  const id = typeof job.databaseId === "number" ? job.databaseId : 0;
  const name = typeof job.name === "string" ? job.name : "";
  if (!id || !name) return null;
  const startedAt = optionalString(job.startedAt);
  const completedAt = optionalString(job.completedAt);
  const url = optionalString(job.url);
  return {
    id,
    name,
    status: typeof job.status === "string" ? job.status : "",
    conclusion: typeof job.conclusion === "string" ? job.conclusion : "",
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(url ? { url } : {}),
    steps: Array.isArray(job.steps)
      ? job.steps
          .map(mapGitHubActionsStep)
          .filter((step): step is GitHubActionsStep => step !== null)
      : [],
  };
}

export function mapGitHubActionsRun(raw: unknown): GitHubActionsRun | null {
  if (!raw || typeof raw !== "object") return null;
  const run = raw as Record<string, unknown>;
  const id = typeof run.databaseId === "number" ? run.databaseId : 0;
  if (!id) return null;
  return {
    id,
    workflowId: typeof run.workflowDatabaseId === "number" ? run.workflowDatabaseId : 0,
    workflowName: typeof run.workflowName === "string" ? run.workflowName : "",
    name: typeof run.name === "string" ? run.name : "",
    number: typeof run.number === "number" ? run.number : 0,
    attempt: typeof run.attempt === "number" ? run.attempt : 1,
    title: typeof run.displayTitle === "string" ? run.displayTitle : "",
    event: typeof run.event === "string" ? run.event : "",
    headBranch: typeof run.headBranch === "string" ? run.headBranch : "",
    headSha: typeof run.headSha === "string" ? run.headSha : "",
    status: typeof run.status === "string" ? run.status : "",
    conclusion: typeof run.conclusion === "string" ? run.conclusion : "",
    createdAt: typeof run.createdAt === "string" ? run.createdAt : "",
    startedAt: typeof run.startedAt === "string" ? run.startedAt : "",
    updatedAt: typeof run.updatedAt === "string" ? run.updatedAt : "",
    url: typeof run.url === "string" ? run.url : "",
    jobs: Array.isArray(run.jobs)
      ? run.jobs.map(mapGitHubActionsJob).filter((job): job is GitHubActionsJob => job !== null)
      : [],
  };
}

export function mapPrState(raw: { state: string; isDraft: boolean }): PrState {
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

export function mapPrData(raw: Record<string, unknown>, viewerLogin?: string): PrData {
  const result: PrData = {
    number: raw.number as number,
    state: mapPrState({ state: raw.state as string, isDraft: raw.isDraft as boolean }),
    ...(typeof raw.headRefOid === "string" && raw.headRefOid ? { headSha: raw.headRefOid } : {}),
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
    result.viewerDidAuthor = authorLogin.toLowerCase() === viewerLogin.toLowerCase();
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

export function mapPrAuthor(raw: unknown): PrAuthor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const login = typeof obj.login === "string" ? obj.login : undefined;
  if (!login) return undefined;
  const avatarUrl = typeof obj.avatarUrl === "string" ? obj.avatarUrl : undefined;
  return avatarUrl ? { login, avatarUrl } : { login };
}

function repositoryFromPrUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || !rawUrl) return "";
  try {
    const segments = new URL(rawUrl).pathname.split("/").filter(Boolean);
    const pullIndex = segments.lastIndexOf("pull");
    return pullIndex >= 2 ? `${segments[pullIndex - 2]}/${segments[pullIndex - 1]}` : "";
  } catch {
    return "";
  }
}

export function mapPullRequestSummary(
  raw: Record<string, unknown>,
  viewerLogin?: string,
): PullRequestSummary {
  const author = mapPrAuthor(raw.author);
  const reviewRequested =
    viewerLogin !== undefined &&
    Array.isArray(raw.reviewRequests) &&
    raw.reviewRequests.some((request) => {
      if (!request || typeof request !== "object") return false;
      const login = (request as Record<string, unknown>).login;
      return typeof login === "string" && login.toLowerCase() === viewerLogin.toLowerCase();
    });

  return {
    pr: mapPrData(raw, viewerLogin),
    headBranch: typeof raw.headRefName === "string" ? raw.headRefName : "",
    ...(author ? { author } : {}),
    additions: typeof raw.additions === "number" ? raw.additions : 0,
    deletions: typeof raw.deletions === "number" ? raw.deletions : 0,
    repository: repositoryFromPrUrl(raw.url),
    reviewRequested,
  };
}

export function mapPrCommit(raw: unknown): PrCommitSummary | null {
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

export function mapPrComment(raw: unknown): PrComment | null {
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

export function mapPrReview(raw: unknown): PrReviewSummary | null {
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

export function mapStatusCheck(raw: unknown): PrCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // statusCheckRollup is a union: CheckRun (workflow check) or StatusContext (legacy commit status).
  // CheckRun fields: name, status, conclusion, detailsUrl, workflowName, startedAt, completedAt
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
  const startedAt = typeof obj.startedAt === "string" ? obj.startedAt : undefined;
  const completedAt = typeof obj.completedAt === "string" ? obj.completedAt : undefined;
  return {
    name,
    state,
    conclusion,
    ...(url ? { url } : {}),
    ...(workflowName ? { workflowName } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

export function mapPrDetails(raw: Record<string, unknown>): PrDetails {
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

/**
 * Parse the accounts out of `gh auth status` text. The output groups one block
 * per signed-in account: a "Logged in to <host> account <login>" line followed
 * by an "Active account: true/false" line. Tolerant of formatting drift across
 * gh versions — we only key off those two phrases.
 */
export function parseGhAuthAccounts(output: string): GitHubAccount[] {
  const accounts: GitHubAccount[] = [];
  let current: GitHubAccount | null = null;
  for (const line of output.split(/\r?\n/)) {
    const loggedIn = /Logged in to (\S+) account (\S+)/.exec(line);
    if (loggedIn) {
      current = { host: loggedIn[1]!, login: loggedIn[2]!, active: false };
      accounts.push(current);
      continue;
    }
    if (current && /Active account:\s*true/i.test(line)) {
      current.active = true;
    }
  }
  return accounts;
}

/** Map a raw GitHub REST `user/repos` entry to the picker summary. */
export function mapGitHubApiRepo(raw: unknown): GitHubRepoSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const nameWithOwner = typeof r.full_name === "string" ? r.full_name : "";
  if (!nameWithOwner) return null;
  const [ownerFromFull, nameFromFull] = nameWithOwner.split("/");
  const ownerObj = r.owner as Record<string, unknown> | null | undefined;
  const owner =
    ownerObj && typeof ownerObj.login === "string" ? ownerObj.login : (ownerFromFull ?? "");
  const name = typeof r.name === "string" ? r.name : (nameFromFull ?? "");
  return {
    nameWithOwner,
    owner,
    name,
    description: typeof r.description === "string" ? r.description : "",
    isPrivate: r.private === true,
    isFork: r.fork === true,
    sshUrl: typeof r.ssh_url === "string" ? r.ssh_url : "",
    httpsUrl: typeof r.clone_url === "string" ? r.clone_url : "",
    pushedAt: typeof r.pushed_at === "string" ? r.pushed_at : "",
  };
}
