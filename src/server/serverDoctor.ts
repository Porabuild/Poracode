import { join } from "node:path";
import { HOST_CONTROL_PROTOCOL_VERSION } from "@/shared/hostControlProtocol";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { resolveRemoteAccessBind } from "@/host/remote/config";
import { describeMigrationRollbackPolicy } from "@/host/db/migrations";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { requestHostStatusFromRunningServer } from "./pairingControl";
import { resolveServerInstallLayout, type ServerInstallLayout } from "./serverInstallLayout";
import { resolveServerVersion } from "./serverVersion";
import { buildChecks, describeHostServices } from "./serverDoctorChecks";
import {
  isTerminalUpgradePhase,
  readServerUpgradeJournalState,
  resolveUpgradePrefixForLayout,
  type ServerUpgradeJournalRead,
} from "./serverUpgradeJournal";
import {
  isPidAlive,
  presentDirectory,
  presentFile,
  probeLeaseKernelLock,
  readCredentialSnapshot,
  readDiscoverySnapshot,
  readRootManifestSnapshot,
  redactDiagnosticLine,
  RECENT_ERRORS_MAX_LINES,
  tailTextFile,
} from "./serverDoctorIo";
import {
  SERVER_DOCTOR_REPORT_VERSION,
  type LeaseKernelLockProbe,
  type ServerDoctorCheck,
  type ServerDoctorOptions,
  type ServerDoctorReport,
  type TextFileTail,
} from "./serverDoctorTypes";

export { SERVER_DOCTOR_REPORT_VERSION, probeLeaseKernelLock, redactDiagnosticLine, tailTextFile };
export type {
  LeaseKernelLockProbe,
  ServerDoctorCheck,
  ServerDoctorOptions,
  ServerDoctorReport,
  TextFileTail,
};

/**
 * Read-only `doctor` diagnostics for a standalone-server profile. The doctor is
 * an unprivileged reporter: it never acquires the owner lease, never writes,
 * and never opens the leased SQLite inode from inside an owning process
 * (docs/HOST_OWNERSHIP.md). Operating data is reported, secrets never are.
 */

/**
 * Collect the full report. The authenticated control call is attempted only to
 * observe the running owner; any failure degrades to an unreachable status.
 */
