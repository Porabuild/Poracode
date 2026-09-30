import type { BrowserPanelManager } from "@/main/browser";
import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import type {
  RemoteAccessTailscaleStatus,
  StartTailscaleResult,
  SupervisorEvent,
} from "@/shared/ipc";
import type { PoracodePaths } from "@/shared/poracodePaths";
import type { PoracodeChannel } from "@/shared/channel";
import type { RemoteAccessPairingInfo, RemoteGitSummaries } from "@/shared/remote";
import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import type { UserNotification } from "@/shared/threadNotification";
import type { Project } from "@/shared/contracts";
import type { ScheduleService } from "@/host/schedules/ScheduleService";
import type { PrWatchService } from "@/host/prWatch";
import type { GitStateService } from "@/host/gitState";
import type { ImagePreviewGenerator } from "@/host/remote/server/imagePreview";
import type {
  RemoteAccessServer,
  RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";
import type { RemoteBrowserGatewayLike } from "@/host/remote/RemoteBrowserGateway";
import type { EnvironmentRuntimeService } from "@/host/environments/environmentRuntimeService";

export const PRODUCTION_PAIRING_APP_URL: Record<PoracodeChannel, string> = {
  stable: "https://poracode.com",
  nightly: "https://app-nightly.poracode.com",
};

export const PRODUCTION_HOSTED_APP_URLS = [
  "https://app.poracode.com",
  "https://app-nightly.poracode.com",
] as const;

export interface DesktopRemoteAccessControllerOptions {
  readonly appVersion: string;
  readonly channel: PoracodeChannel;
  readonly paths: Pick<PoracodePaths, "baseDir" | "settingsPath">;
  readonly devServerUrl?: string;
  readonly environments?: EnvironmentRuntimeService;
  readonly callSupervisor: RemoteAccessServerOptions["callSupervisor"];
  /** Loopback `/metrics` admission peek; absent omits the field. */
  readonly peekResourceAdmissionStatus?: RemoteAccessServerOptions["peekResourceAdmissionStatus"];
  /** Backend-owned truncate: one DB mutation + one `runtime.truncated` publication. */
  readonly truncateThreadRuntime: RemoteAccessServerOptions["truncateThreadRuntime"];
  /**
   * B1 durable-gap recovery port (descriptor read, durable notice read, bounded
   * live-scoping lookup, acknowledgement). Present only on a composition whose
   * backend host owns the durable store; the server advertises the capability
   * only then. Never routed through supervisor-event persistence.
   */
  readonly runtimeHistoryGap?: RemoteAccessServerOptions["runtimeHistoryGap"];
  /** Backend-owned compound checkpoint revert (WS2), refusal-mapped to 409. */
  readonly revertCheckpoint?: RemoteAccessServerOptions["revertCheckpoint"];
  /**
   * Embedded-desktop experiment authority (custody + confirmed retirement).
   * Present only on the desktop composition; its presence is what advertises
   * `capabilities.experiments` and composes the `/api/experiments` routes.
   */
  readonly experimentAuthority?: RemoteAccessServerOptions["experimentAuthority"];
  readonly dispatchThreadCommand: NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>;
  readonly getBrowserPanelManager?: () => BrowserPanelManager | null;
  readonly browser?: RemoteBrowserGatewayLike;
  /**
   * The composition's settings authority writes. Every patch the controller
   * persists commits through it as scoped compare-and-swap edits; a conflict
   * that survives the bounded rebase rejects loudly instead of silently
   * clobbering the concurrent writer. The committed broadcast happens in the
   * authority's `onCommitted` hook, so there is no separate notify here.
   */
  readonly settingsWrites: {
    commitCompatPatch(patch: {
      [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
    }): Promise<SharedSettings>;
    editSettingsField<F extends keyof SharedSettings>(
      field: F,
      compute: (current: SharedSettings) => SharedSettings[F] | undefined,
    ): Promise<SettingsMutationResult>;
  };
  readonly notifyRemoteAccessPairingChanged: (info: RemoteAccessPairingInfo) => void;
  /** Publish a project-set change through the composition's membership flow
   * (the bounded `remote-projects-changed` WS event); used by host-local
   * writers outside the HTTP command routes, e.g. project-scoped MCP settings.
   * The full `Project[]` argument is the authoritative read the composition
   * converts to the wire-safe membership payload. */
  readonly notifyProjectStateChanged: (projects: readonly Project[]) => void;
  readonly notifyUserNotification?: (notification: UserNotification) => void;
  readonly notifyEventInterestsChanged: NonNullable<
    RemoteAccessServerOptions["onEventInterestsChanged"]
  >;
  readonly reportError: (error: unknown, tags?: PoracodeDiagnosticTags) => void;
  readonly scheduleService: ScheduleService;
  readonly prWatchService: PrWatchService;
  readonly gitStateService: GitStateService;
  readonly updates: NonNullable<RemoteAccessServerOptions["updates"]>;
  readonly imagePreviewGenerator?: ImagePreviewGenerator;
  /**
   * V6 C.2: host-declared capabilities published on GET /api/host/describe.
   * Main supplies the snapshot that matches composeHostServices.
   */
  readonly hostCapabilities?: import("@/shared/hostControlProtocol").HostServiceCapabilities;
}

export interface DesktopRemoteAccessController {
  getServer(): RemoteAccessServer | null;
  handleSupervisorEvent(event: SupervisorEvent): void;
  /** The supervisor process restarted; its in-session state is gone. */
  handleSupervisorReset(): void;
  updateGitSummaries(summaries: RemoteGitSummaries): void;
  /** Always-on readiness (V5 plan 2.5 completion): starts the server
   * unconditionally — full bind when remote access is enabled, loopback-only
   * otherwise. Resolves once the managed flavor has its loopback server. */
  startIfEnabled(): Promise<void>;
  setEnabled(enabled: boolean): Promise<RemoteAccessPairingInfo>;
  /** The USER-FACING pairing surface: reports `disabled` while only the
   * always-on loopback instance runs, so the server stays undiscoverable. */
  getPairingInfo(): RemoteAccessPairingInfo;
  /** True when the user actually enabled remote access (not the always-on
   * loopback-only instance). QR/advertise surfaces gate on this. */
  isUserEnabled(): boolean;
  /**
   * The managed renderer's attach payload (V5 plan 2.5 completion): resolves
   * only behind readiness — the loopback server is running and a fresh
   * single-use credential is minted BEFORE the renderer asks. `null` when
   * disposed or no server can run.
   */
  getManagedLoopbackBootstrap(): Promise<ManagedLoopbackBootstrap | null>;
  getTailscaleStatus(): Promise<RemoteAccessTailscaleStatus>;
  setTailscaleHttps(enabled: boolean): Promise<RemoteAccessPairingInfo>;
  startTailscale(): Promise<StartTailscaleResult>;
  setAdvertisedUrl(url: string): Promise<RemoteAccessPairingInfo>;
  /** Stop admission and join current and previously retiring remote work. */
  dispose(): Promise<void>;
}

export class RemoteAccessStartSupersededError extends Error {
  constructor() {
    super("Remote access startup was superseded.");
    this.name = "RemoteAccessStartSupersededError";
  }
}

const CREDENTIAL_TOKEN_PREFIXES = ["lc_pair_", "lc_access_", "lc_ws_"] as const;

/**
 * Elides the live credential from a pairing URL so the URL is safe for the
 * console log (the headless CLI never prints raw tokens either). Recognized
 * `lc_*_` prefixes are kept so the redacted value still reads as a credential;
 * anything else (or an unparseable URL) is redacted whole.
 */
export function redactPairingUrlForLog(pairingUrl: string): string {
  const parts = parsePairingUrlParts(pairingUrl);
  if (!parts) return "<pairing URL redacted>";
  const prefix = CREDENTIAL_TOKEN_PREFIXES.find((candidate) => parts.token.startsWith(candidate));
  parts.url.hash = `#token=${prefix ?? ""}[redacted]`;
  return parts.url.toString();
}

export function remoteAccessStartupDiagnostic(
  error: unknown,
  channel: PoracodeChannel,
): { error: unknown; tags: PoracodeDiagnosticTags } {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : null;
  if (code === "EADDRINUSE") {
    const diagnostic = new Error("Remote access server port remained unavailable after retries.");
    diagnostic.name = "RemoteAccessPortConflictError";
    return {
      error: diagnostic,
      tags: {
        "poracode.feature_area": "remote-access",
        "poracode.channel": channel,
        "poracode.platform":
          process.platform === "darwin" ||
          process.platform === "linux" ||
          process.platform === "win32"
            ? process.platform
            : "other",
        "event.origin": "remote-access.listen.port-conflict",
      },
    };
  }
  return { error, tags: { "poracode.feature_area": "remote-access" } };
}
