import type { RemoteAccessBindMode } from "@/host/remote/config";
import type { HostBuildIdentity } from "@/shared/hostControlProtocol";
import type { ServerUpgradePhase } from "./serverUpgradeJournal";

export const SERVER_DOCTOR_REPORT_VERSION = 1;

export interface ServerDoctorOptions {
  /** Profile namespace; defaults to PORACODE_BASE_DIR or the default profile. */
  readonly profileNamespace?: string;
  /** Bounded log-file tail included as redacted recent errors. */
  readonly logFile?: string;
  /** Authenticated control-call deadline; bounded by the control client. */
  readonly controlTimeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Injectable bundle directory for tests; production uses __dirname. */
  readonly libDir?: string;
  readonly now?: Date;
}

export interface ServerDoctorCheck {
  readonly name: string;
  readonly status: "ok" | "warn" | "error";
  readonly detail: string;
}

export interface ServerDoctorReport {
  readonly formatVersion: typeof SERVER_DOCTOR_REPORT_VERSION;
  readonly generatedAt: string;
  readonly profile: {
    readonly namespaceInput: string;
    readonly profileNamespace: string;
    readonly dataRoot: string;
    readonly electronUserDataRoot: string;
    readonly leasePath: string;
    readonly dataFencePath: string;
    readonly dataRootPresent: boolean;
    readonly stateDatabasePresent: boolean;
  };
  readonly rootManifest: {
    readonly source: string;
    readonly activation: string;
    readonly createdAt: string;
  } | null;
  readonly lease: {
    readonly ownerRecord: {
      readonly generation: string;
      readonly kind: string;
      readonly phase: string;
      readonly pid: number;
      readonly pidAlive: boolean;
      readonly startedAt: string;
    } | null;
    readonly kernelLock: LeaseKernelLockProbe;
  };
  readonly credentials: {
    readonly mode: string | null;
    readonly keyFile: string | null;
    readonly fingerprintPrefix: string | null;
    readonly environmentKeyConfigured: boolean;
    readonly error: string | null;
  };
  readonly remoteAccess: {
    readonly configuredHost: string | null;
    readonly configuredPort: number | null;
    /** The effective bind resolution (Gate 6 item 4.1): the named exposure
     * mode the listener would/starts with, the host it binds, and the
     * plaintext-LAN refusal when the all-interfaces bind lacks its
     * acknowledgement. */
    readonly bind: {
      readonly mode: RemoteAccessBindMode;
      readonly effectiveHost: string;
      readonly source: "default" | "bind-mode" | "explicit-host";
      readonly plaintextLanAcknowledged: boolean;
      readonly refusal: string | null;
    };
    readonly discovery: { readonly port: number; readonly ownerGeneration: string } | null;
    readonly discoveryError: string | null;
    readonly liveStatus:
      | {
          readonly reachable: true;
          readonly mode: string;
          readonly state: string;
          readonly endpoint: string | null;
          readonly ownerGeneration: string;
          readonly capabilities: {
            readonly ssh: boolean;
            readonly computerUse: boolean;
          };
          /**
           * D4: true when the owner answered the additive authenticated status
           * operation. False means a pre-D4 owner: it can be drained, but its
           * build identity is not provable.
           */
          readonly statusSupported: boolean;
          readonly admission: "held" | "open" | null;
          readonly build: HostBuildIdentity | null;
        }
      | { readonly reachable: false; readonly error: string };
  };
  /**
   * D4 migration rollback classification of THIS build's registry. The
   * upgrader reads it from the candidate's `doctor --json` output instead of
   * classifying a newer candidate from its own stale registry.
   */
  readonly migrations: {
    readonly latestSchemaVersion: number;
    readonly rollbackCompatibleThrough: number;
    readonly forwardOnly: readonly { readonly version: number; readonly name: string }[];
    readonly registry: readonly {
      readonly version: number;
      readonly name: string;
      readonly rollback: string;
    }[];
  };
  /**
   * D4: the per-prefix upgrade journal. "absent" is the only state with no
   * admission consequence; "ok" reports a readable phase, and
   * "unreadable"/"invalid" means releases under the prefix hold admission
   * until an operator resolves the journal.
   */
  readonly upgradeJournal:
    | { readonly state: "absent" }
    | {
        readonly state: "ok";
        readonly prefix: string;
        readonly phase: ServerUpgradePhase;
        readonly releaseId: string;
        readonly releaseDir: string;
        readonly updatedAt: string;
        readonly expectedVersion: string | null;
        readonly backupPath: string | null;
        readonly forwardOnlyMigration: boolean;
        readonly terminal: boolean;
      }
    | {
        readonly state: "unreadable" | "invalid";
        readonly path: string;
        readonly reason: string;
      };
  readonly hostServices: {
    readonly ssh: { readonly enabled: boolean; readonly reason: string };
    readonly computerUse: { readonly enabled: boolean; readonly reason: string };
  };
  readonly versions: {
    readonly nodeVersion: string;
    readonly platform: string;
    readonly arch: string;
    readonly appVersion: string;
    /** Where `appVersion` came from: immutable artifact metadata wins. */
    readonly versionSource: string;
    readonly remoteProtocolVersion: number;
    readonly hostControlProtocolVersion: number;
    readonly runtimeBuildSourceHash: string;
    readonly layout:
      | {
          readonly layoutVersion: number;
          readonly kind: string;
          readonly root: string;
          readonly libDir: string;
          readonly resourcesDir: string;
        }
      | { readonly error: string };
  };
  readonly recentErrors: {
    readonly source: string | null;
    readonly truncated: boolean;
    readonly lines: readonly string[];
  };
  readonly checks: readonly ServerDoctorCheck[];
}

export type LeaseKernelLockProbe =
  | { readonly state: "locked"; readonly detail: string }
  | { readonly state: "free"; readonly detail: string }
  | { readonly state: "skipped-same-process"; readonly detail: string }
  | { readonly state: "unavailable"; readonly detail: string };

export interface TextFileTail {
  readonly text: string;
  readonly truncated: boolean;
  readonly totalBytes: number;
}

export interface CredentialSnapshot {
  readonly mode: string | null;
  readonly keyFile: string | null;
  readonly fingerprintPrefix: string | null;
  readonly error: string | null;
}
