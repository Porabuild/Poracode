import { resolveRemoteAccessBind } from "@/host/remote/config";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { resolveServerResourceDirs, type ServerInstallLayout } from "./serverInstallLayout";
import type {
  CredentialSnapshot,
  LeaseKernelLockProbe,
  ServerDoctorCheck,
  ServerDoctorReport,
} from "./serverDoctorTypes";
import { isPidAlive } from "./serverDoctorIo";

export function describeHostServices(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly layout: ServerInstallLayout | { readonly error: string };
  readonly liveStatus: ServerDoctorReport["remoteAccess"]["liveStatus"];
}): ServerDoctorReport["hostServices"] {
  let agentPluginsDir: string | undefined;
  let computerUseHelperRoot: string | undefined;
  if (!("error" in input.layout)) {
    try {
      const dirs = resolveServerResourceDirs({ env: input.env, layout: input.layout });
      agentPluginsDir = dirs.agentPluginsDir;
      computerUseHelperRoot = dirs.computerUseHelperRoot;
    } catch {
      // Layout without required wsl-helpers still reports host-service absence.
    }
  }
  const layoutSsh = describeStagedCapability(
    "SSH agent-plugins",
    agentPluginsDir,
    "PORACODE_AGENT_PLUGINS_DIR",
  );
  const layoutComputerUse = describeStagedCapability(
    "computer-use helper",
    computerUseHelperRoot,
    "PORACODE_COMPUTER_USE_HELPER_ROOT",
  );
  if (input.liveStatus.reachable) {
    return {
      ssh: {
        enabled: input.liveStatus.capabilities.ssh,
        reason: input.liveStatus.capabilities.ssh
          ? `Live owner declares ssh: true (${layoutSsh.reason})`
          : `Live owner declares ssh: false (${layoutSsh.reason})`,
      },
      computerUse: {
        enabled: input.liveStatus.capabilities.computerUse,
        reason: input.liveStatus.capabilities.computerUse
          ? `Live owner declares computerUse: true (${layoutComputerUse.reason})`
          : `Live owner declares computerUse: false (${layoutComputerUse.reason})`,
      },
    };
  }
  return { ssh: layoutSsh, computerUse: layoutComputerUse };
}

function describeStagedCapability(
  label: string,
  dir: string | undefined,
  envName: string,
): { readonly enabled: boolean; readonly reason: string } {
  if (dir !== undefined) {
    return { enabled: true, reason: `${label} staged at ${dir}` };
  }
  return {
    enabled: false,
    reason: `${label} is absent from the install layout; set ${envName} or ship resources/${
      envName === "PORACODE_AGENT_PLUGINS_DIR" ? "agent-plugins" : "computer-use-helper"
    } so the capability can enable`,
  };
}

