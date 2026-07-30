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
const MAX_OMITTED_FILE_LIST_LENGTH = 250_000;
const MIN_OMISSION_NOTE_RESERVE = 4_096;
const NON_CODE_ASSET_EXTENSIONS = new Set([
  "7z",
  "avi",
  "avif",
  "bmp",
  "eot",
  "flac",
  "gif",
  "gz",
  "heic",
  "ico",
  "jpeg",
  "jpg",
  "m4a",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "ogg",
  "otf",
  "pdf",
  "png",
  "psd",
  "rar",
  "sketch",
  "svg",
  "tar",
  "tgz",
  "tif",
  "tiff",
  "ttf",
  "wav",
  "webm",
  "webp",
  "woff",
  "woff2",
  "zip",
]);

type OmissionReason = "asset" | "count" | "size";

function isNonCodeAsset(path: string): boolean {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return extension ? NON_CODE_ASSET_EXTENSIONS.has(extension) : false;
}

function selectUntrackedContentFiles(files: readonly GitFileChange[]): Set<string> {
  return new Set(
    files
      .filter((file) => !isNonCodeAsset(file.path))
      .slice(0, MAX_EXPERIMENT_UNTRACKED_FILES)
      .map((file) => file.path),
  );
}

function omittedFileList(
  files: readonly GitFileChange[],
  reasons: ReadonlyMap<string, OmissionReason>,
  maxLength: number,
): string {
  if (reasons.size === 0 || maxLength <= 0) return "";
  const lines = [
    "PORACODE NOTICE: The following untracked files are part of this solution, but their contents were omitted from AI comparison:",
  ];
  let length = lines[0]!.length;
  let listed = 0;
  for (const file of files) {
    const reason = reasons.get(file.path);
    if (!reason) continue;
    const label =
      reason === "asset"
        ? "non-code asset"
        : reason === "count"
          ? "untracked content limit"
          : "diff size limit";
    const line = `- ${JSON.stringify(file.path)} (${label})`;
    if (length + line.length + 1 > maxLength) break;
    lines.push(line);
    length += line.length + 1;
    listed += 1;
  }
  if (listed < reasons.size) {
    const summary = `- …and ${reasons.size - listed} more omitted file paths`;
    if (length + summary.length + 1 <= maxLength) lines.push(summary);
  }
  return lines.join("\n");
}

function isDiffSizeError(error: unknown): boolean {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
  ) {
    return true;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return /maxbuffer|output exceeded the \d+-byte limit/i.test(detail);
}

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
    if (
      first.headCommit !== second.headCommit ||
      first.diff !== second.diff ||
      first.omittedFiles !== second.omittedFiles
    ) {
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

    // These stats are advisory UI data, unlike the exact diff snapshot used for
    // judging and merging. A second equality pass makes actively-writing
    // candidates repeatedly reject and leaves their cards stuck on old cached
    // values, while also doubling the cost for large untracked directories.
    const snapshot = await this.captureCandidateStats(location, baseRef);
    return {
      insertions: snapshot.insertions,
      deletions: snapshot.deletions,
      files: snapshot.files,
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
    const contentPaths = selectUntrackedContentFiles(untrackedFiles);
    const omissionReasons = new Map<string, OmissionReason>();
    for (const file of untrackedFiles) {
      if (!contentPaths.has(file.path)) {
        omissionReasons.set(file.path, isNonCodeAsset(file.path) ? "asset" : "count");
      }
    }
    const initialOmissionList = omittedFileList(
      untrackedFiles,
      omissionReasons,
      MAX_OMITTED_FILE_LIST_LENGTH,
    );
    const availableAfterTracked = Math.max(0, MAX_EXPERIMENT_DIFF_LENGTH - trackedDiff.length);
    const omissionReserve = Math.min(
      availableAfterTracked,
      Math.max(MIN_OMISSION_NOTE_RESERVE, initialOmissionList.length),
    );
    const contentLimit = MAX_EXPERIMENT_DIFF_LENGTH - omissionReserve;
    const contentFiles = untrackedFiles.filter((file) => contentPaths.has(file.path));
    const untrackedDiffs = new Array<string | null>(contentFiles.length);
    const perFileReadLimit = contentLimit - trackedDiff.length;
    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < contentFiles.length) {
        const index = nextIndex++;
        const file = contentFiles[index]!;
        if (perFileReadLimit <= 0) {
          omissionReasons.set(file.path, "size");
          untrackedDiffs[index] = null;
          continue;
        }
        let result: { diff: string };
        try {
          result = await this.statusService.getDiff(location, file.path, false, perFileReadLimit);
        } catch (error) {
          if (isDiffSizeError(error)) {
            omissionReasons.set(file.path, "size");
            untrackedDiffs[index] = null;
            continue;
          }
          throw error;
        }
        if (!result.diff.trim()) {
          throw new Error(msg("experiment.candidate.untrackedReadFailed", { path: file.path }));
        }
        untrackedDiffs[index] = result.diff.trimEnd();
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(EXPERIMENT_GIT_READ_CONCURRENCY, contentFiles.length),
        },
        runWorker,
      ),
    );
    let capturedLength = parts[0]?.length ?? 0;
    for (const [index, untrackedDiff] of untrackedDiffs.entries()) {
      if (untrackedDiff === null || untrackedDiff === undefined) continue;
      const separatorLength = parts.length > 0 ? 1 : 0;
      if (capturedLength + separatorLength + untrackedDiff.length > contentLimit) {
        omissionReasons.set(contentFiles[index]!.path, "size");
        continue;
      }
      parts.push(untrackedDiff);
      capturedLength += separatorLength + untrackedDiff.length;
    }
    const capturedDiff = parts.join("\n");
    const omissionList = omittedFileList(
      untrackedFiles,
      omissionReasons,
      Math.min(
        MAX_OMITTED_FILE_LIST_LENGTH,
        Math.max(0, MAX_EXPERIMENT_DIFF_LENGTH - capturedDiff.length - 1),
      ),
    );
    const diff = [capturedDiff, omissionList].filter(Boolean).join("\n");
    const finalHeadCommit = await this.getHeadCommit(location);
    if (finalHeadCommit !== headCommit) {
      throw new Error(msg("experiment.candidate.changedDuringDiff"));
    }
    return {
      diff,
      headCommit,
      ...(omissionReasons.size > 0 ? { omittedFiles: omissionReasons.size } : {}),
    };
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
    const contentPaths = selectUntrackedContentFiles(untrackedFiles);
    const contentFiles = untrackedFiles.filter((file) => contentPaths.has(file.path));
    const untrackedNumstats = new Array<string>(contentFiles.length);
    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < contentFiles.length) {
        const index = nextIndex++;
        const file = contentFiles[index]!;
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
          length: Math.min(EXPERIMENT_GIT_READ_CONCURRENCY, contentFiles.length),
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
      files: new Set([
        ...entries.map((entry) => entry.path),
        ...untrackedFiles.map((file) => file.path),
      ]).size,
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
