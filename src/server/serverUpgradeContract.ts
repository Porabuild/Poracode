import type { ChildProcess } from "node:child_process";
import type { HostControlStatusResult } from "@/shared/hostControlProtocol";
import type { RunningOwnerProbe } from "./serverUpgradeIdentity";
import type { CandidateMigrationPolicy } from "./serverUpgradeMigrationPolicy";
import type { ServerServiceTarget } from "./serverUpgradeRestart";

/**
 * D4 upgrade contract shared by the orchestration, the recovery entry points
 * and the CLI. Extracted from `serverUpgrade.ts` so the resume/abandon path
 * can use the same IO and result shapes without importing the orchestrator.
 */

export const UPGRADE_USAGE =
  "Usage: poracode-server upgrade (--from <tarball> | --resume [--from <tarball>] | " +
  "--abandon-journal --confirm) [--prefix <path>] [--json]";

export interface UpgradeCliOptions {
  /** Tarball to stage; empty when only resuming an already-staged release. */
  readonly from: string;
  readonly prefix: string;
  readonly json: boolean;
  /**
   * Deadline for the restarted candidate to prove its identity, be admitted
   * and reach the ready state. Also bounds the drain/restore joins.
   */
  readonly healthTimeoutMs?: number;
  /** Explicit recovery of an interrupted upgrade journal. */
  readonly resume?: boolean;
  /** Explicit removal of an interrupted upgrade journal. */
  readonly abandonJournal?: boolean;
  /** Required confirmation for post-drain resume and for journal abandonment. */
  readonly confirm?: boolean;
}

export function parseUpgradeCliOptions(args: readonly string[]): UpgradeCliOptions {
  let from: string | undefined;
  let prefix = "/opt/poracode";
  let json = false;
  let resume = false;
  let abandonJournal = false;
  let confirm = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--resume") {
      resume = true;
    } else if (argument === "--abandon-journal") {
      abandonJournal = true;
    } else if (argument === "--confirm") {
      confirm = true;
    } else if (argument === "--from" || argument === "--prefix") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(UPGRADE_USAGE);
      if (argument === "--from") from = value;
      else prefix = value;
      index += 1;
    } else {
      throw new Error(UPGRADE_USAGE);
    }
  }
  if (resume && abandonJournal) throw new Error(UPGRADE_USAGE);
  if (abandonJournal && !confirm) throw new Error(UPGRADE_USAGE);
  if (!resume && !abandonJournal && from === undefined) throw new Error(UPGRADE_USAGE);
  if (!resume && !abandonJournal && confirm) throw new Error(UPGRADE_USAGE);
  return {
    from: from ?? "",
    prefix,
    json,
    ...(resume ? { resume: true } : {}),
    ...(abandonJournal ? { abandonJournal: true } : {}),
    ...(confirm ? { confirm: true } : {}),
  };
}

export type UpgradeOutcome = "upgraded" | "unchanged" | "rolled-back" | "recovery-required";

export interface UpgradeResult {
  readonly ok: boolean;
  readonly prefix: string;
  readonly current: string;
  readonly previous: string | null;
  readonly rolledBack: boolean;
  readonly outcome: UpgradeOutcome;
  readonly detail: string;
  readonly releaseId: string;
  readonly releaseDir: string | null;
  readonly backupPath: string | null;
  /** True when an explicit `--resume`/recovery path produced this result. */
  readonly resumed: boolean;
  readonly migration: {
    readonly currentSchemaVersion: number | null;
    readonly latestSchemaVersion: number | null;
    readonly forwardOnly: readonly number[];
  };
}

export interface UpgradeDoctorResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly migrations: CandidateMigrationPolicy | null;
}

export interface UpgradeCandidateStatus {
  readonly ownerGeneration: string;
  readonly status: HostControlStatusResult;
}

export interface UpgradeCandidateHandle {
  readonly child: ChildProcess | null;
  readonly target: ServerServiceTarget;
}

export interface UpgradeIo {
  readonly stage: (tarball: string, releaseDir: string) => void;
  readonly doctor: (releaseDir: string) => UpgradeDoctorResult;
  readonly probeOwner: () => Promise<RunningOwnerProbe | null>;
  readonly stopOwner: (prefix: string, probe: RunningOwnerProbe) => Promise<void>;
  readonly captureBackup: (destination: string) => Promise<void>;
  readonly readSchemaVersion: () => number | null;
  readonly writeCurrent: (prefix: string, releaseDir: string) => void;
  readonly removeCurrent: (prefix: string) => void;
  readonly startCandidate: (input: {
    readonly prefix: string;
    readonly staging: boolean;
  }) => Promise<UpgradeCandidateHandle>;
  readonly candidateStatus: () => Promise<UpgradeCandidateStatus>;
  readonly admitCandidate: (expected: {
    readonly version: string;
    readonly entrypointSha256: string;
  }) => Promise<UpgradeCandidateStatus>;
  readonly stopCandidate: (handle: UpgradeCandidateHandle | null) => Promise<void>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export const DEFAULT_QUALIFICATION_TIMEOUT_MS = 30_000;
export const OWNER_POLL_MS = 200;
export const OWNER_STOP_TIMEOUT_MS = 15_000;

export class UpgradeRefusedError extends Error {
  readonly code = "SERVER_UPGRADE_REFUSED";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpgradeRefusedError";
  }
}

export class UpgradeInProgressError extends Error {
  readonly code = "SERVER_UPGRADE_IN_PROGRESS";

  constructor(
    readonly prefix: string,
    readonly phase: string,
    readonly releaseDir: string,
    remediation = "Resolve it with: poracode-server upgrade --resume [--from <tarball>] " +
      "(pre-drain phases), or poracode-server upgrade --abandon-journal --confirm after " +
      "verifying no upgrade must be kept.",
  ) {
    super(
      `A previous upgrade of ${prefix} did not finish (phase ${phase}, release ${releaseDir}). ` +
        `Inspect upgrade-journal.json and the running owner. ${remediation}`,
    );
    this.name = "UpgradeInProgressError";
  }
}

/**
 * The journal exists but cannot be read or is not the current format. This is
 * a refusal, not an absent journal: neither the staged release nor the phase
 * is knowable, so no promotion/rollback decision can be made.
 */
export class UpgradeJournalUnreadableError extends Error {
  readonly code = "SERVER_UPGRADE_JOURNAL_UNREADABLE";

  constructor(
    readonly prefix: string,
    readonly detail: string,
  ) {
    super(
      `The upgrade journal for ${prefix} is present but unusable (${detail}). Refusing to ` +
        "start, stage or roll back an upgrade from an unreadable journal. Inspect it with " +
        "`poracode-server doctor [--json]`; a service-managed release under " +
        "`<prefix>/releases/` stays non-admitting until you resolve it with " +
        "`poracode-server upgrade --resume` or remove it with " +
        "`poracode-server upgrade --abandon-journal --confirm`. An unusable journal cannot be " +
        "authenticated: --confirm is an explicit operator override, not evidence that no server " +
        "process is running.",
    );
    this.name = "UpgradeJournalUnreadableError";
  }
}

/** An explicit recovery action refused because the authenticated evidence did not match. */
export class UpgradeRecoveryRefusedError extends Error {
  readonly code = "SERVER_UPGRADE_RECOVERY_REFUSED";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpgradeRecoveryRefusedError";
  }
}