export function buildChecks(input: {
  dataRootPresent: boolean;
  rootManifest: { source: string; activation: string; createdAt: string } | null;
  stateDatabasePresent: boolean;
  credentials: CredentialSnapshot;
  ownerRecord: ReturnType<typeof readHostOwnerRecord>;
  kernelLock: LeaseKernelLockProbe;
  bind: ReturnType<typeof resolveRemoteAccessBind>;
  discovery: { port: number; ownerGeneration: string } | null;
  discoveryError: string | null;
  liveStatus: ServerDoctorReport["remoteAccess"]["liveStatus"];
  layout: ServerInstallLayout | { readonly error: string };
  hostServices: ServerDoctorReport["hostServices"];
  logSource: string | null;
}): ServerDoctorCheck[] {
  const checks: ServerDoctorCheck[] = [];

  checks.push(
    !("error" in input.layout)
      ? {
          name: "install-layout",
          status: "ok",
          detail: `Resolved ${input.layout.kind} layout at ${input.layout.root}.`,
        }
      : { name: "install-layout", status: "error", detail: input.layout.error },
  );

  checks.push({
    name: "ssh-capability",
    status: input.hostServices.ssh.enabled ? "ok" : "warn",
    detail: input.hostServices.ssh.reason,
  });
  checks.push({
    name: "computer-use-capability",
    status: input.hostServices.computerUse.enabled ? "ok" : "warn",
    detail: input.hostServices.computerUse.reason,
  });

  // Names the effective exposure mode (Gate 6 item 4.1) and warns on every
  // plaintext exposure beyond loopback; a refused bind is an error.
  {
    const bind = input.bind;
    const exposure =
      bind.mode === "lan"
        ? `plaintext LAN (bound to ${bind.host})`
        : bind.mode === "tailnet"
          ? `plaintext tailnet (bound to ${bind.host})`
          : `loopback (bound to ${bind.host})`;
    checks.push(
      bind.refusalReason !== null
        ? {
            name: "bind-exposure",
            status: "error",
            detail: bind.refusalReason,
          }
        : {
            name: "bind-exposure",
            status: bind.mode === "loopback" ? "ok" : "warn",
            detail:
              bind.mode === "loopback"
                ? `Remote access exposure: ${exposure}.`
                : `Remote access exposure: ${exposure}${
                    bind.plaintextLanAcknowledged && bind.mode === "lan"
                      ? " — plaintext LAN exposure acknowledged (PORACODE_ALLOW_PLAINTEXT_LAN=1); TLS is not configured yet."
                      : " over plaintext; TLS is not configured yet."
                  }`,
          },
    );
  }

  if (!input.dataRootPresent) {
    checks.push({
      name: "owned-root",
      status: "warn",
      detail: "The owned root has not been created yet; the profile was never started.",
    });
  } else if (input.rootManifest === null) {
    checks.push({
      name: "owned-root",
      status: "error",
      detail: "The owned root exists but its host-root manifest is missing or unreadable.",
    });
  } else {
    checks.push({
      name: "owned-root",
      status: "ok",
      detail: `Owned root present (${input.rootManifest.source}, ${input.rootManifest.activation})${
        input.stateDatabasePresent ? " with its database." : " without a database."
      }`,
    });
  }

  const lease = input.ownerRecord;
  const pidAlive = lease !== null && isPidAlive(lease.pid);
  if (lease === null) {
    checks.push({
      name: "owner-lease",
      status: input.kernelLock.state === "locked" ? "error" : "ok",
      detail:
        input.kernelLock.state === "locked"
          ? "The kernel lock is held but no owner record matches this profile."
          : "No owner holds this profile.",
    });
  } else if (pidAlive && input.kernelLock.state === "locked") {
    checks.push({
      name: "owner-lease",
      status: "ok",
      detail: `Live ${lease.kind} owner (phase ${lease.phase}, pid ${lease.pid}).`,
    });
  } else if (pidAlive && input.kernelLock.state === "skipped-same-process") {
    checks.push({
      name: "owner-lease",
      status: "ok",
      detail: `Owner record is this process (pid ${lease.pid}, phase ${lease.phase}); lock probe skipped.`,
    });
  } else if (input.kernelLock.state === "locked") {
    checks.push({
      name: "owner-lease",
      status: "warn",
      detail: `The kernel lock is held although recorded pid ${lease.pid} is not running; the lock belongs to another process or was orphaned.`,
    });
  } else {
    checks.push({
      name: "owner-lease",
      status: "warn",
      detail: `Stale owner record from ${lease.startedAt}; recorded pid ${lease.pid} is not running.`,
    });
  }

  if (input.credentials.error !== null) {
    checks.push({ name: "credentials", status: "error", detail: input.credentials.error });
  } else if (input.credentials.mode === null) {
    checks.push({
      name: "credentials",
      status: "warn",
      detail: "Credential key is not initialized for this profile.",
    });
  } else {
    checks.push({
      name: "credentials",
      status: input.credentials.mode === "session-only" ? "warn" : "ok",
      detail:
        input.credentials.mode === "session-only"
          ? "Session-only key: persistent credentials are unavailable across restarts."
          : `Credential mode ${input.credentials.mode} (fingerprint ${
              input.credentials.fingerprintPrefix ?? "none"
            }…).`,
    });
  }

  if (input.liveStatus.reachable) {
    checks.push({
      name: "remote-access",
      status: "ok",
      detail: `Authenticated describe answered: ${input.liveStatus.state} at ${
        input.liveStatus.endpoint ?? "no endpoint"
      }.`,
    });
  } else if (input.discovery !== null) {
    checks.push({
      name: "remote-access",
      status: "warn",
      detail: `Discovery records port ${input.discovery.port} but the owner did not answer: ${input.liveStatus.error}`,
    });
  } else {
    checks.push({
      name: "remote-access",
      status: "warn",
      detail: input.discoveryError ?? "No control discovery published; the owner is not running.",
    });
  }

  checks.push(
    input.logSource === null
      ? {
          name: "recent-errors",
          status: "warn",
          detail: "No log file passed; rerun with --log-file <path> to include a redacted tail.",
        }
      : { name: "recent-errors", status: "ok", detail: `Redacted tail of ${input.logSource}.` },
  );
  return checks;
}