export async function collectServerDoctorReport(
  options: ServerDoctorOptions = {},
): Promise<ServerDoctorReport> {
  const env = options.env ?? process.env;
  const namespaceInput =
    options.profileNamespace?.trim() || env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  const paths = resolveHostRootPaths(namespaceInput);

  const ownerRecord = readHostOwnerRecord(paths);
  const kernelLock = probeLeaseKernelLock(paths, ownerRecord?.pid);
  const credentials = readCredentialSnapshot(paths);
  const discoverySnapshot = readDiscoverySnapshot(paths);
  const rootManifest = readRootManifestSnapshot(paths);
  // The bind resolution never throws (refusals are reported, not raised) —
  // the doctor stays an unprivileged reporter even for a refused config.
  const bind = resolveRemoteAccessBind({ env });

  let liveStatus: ServerDoctorReport["remoteAccess"]["liveStatus"];
  try {
    const status = await requestHostStatusFromRunningServer(namespaceInput, {
      timeoutMs: options.controlTimeoutMs ?? 2_000,
    });
    type ReachableLiveStatus = Extract<
      ServerDoctorReport["remoteAccess"]["liveStatus"],
      { reachable: true }
    >;
    const reachable: { -readonly [K in keyof ReachableLiveStatus]: ReachableLiveStatus[K] } = {
      reachable: true,
      mode: status.description.mode,
      state: status.description.state,
      endpoint: status.description.endpoint,
      ownerGeneration: status.ownerGeneration,
      capabilities: {
        ssh: status.description.capabilities.ssh,
        computerUse: status.description.capabilities.computerUse,
      },
      statusSupported: false,
      admission: null,
      build: null,
    };
    // D4 additive identity probe: a pre-D4 owner answers 400 and stays
    // `statusSupported: false`; any other failure leaves the identity unknown
    // rather than guessing.
    try {
      const live = await callHostControl(paths, "status", {
        timeoutMs: options.controlTimeoutMs ?? 2_000,
      });
      reachable.statusSupported = true;
      reachable.admission = live.result.admission;
      reachable.build = live.result.build;
    } catch {
      // Pre-D4 owner or unavailable status: describe already reported liveness.
    }
    liveStatus = reachable;
  } catch (error) {
    liveStatus = {
      reachable: false,
      error: redactDiagnosticLine(error instanceof Error ? error.message : String(error)),
    };
  }

  let layout: ServerInstallLayout | { readonly error: string };
  try {
    layout = resolveServerInstallLayout(
      options.libDir === undefined ? {} : { libDir: options.libDir },
    );
  } catch (error) {
    layout = {
      error: redactDiagnosticLine(error instanceof Error ? error.message : String(error)),
    };
  }

  let recentErrors: ServerDoctorReport["recentErrors"] = {
    source: null,
    truncated: false,
    lines: [],
  };
  if (options.logFile !== undefined) {
    const tail = tailTextFile(options.logFile);
    recentErrors = tail
      ? {
          source: options.logFile,
          truncated: tail.truncated,
          lines: tail.text
            .split(/\r?\n/u)
            .filter((line) => line.length > 0)
            .slice(-RECENT_ERRORS_MAX_LINES)
            .map(redactDiagnosticLine),
        }
      : { source: options.logFile, truncated: false, lines: [] };
  }

  const hostServices = describeHostServices({
    env,
    layout,
    liveStatus,
  });

  // D4: this build's own rollback classification, published so an upgrader can
  // classify the pending path of the candidate it is about to install.
  const migrationRegistry = describeMigrationRollbackPolicy();
  const forwardOnly = migrationRegistry.filter((entry) => entry.rollback === "forward-only");
  const latestSchemaVersion = migrationRegistry.at(-1)?.version ?? 0;
  const firstForwardOnly = forwardOnly[0]?.version;
  const rollbackCompatibleThrough =
    firstForwardOnly === undefined ? latestSchemaVersion : Math.max(0, firstForwardOnly - 1);
  const migrations: ServerDoctorReport["migrations"] = {
    latestSchemaVersion,
    rollbackCompatibleThrough,
    forwardOnly: forwardOnly.map(({ version, name }) => ({ version, name })),
    registry: migrationRegistry,
  };
  const resolvedLayout = "error" in layout ? undefined : layout;
  // D4: report the interrupted-upgrade journal for the prefix this bundle
  // belongs to. A checkout has no prefix journal; a present-but-unreadable
  // journal is surfaced as such instead of being treated as absent.
  const upgradePrefix =
    resolvedLayout === undefined ? null : resolveUpgradePrefixForLayout(resolvedLayout);
  const upgradeJournal = describeUpgradeJournalReport(
    upgradePrefix === null ? null : readServerUpgradeJournalState(upgradePrefix),
    upgradePrefix,
  );
  const version = resolveServerVersion({
    ...(resolvedLayout !== undefined ? { layout: resolvedLayout } : {}),
    env,
  });

  return {
    formatVersion: SERVER_DOCTOR_REPORT_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    profile: {
      namespaceInput,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      electronUserDataRoot: paths.electronUserDataRoot,
      leasePath: paths.leasePath,
      dataFencePath: paths.dataFencePath,
      dataRootPresent: presentDirectory(paths.dataRoot),
      stateDatabasePresent: presentFile(join(paths.dataRoot, "state.sqlite")),
    },
    rootManifest,
    lease: {
      ownerRecord: ownerRecord
        ? {
            generation: ownerRecord.generation,
            kind: ownerRecord.kind,
            phase: ownerRecord.phase,
            pid: ownerRecord.pid,
            pidAlive: isPidAlive(ownerRecord.pid),
            startedAt: ownerRecord.startedAt,
          }
        : null,
      kernelLock,
    },
    credentials: {
      ...credentials,
      environmentKeyConfigured: Boolean(env.PORACODE_SECRET_STORAGE_KEY?.trim()),
    },
    remoteAccess: {
      configuredHost: env.PORACODE_REMOTE_ACCESS_HOST?.trim() || null,
      configuredPort: env.PORACODE_REMOTE_ACCESS_PORT?.trim()
        ? Number(env.PORACODE_REMOTE_ACCESS_PORT)
        : null,
      bind: {
        mode: bind.mode,
        effectiveHost: bind.host,
        source: bind.source,
        plaintextLanAcknowledged: bind.plaintextLanAcknowledged,
        refusal: bind.refusalReason,
      },
      discovery: discoverySnapshot.discovery,
      discoveryError: discoverySnapshot.error,
      liveStatus,
    },
    versions: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      appVersion: version.version,
      versionSource: version.source,
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      hostControlProtocolVersion: HOST_CONTROL_PROTOCOL_VERSION,
      runtimeBuildSourceHash: RUNTIME_BUILD_SOURCE_HASH,
      layout,
    },
    migrations,
    upgradeJournal,
    hostServices,
    recentErrors,
    checks: buildChecks({
      dataRootPresent: presentDirectory(paths.dataRoot),
      rootManifest,
      stateDatabasePresent: presentFile(join(paths.dataRoot, "state.sqlite")),
      credentials,
      ownerRecord,
      kernelLock,
      bind,
      discovery: discoverySnapshot.discovery,
      discoveryError: discoverySnapshot.error,
      liveStatus,
      layout,
      hostServices,
      migrations,
      upgradeJournal,
      logSource: recentErrors.source,
    }),
  };
}

function describeUpgradeJournalReport(
  read: ServerUpgradeJournalRead | null,
  upgradePrefix: string | null,
): ServerDoctorReport["upgradeJournal"] {
  if (read === null || read.state === "absent") return { state: "absent" };
  if (read.state !== "ok") return { state: read.state, path: read.path, reason: read.reason };
  const journal = read.journal;
  return {
    state: "ok",
    prefix: journal.prefix.length > 0 ? journal.prefix : (upgradePrefix ?? ""),
    phase: journal.phase,
    releaseId: journal.releaseId,
    releaseDir: journal.releaseDir,
    updatedAt: journal.updatedAt,
    expectedVersion: journal.expectedVersion,
    backupPath: journal.backupPath,
    forwardOnlyMigration: journal.forwardOnlyMigration,
    terminal: isTerminalUpgradePhase(journal.phase),
  };
}
