import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Arm freeze and observer-acknowledgment gate for the A0 baseline.
 *
 * The baseline may only run on a frozen arm whose renderer Event Timing
 * observer matches the coordinator's observer-ready acknowledgment, and with
 * no A1/A2 edits present. This module records the arm identity and refuses to
 * proceed when either condition is not provable. It never builds or mutates
 * the tree.
 */

export interface ObserverFileHash {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ObserverAckRecord {
  readonly observerSha256: string;
  readonly acknowledgedBy: string;
  readonly acknowledgedAt: string;
  readonly armHead?: string;
  readonly allowedSrcDirty?: readonly string[];
  /**
   * Every source file that carries the observer behavior (format, adapters,
   * installer and their tests). When present, all of them are re-hashed in the
   * arm, so an edit to any observer file — not just the snapshot module —
   * breaks the freeze.
   */
  readonly observerFiles?: readonly ObserverFileHash[];
  /**
   * The parent-approved full patch set (the R0.1 acknowledgment's 114 files).
   * When present, every path is re-hashed in the arm before a launch and any
   * mismatch refuses to run.
   */
  readonly approvedPatchFiles?: readonly ObserverFileHash[];
}

export interface ArmArtifactHash {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ArmRecord {
  readonly armRoot: string;
  readonly gitHead: string | null;
  readonly gitHeadSource: "git" | "ack" | "unknown";
  readonly gitDirtySrc: readonly string[];
  readonly observerPath: string;
  readonly observerSha256: string | null;
  /** Hashes of the acknowledgment's observer files as found in this arm. */
  readonly observerFiles: readonly ArmArtifactHash[];
  /** Re-hash of the acknowledgment's full approved-patch file set (114 files). */
  readonly approvedFileCount: number;
  readonly approvedHashMismatches: readonly string[];
  readonly artifacts: readonly ArmArtifactHash[];
  readonly nodeVersion: string;
  readonly electronVersion: string | null;
  readonly recordedAtIso: string;
}

const OBSERVER_PATH = "src/renderer/diagnostics/rendererPerfDiagnostics.ts";
const ARTIFACT_PATHS = [
  "dist/main/server.cjs",
  "dist/server-native/better_sqlite3.node",
  "package.json",
  "pnpm-lock.yaml",
  "tests/native-e2e/v2ArchitectureQualification.test.ts",
] as const;

export function hashFile(path: string): ArmArtifactHash | null {
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}

function git(armRoot: string, args: readonly string[]): string | null {
  const result = spawnSync("git", args, {
    cwd: armRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout ?? null;
}

function parseObserverFiles(value: unknown, ackPath: string): ObserverFileHash[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`observer acknowledgment ${ackPath} has a non-array observerFiles`);
  }
  return value.map((entry) => {
    const record = entry as Partial<ObserverFileHash>;
    if (typeof record.path !== "string" || record.path.length === 0) {
      throw new Error(
        `observer acknowledgment ${ackPath} has an observerFiles entry without a path`,
      );
    }
    if (typeof record.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.sha256)) {
      throw new Error(
        `observer acknowledgment ${ackPath} observerFiles entry ${record.path} has no valid sha256`,
      );
    }
    if (
      typeof record.bytes !== "number" ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 0
    ) {
      throw new Error(
        `observer acknowledgment ${ackPath} observerFiles entry ${record.path} has no valid byte count`,
      );
    }
    return { path: record.path, sha256: record.sha256, bytes: record.bytes };
  });
}

export function readObserverAck(ackPath: string): ObserverAckRecord {
  const parsed = JSON.parse(readFileSync(ackPath, "utf8")) as Partial<ObserverAckRecord>;
  if (typeof parsed.observerSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(parsed.observerSha256)) {
    throw new Error(`observer acknowledgment ${ackPath} has no valid observerSha256`);
  }
  if (typeof parsed.acknowledgedBy !== "string" || typeof parsed.acknowledgedAt !== "string") {
    throw new Error(`observer acknowledgment ${ackPath} is missing acknowledgedBy/acknowledgedAt`);
  }
  return {
    observerSha256: parsed.observerSha256,
    acknowledgedBy: parsed.acknowledgedBy,
    acknowledgedAt: parsed.acknowledgedAt,
    ...(typeof parsed.armHead === "string" ? { armHead: parsed.armHead } : {}),
    ...(Array.isArray(parsed.allowedSrcDirty)
      ? {
          allowedSrcDirty: parsed.allowedSrcDirty.filter((v): v is string => typeof v === "string"),
        }
      : {}),
    ...(parsed.observerFiles !== undefined
      ? { observerFiles: parseObserverFiles(parsed.observerFiles, ackPath) }
      : {}),
    ...(parsed.approvedPatchFiles !== undefined
      ? { approvedPatchFiles: parseObserverFiles(parsed.approvedPatchFiles, ackPath) }
      : {}),
  };
}

export function computeArmRecord(armRoot: string, ack?: ObserverAckRecord): ArmRecord {
  const gitDir = join(armRoot, ".git");
  const gitHead = existsSync(gitDir) ? (git(armRoot, ["rev-parse", "HEAD"])?.trim() ?? null) : null;
  const statusOutput =
    gitHead === null ? null : git(armRoot, ["status", "--porcelain=v1", "-z", "--", "src"]);
  const gitDirtySrc: string[] = [];
  if (statusOutput !== null) {
    for (const record of statusOutput.split("\0")) {
      if (!record) continue;
      const path = record.slice(3);
      if (path) gitDirtySrc.push(path);
    }
  }
  const observer = hashFile(join(armRoot, OBSERVER_PATH));
  const observerFiles: ArmArtifactHash[] = [];
  for (const expected of ack?.observerFiles ?? []) {
    const hashed = hashFile(join(armRoot, expected.path));
    // Record the acknowledged relative path so the evidence stays comparable
    // to the acknowledgment across machines and arm roots.
    if (hashed) observerFiles.push({ ...hashed, path: expected.path });
  }
  // Full approved-patch set (the acknowledgment's 114 files): re-hash every
  // path in the arm and record the exact mismatches, so every launch carries
  // the same 114-hash evidence the standalone verifier produces.
  const approvedPatchFiles = ack?.approvedPatchFiles ?? [];
  const approvedHashMismatches: string[] = [];
  for (const expected of approvedPatchFiles) {
    const actual = hashFile(join(armRoot, expected.path));
    if (!actual) {
      approvedHashMismatches.push(`${expected.path}: missing in arm`);
      continue;
    }
    if (actual.sha256 !== expected.sha256) {
      approvedHashMismatches.push(
        `${expected.path}: arm=${actual.sha256.slice(0, 12)} ack=${expected.sha256.slice(0, 12)}`,
      );
    } else if (expected.bytes !== undefined && actual.bytes !== expected.bytes) {
      approvedHashMismatches.push(
        `${expected.path}: bytes ${String(actual.bytes)} != ${String(expected.bytes)}`,
      );
    }
  }
  const artifacts: ArmArtifactHash[] = [];
  for (const relative of ARTIFACT_PATHS) {
    const hashed = hashFile(join(armRoot, relative));
    if (hashed) artifacts.push(hashed);
  }
  const electronPackage = join(armRoot, "node_modules", "electron", "package.json");
  let electronVersion: string | null = null;
  if (existsSync(electronPackage)) {
    try {
      const parsed = JSON.parse(readFileSync(electronPackage, "utf8")) as { version?: unknown };
      electronVersion = typeof parsed.version === "string" ? parsed.version : null;
    } catch {
      electronVersion = null;
    }
  }
  return {
    armRoot,
    gitHead,
    gitHeadSource: gitHead !== null ? "git" : ack?.armHead ? "ack" : "unknown",
    gitDirtySrc: gitDirtySrc.sort(),
    observerPath: OBSERVER_PATH,
    observerSha256: observer?.sha256 ?? null,
    observerFiles,
    approvedFileCount: approvedPatchFiles.length,
    approvedHashMismatches,
    artifacts,
    nodeVersion: process.version,
    electronVersion,
    recordedAtIso: new Date().toISOString(),
  };
}

/**
 * Throws unless the arm is provably baseline-shaped: the observer file matches
 * the acknowledgment hash, every observer file in the acknowledgment is
 * re-hashed and matches, every dirty `src/` file is in the acknowledgment's
 * allowed set (default: the observer sources and their tests), and the
 * recorded head matches when both sides carry one.
 */
export function assertBaselineArmReady(record: ArmRecord, ack: ObserverAckRecord): void {
  if (record.observerSha256 === null) {
    throw new Error(`arm ${record.armRoot} has no ${record.observerPath}`);
  }
  if (record.observerSha256 !== ack.observerSha256) {
    throw new Error(
      `observer source hash does not match the acknowledgment: arm=${record.observerSha256} ack=${ack.observerSha256}`,
    );
  }
  const acknowledgedFiles = ack.observerFiles ?? [];
  if (acknowledgedFiles.length > 0) {
    if (!acknowledgedFiles.some((file) => file.path === OBSERVER_PATH)) {
      throw new Error(
        `observer acknowledgment lists observerFiles but not the primary ${OBSERVER_PATH}`,
      );
    }
    // Re-hash from disk at gate time: the record is evidence of what was
    // hashed, but the gate must reject the arm as it is now.
    const mismatches: string[] = [];
    for (const expected of acknowledgedFiles) {
      const actual = hashFile(join(record.armRoot, expected.path));
      if (!actual) {
        mismatches.push(`${expected.path}: missing in arm`);
        continue;
      }
      if (actual.sha256 !== expected.sha256) {
        mismatches.push(
          `${expected.path}: arm=${actual.sha256.slice(0, 12)} ack=${expected.sha256.slice(0, 12)}`,
        );
      }
    }
    if (mismatches.length > 0) {
      throw new Error(
        `observer file hashes do not match the acknowledgment (possible A0 edit): ${mismatches.join(", ")}`,
      );
    }
  }
  // Full approved-patch set: every launch re-hashes all acknowledged files and
  // refuses to run on a missing file, a changed hash or a changed byte count.
  if ((ack.approvedPatchFiles?.length ?? 0) > 0 && record.approvedHashMismatches.length > 0) {
    throw new Error(
      `approved patch file hashes do not match the acknowledgment: ${record.approvedHashMismatches
        .slice(0, 10)
        .join(
          ", ",
        )}${record.approvedHashMismatches.length > 10 ? ` (+${String(record.approvedHashMismatches.length - 10)} more)` : ""}`,
    );
  }
  const allowed = new Set(
    ack.allowedSrcDirty ?? [
      OBSERVER_PATH,
      "src/renderer/diagnostics/rendererPerfDiagnostics.test.ts",
      ...acknowledgedFiles.map((file) => file.path),
    ],
  );
  const unexpected = record.gitDirtySrc.filter((path) => !allowed.has(path));
  if (unexpected.length > 0) {
    throw new Error(
      `arm has src/ edits outside the acknowledged observer scope (possible A1/A2): ${unexpected.join(", ")}`,
    );
  }
  if (ack.armHead !== undefined && record.gitHead !== null && ack.armHead !== record.gitHead) {
    throw new Error(
      `arm head ${record.gitHead} does not match the acknowledged head ${ack.armHead}`,
    );
  }
}
