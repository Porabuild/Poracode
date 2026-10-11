import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Provenance and evidence utilities for native-e2e experiments.
 * Observation-only: records which sources and which artifact a run exercised.
 * Never builds or mutates the tree.
 */

/** Mobile SDK/build trees are not inputs to the headless server artifact and
 * churn by tens of thousands of files; excluding them keeps git output within
 * spawn buffer limits and scoped to real headless server inputs. */
const STATUS_EXCLUSIONS = [":(exclude)ios", ":(exclude)android", ":(exclude).build"] as const;

const SECRET_PATTERN = /lc_(pair|access|ws)_[A-Za-z0-9_-]+/u;

export interface DirtyFileEntry {
  readonly path: string;
  readonly status: string;
  /** sha256 of working-tree content; null when the file is deleted on disk. */
  readonly sha256: string | null;
}

export interface SourceObservationRecord {
  readonly gitHead: string;
  readonly statusScope: readonly string[];
  readonly gitDirtyEntries: number;
  readonly dirtyFiles: readonly DirtyFileEntry[];
  /** Wall-clock instant the sources were observed. This is NOT proof of which
   * sources produced the artifact — the artifact sha256 is the binding record. */
  readonly observedAtIso: string;
  readonly nodeVersion: string;
}

export interface ArtifactProvenanceRecord {
  readonly artifactPath: string;
  readonly artifactSha256: string;
  readonly artifactBytes: number;
  readonly recordedAtIso: string;
  readonly sourceObservation: SourceObservationRecord;
  readonly provenanceNote: string;
}

function runGit(args: readonly string[], repoRoot: string, maxBufferBytes: number): string {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: maxBufferBytes,
  });
  if (result.error) {
    throw new Error(`git ${args.join(" ")} failed to spawn: ${String(result.error)}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${String(result.status)}: ${(result.stderr ?? "").trim()}`,
    );
  }
  if (result.stdout === undefined) {
    throw new Error(`git ${args.join(" ")} produced no stdout and no error`);
  }
  return result.stdout;
}

function hashWorkingTreeContent(
  repoRoot: string,
  relativePath: string,
  deleted: boolean,
): string | null {
  if (deleted) return null;
  try {
    const bytes = readFileSync(join(repoRoot, relativePath));
    return createHash("sha256").update(bytes).digest("hex");
  } catch (error) {
    throw new Error(`could not hash dirty file ${relativePath}: ${String(error)}`, {
      cause: error,
    });
  }
}

/** Observes the dirty source state scoped to real headless server inputs.
 * Throws on spawn failure or truncation instead of silently recording less
 * than the real tree state. */
export function observeSources(repoRoot: string): SourceObservationRecord {
  const head = runGit(["rev-parse", "HEAD"], repoRoot, 4 * 1024 * 1024).trim();
  const statusOutput = runGit(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".", ...STATUS_EXCLUSIONS],
    repoRoot,
    64 * 1024 * 1024,
  );
  const dirtyFiles: DirtyFileEntry[] = [];
  const records = statusOutput.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    // In NUL format, the destination is first; rename/copy source is the next record.
    if (/[RC]/u.test(status)) index += 1;
    dirtyFiles.push({
      path,
      status: status.trim(),
      sha256: hashWorkingTreeContent(repoRoot, path, status.includes("D")),
    });
  }
  return {
    gitHead: head || "unknown",
    statusScope: ["all tracked + untracked", ...STATUS_EXCLUSIONS],
    gitDirtyEntries: dirtyFiles.length,
    dirtyFiles,
    observedAtIso: new Date().toISOString(),
    nodeVersion: process.version,
  };
}

/** Binds a prebuilt artifact to the observed source state. The artifact sha256
 * is the identity; source observation happened at observation time, which does
 * not by itself prove the build inputs. */
export function describeArtifact(
  artifactPath: string,
  sourceObservation: SourceObservationRecord,
): ArtifactProvenanceRecord {
  const artifact = readFileSync(artifactPath);
  return {
    artifactPath,
    artifactSha256: createHash("sha256").update(artifact).digest("hex"),
    artifactBytes: statSync(artifactPath).size,
    recordedAtIso: new Date().toISOString(),
    sourceObservation,
    provenanceNote:
      "Artifact was built out-of-band before this record. Its sha256 is the binding " +
      "identity; dirtyFiles hashes describe the tree observed at run time, not a " +
      "proof of build inputs.",
  };
}

/** Compact reference for run summaries — details live in build.json, never
 * embed the full dirty-file list twice. */
export function summarizeProvenance(record: ArtifactProvenanceRecord): {
  artifactSha256: string;
  artifactBytes: number;
  gitHead: string;
  gitDirtyEntries: number;
  observedAtIso: string;
  detailsRef: string;
} {
  return {
    artifactSha256: record.artifactSha256,
    artifactBytes: record.artifactBytes,
    gitHead: record.sourceObservation.gitHead,
    gitDirtyEntries: record.sourceObservation.gitDirtyEntries,
    observedAtIso: record.sourceObservation.observedAtIso,
    detailsRef: "build.json",
  };
}

/** Scoped, redacted diff for the same inputs as `observeSources`. Source hashes
 * retain exact provenance; secret-shaped literals (including test fixtures) must
 * never be copied into the review artifact. Other artifacts remain fail-closed. */
export function captureTreeDiff(repoRoot: string): string {
  return runGit(["diff", "--", ".", ...STATUS_EXCLUSIONS], repoRoot, 64 * 1024 * 1024).replace(
    new RegExp(SECRET_PATTERN.source, "gu"),
    "[REDACTED CREDENTIAL]",
  );
}

/** Persists sanitized evidence under tmp/. Throws if any pairing/access/ticket
 * secret leaked into the payload. */
export function writeExperimentArtifact(
  repoRoot: string,
  fileName: string,
  payload: unknown,
): string {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  if (SECRET_PATTERN.test(serialized)) {
    throw new Error(`refusing to write artifact ${fileName}: secret-shaped material detected`);
  }
  const dir = join(repoRoot, "tmp", "v2-production-review", "shared-host");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, fileName);
  writeFileSync(path, `${serialized}\n`, { mode: 0o600 });
  return path;
}
