import {
  fullCommitOidSchema,
  MAX_EXPERIMENT_DIFF_LENGTH,
  MAX_EXPERIMENT_UNTRACKED_FILES,
  type GetExperimentCandidateDiffResult,
  type GetExperimentCandidateStatsResult,
  type GitFileChange,
  type ProjectLocation,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { execGit, GIT_DIFF_TIMEOUT, toForwardSlash } from "./exec";
import { LS_FILES_UNTRACKED_ARGS, parseDiffNumstat } from "./statusParsing";
import { GitStatusService } from "./statusService";

const EXPERIMENT_GIT_READ_CONCURRENCY = 4;

export class GitExperimentService {
  constructor(private readonly statusService: GitStatusService) {}

  async getCandidateDiff(
    location: ProjectLocation,
    baseRef: string,
  ): Promise<GetExperimentCandidateDiffResult> {
    if (!fullCommitOidSchema.safeParse(baseRef).success) {
      throw new Error(msg("experiment.diff.baseFullCommit"));
    }

    const first = await this.captureCandidateDiff(location, baseRef);
    const second = await this.captureCandidateDiff(location, baseRef);
    if (first.headCommit !== second.headCommit || first.diff !== second.diff) {
      throw new Error(msg("experiment.candidate.changedDuringDiff"));
    }
    return second;
  }

  async getCandidateStats(
    location: ProjectLocation,
    baseRef: string,
  ): Promise<GetExperimentCandidateStatsResult> {
    if (!fullCommitOidSchema.safeParse(baseRef).success) {
      throw new Error(msg("experiment.diff.baseFullCommit"));
    }

    const first = await this.captureCandidateStats(location, baseRef);
    const second = await this.captureCandidateStats(location, baseRef);
    if (
      first.headCommit !== second.headCommit ||
      first.insertions !== second.insertions ||
      first.deletions !== second.deletions ||
      first.files !== second.files
    ) {
      throw new Error(msg("experiment.candidate.changedDuringStats"));
    }
    return {
      insertions: second.insertions,
      deletions: second.deletions,
      files: second.files,
    };
  }

  private async captureCandidateDiff(
    location: ProjectLocation,
    baseRef: string,
  ): Promise<GetExperimentCandidateDiffResult> {
    const headCommit = await this.getHeadCommit(location);
    await this.assertHeadDescendsFromBase(location, baseRef, headCommit);
    const trackedDiff = await execGit(location, ["diff", baseRef, "--"], {
      timeout: GIT_DIFF_TIMEOUT,
      maxBuffer: MAX_EXPERIMENT_DIFF_LENGTH,
    });
    const untrackedFiles = await this.getUntrackedFiles(location);
    const parts = trackedDiff.trim() ? [trackedDiff.trimEnd()] : [];
    let capturedLength = trackedDiff.length;
    for (const file of untrackedFiles) {
      const remaining = MAX_EXPERIMENT_DIFF_LENGTH - capturedLength;
      if (remaining <= 0) {
        throw new Error(msg("experiment.candidate.diffTooLarge"));
      }
      const result = await this.statusService.getDiff(location, file.path, false, remaining);
      if (!result.diff.trim()) {
        throw new Error(msg("experiment.candidate.untrackedReadFailed", { path: file.path }));
      }
      capturedLength += result.diff.length;
      if (capturedLength > MAX_EXPERIMENT_DIFF_LENGTH) {
        throw new Error(msg("experiment.candidate.diffTooLarge"));
      }
      parts.push(result.diff.trimEnd());
    }
    const finalHeadCommit = await this.getHeadCommit(location);
    if (finalHeadCommit !== headCommit) {
      throw new Error(msg("experiment.candidate.changedDuringDiff"));
    }
    return { diff: parts.join("\n"), headCommit };
  }

  private async captureCandidateStats(
    location: ProjectLocation,
    baseRef: string,
  ): Promise<GetExperimentCandidateStatsResult & { headCommit: string }> {
    const headCommit = await this.getHeadCommit(location);
    await this.assertHeadDescendsFromBase(location, baseRef, headCommit);
    const trackedNumstat = await execGit(location, ["diff", "--numstat", baseRef, "--"], {
      timeout: GIT_DIFF_TIMEOUT,
      maxBuffer: 1_000_000,
    });
    const entries = parseDiffNumstat(trackedNumstat);
    const untrackedFiles = await this.getUntrackedFiles(location);
    const untrackedNumstats = new Array<string>(untrackedFiles.length);
    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < untrackedFiles.length) {
        const index = nextIndex++;
        const file = untrackedFiles[index]!;
        untrackedNumstats[index] = await execGit(
          location,
          ["diff", "--no-index", "--numstat", "--", "/dev/null", file.path],
          {
            timeout: GIT_DIFF_TIMEOUT,
            allowNonZeroExit: true,
            maxBuffer: 64_000,
          },
        );
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(EXPERIMENT_GIT_READ_CONCURRENCY, untrackedFiles.length),
        },
        runWorker,
      ),
    );
    for (const output of untrackedNumstats) entries.push(...parseDiffNumstat(output));

    const finalHeadCommit = await this.getHeadCommit(location);
    if (finalHeadCommit !== headCommit) {
      throw new Error(msg("experiment.candidate.changedDuringStats"));
    }
    return {
      insertions: entries.reduce((total, entry) => total + entry.insertions, 0),
      deletions: entries.reduce((total, entry) => total + entry.deletions, 0),
      files: new Set(entries.map((entry) => entry.path)).size,
      headCommit,
    };
  }

  private async getUntrackedFiles(location: ProjectLocation): Promise<GitFileChange[]> {
    // Porcelain status may collapse an untracked directory to one row when its
    // companion `ls-files` call fails. Passing that directory to
    // `git diff --no-index /dev/null <path>` makes Git reinterpret `/dev/null`
    // beneath the directory (for example `.venv/null`). Resolve actual files at
    // this boundary instead.
    const output = await execGit(location, LS_FILES_UNTRACKED_ARGS, {
      timeout: GIT_DIFF_TIMEOUT,
    });
    const paths = output
      .split("\0")
      .filter((path) => path.length > 0)
      .map(toForwardSlash);
    if (paths.length > MAX_EXPERIMENT_UNTRACKED_FILES) {
      throw new Error(
        msg("experiment.candidate.tooManyUntracked", {
          count: paths.length,
          maximum: MAX_EXPERIMENT_UNTRACKED_FILES,
        }),
      );
    }
    return paths.map((path) => ({
      path,
      status: "?",
      staged: false,
      insertions: 0,
      deletions: 0,
    }));
  }

  private async getHeadCommit(location: ProjectLocation): Promise<string> {
    const commit = (await execGit(location, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
    if (!fullCommitOidSchema.safeParse(commit).success) {
      throw new Error(msg("experiment.candidate.commitResolveFailed"));
    }
    return commit.toLowerCase();
  }

  private async assertHeadDescendsFromBase(
    location: ProjectLocation,
    baseRef: string,
    headCommit: string,
  ): Promise<void> {
    try {
      await execGit(location, ["merge-base", "--is-ancestor", baseRef, headCommit]);
    } catch {
      throw new Error(msg("experiment.candidate.notDescendant"));
    }
  }
}
