import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  ProjectLocation,
  PrData,
  PrState,
  PrCheck,
  GhCheckAvailableResult,
  GhGetPrChecksResult,
} from "../shared/contracts";
import { buildAgentCommand } from "./agents/base";

const execFileAsync = promisify(execFile);
const GH_TIMEOUT = 30_000;

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
    return new Error(
      `GitHub CLI is not authenticated. Run "gh auth login" in the terminal.`,
    );
  }

  return new Error(`gh ${operation} failed: ${msg}`);
}

async function runGh(
  location: ProjectLocation,
  args: string[],
): Promise<string> {
  const spec = buildAgentCommand(location, "gh", args);
  const { stdout } = await execFileAsync(spec.command, spec.args, {
    windowsHide: true,
    timeout: GH_TIMEOUT,
  });
  return stdout;
}

function mapPrState(raw: { state: string; isDraft: boolean }): PrState {
  if (raw.isDraft) return "draft";
  const s = raw.state?.toUpperCase?.() ?? "";
  if (s === "MERGED") return "merged";
  if (s === "CLOSED") return "closed";
  return "open";
}

function mapPrData(raw: Record<string, unknown>): PrData {
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
  const cs = raw.statusCheckRollup as string | undefined;
  if (cs) result.checksStatus = cs;
  return result;
}

export class GitHubService {
  async checkGhAvailable(location: ProjectLocation): Promise<GhCheckAvailableResult> {
    try {
      await runGh(location, ["--version"]);
      return { available: true };
    } catch {
      return { available: false };
    }
  }

  async createPr(
    location: ProjectLocation,
    branch: string,
    baseBranch: string,
    title: string,
    body: string,
    isDraft: boolean,
  ): Promise<PrData> {
    // Write body to temp file to avoid shell escaping issues (T3Code pattern)
    const bodyFile = join(tmpdir(), `lightcode-pr-body-${Date.now()}.md`);
    try {
      await writeFile(bodyFile, body, "utf-8");
      const args = [
        "pr", "create",
        "--base", baseBranch,
        "--head", branch,
        "--title", title,
        "--body-file", bodyFile,
        ...(isDraft ? ["--draft"] : []),
        "--json", "number,url,state,title,baseRefName,isDraft,reviewDecision,updatedAt",
      ];
      const stdout = await runGh(location, args);
      return mapPrData(JSON.parse(stdout));
    } catch (err) {
      throw classifyError(err, "pr create");
    } finally {
      await unlink(bodyFile).catch(() => {});
    }
  }

  async getPrForBranch(
    location: ProjectLocation,
    branch: string,
  ): Promise<PrData | null> {
    try {
      const stdout = await runGh(location, [
        "pr", "list",
        "--head", branch,
        "--state", "all",
        "--limit", "1",
        "--json", "number,url,state,title,baseRefName,isDraft,reviewDecision,updatedAt",
      ]);
      const items = JSON.parse(stdout);
      if (!Array.isArray(items) || items.length === 0) return null;
      return mapPrData(items[0]);
    } catch (err) {
      throw classifyError(err, "pr list");
    }
  }

  async mergePr(
    location: ProjectLocation,
    prNumber: number,
    method: "merge" | "squash" | "rebase",
  ): Promise<void> {
    try {
      await runGh(location, [
        "pr", "merge", String(prNumber),
        `--${method}`,
        "--delete-branch",
      ]);
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

  async getPrChecks(
    location: ProjectLocation,
    branch: string,
  ): Promise<GhGetPrChecksResult> {
    try {
      const stdout = await runGh(location, [
        "pr", "checks", branch,
        "--json", "name,state,conclusion",
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
}
