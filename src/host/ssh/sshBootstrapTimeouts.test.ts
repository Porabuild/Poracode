import { describe, expect, it } from "vitest";
import {
  bootstrapRemoteRuntime,
  parseRemoteLaunchOutcome,
  SshBootstrapRefusedError,
  SSH_BOOTSTRAP_LOCK_WAIT_MS,
  SSH_COMMAND_TIMEOUT_MS,
  SSH_INSTALL_LOCK_WAIT_MS,
  SSH_INSTALL_TIMEOUT_MS,
  sshLaunchTimeoutMs,
  sshUpgradeTimeoutMs,
  SSH_UPGRADE_DRAIN_WAIT_MS,
  upgradeRemoteRuntime,
  type RemoteRuntimeTransport,
} from "@/shared/sshBootstrap";

/**
 * C2 report follow-up: the launch lock wait (120 s default) must not exceed
 * the ssh command deadline (60 s). These tests pin the transport deadline to
 * the total lock+start/status budget and prove a held lock surfaces as the
 * typed `owner-busy` refusal instead of a local transport kill.
 */

const HASH = "a".repeat(64);

interface RecordedCall {
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

function recordingTransport(
  launchReply: string,
  probeReply = "ready",
): { transport: RemoteRuntimeTransport; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const transport: RemoteRuntimeTransport = {
    runScript: async (_script, args, timeoutMs) => {
      calls.push({ args, timeoutMs });
      if (args[0] === "connect" || args[0] === "upgrade") return launchReply;
      return probeReply;
    },
    deliverArchive: async () => undefined,
  };
  return { transport, calls };
}

describe("SSH launch deadline covers the lock budget", () => {
  it("leaves a full command timeout of margin beyond the default lock wait", () => {
    expect(sshLaunchTimeoutMs(SSH_BOOTSTRAP_LOCK_WAIT_MS)).toBe(
      SSH_BOOTSTRAP_LOCK_WAIT_MS + SSH_COMMAND_TIMEOUT_MS,
    );
    expect(sshLaunchTimeoutMs(SSH_BOOTSTRAP_LOCK_WAIT_MS)).toBeGreaterThan(
      SSH_BOOTSTRAP_LOCK_WAIT_MS,
    );
    expect(sshLaunchTimeoutMs(600_000)).toBe(660_000);
  });

  it("runs the launch script with the lock-aware deadline, not the plain command timeout", async () => {
    const { transport, calls } = recordingTransport(
      JSON.stringify({
        poracodeLaunchProtocol: 1,
        outcome: "ready",
        remotePort: 4321,
        ownerRuntimeHash: HASH,
        reused: false,
      }),
    );
    await bootstrapRemoteRuntime(transport, "11111111-1111-4111-8111-111111111111", HASH);
    const launch = calls.find((call) => call.args[0] === "connect");
    expect(launch?.timeoutMs).toBe(sshLaunchTimeoutMs(SSH_BOOTSTRAP_LOCK_WAIT_MS));
    expect(launch?.timeoutMs).toBeGreaterThan(SSH_COMMAND_TIMEOUT_MS);
  });

  it("keeps the install deadline above its own lock wait", async () => {
    const { transport, calls } = recordingTransport(
      JSON.stringify({
        poracodeLaunchProtocol: 1,
        outcome: "ready",
        remotePort: 4321,
        ownerRuntimeHash: HASH,
        reused: false,
      }),
      "not-ready",
    );
    await bootstrapRemoteRuntime(transport, "11111111-1111-4111-8111-111111111111", HASH);
    const install = calls.find((call) => call.args[0] === HASH && call.args.length === 3);
    expect(install?.timeoutMs).toBe(SSH_INSTALL_TIMEOUT_MS);
    expect(install?.args[2]).toBe(String(SSH_INSTALL_LOCK_WAIT_MS));
    expect(SSH_INSTALL_TIMEOUT_MS).toBeGreaterThan(SSH_INSTALL_LOCK_WAIT_MS);
  });

  it("propagates a typed owner-busy refusal instead of a premature transport kill", async () => {
    const lockWaitMs = 300_000;
    const { transport, calls } = recordingTransport(
      JSON.stringify({ poracodeLaunchProtocol: 1, outcome: "refused", code: "owner-busy" }),
    );
    const error = await bootstrapRemoteRuntime(
      transport,
      "11111111-1111-4111-8111-111111111111",
      HASH,
      { lockWaitMs },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-busy");
    const launch = calls.find((call) => call.args[0] === "connect");
    expect(launch?.args[3]).toBe(String(lockWaitMs));
    // The transport deadline covers the whole lock wait plus start/status work,
    // so the remote refusal arrives before any local timeout can fire.
    expect(launch?.timeoutMs).toBe(sshLaunchTimeoutMs(lockWaitMs));
    expect(launch!.timeoutMs - SSH_COMMAND_TIMEOUT_MS).toBeGreaterThanOrEqual(lockWaitMs);
  });

  it("covers lock wait, drain, and start in the explicit-upgrade deadline", async () => {
    const lockWaitMs = 540_000;
    const drainWaitMs = 30_000;
    expect(sshUpgradeTimeoutMs(lockWaitMs, drainWaitMs)).toBe(630_000);
    expect(sshUpgradeTimeoutMs(SSH_BOOTSTRAP_LOCK_WAIT_MS, SSH_UPGRADE_DRAIN_WAIT_MS)).toBe(
      SSH_INSTALL_TIMEOUT_MS,
    );
    const { transport, calls } = recordingTransport(
      JSON.stringify({ poracodeLaunchProtocol: 1, outcome: "refused", code: "drain-timeout" }),
    );
    const error = await upgradeRemoteRuntime(
      transport,
      "11111111-1111-4111-8111-111111111111",
      HASH,
      { lockWaitMs, drainWaitMs },
    ).catch((cause: unknown) => cause);
    expect((error as SshBootstrapRefusedError).code).toBe("drain-timeout");
    const launch = calls.find((call) => call.args[0] === "upgrade");
    expect(launch?.timeoutMs).toBe(sshUpgradeTimeoutMs(lockWaitMs, drainWaitMs));
    expect(launch!.timeoutMs - SSH_COMMAND_TIMEOUT_MS).toBeGreaterThanOrEqual(
      lockWaitMs + drainWaitMs,
    );
  });

  it("parses refusals through the shared launch protocol", () => {
    expect(() =>
      parseRemoteLaunchOutcome(
        JSON.stringify({ poracodeLaunchProtocol: 1, outcome: "refused", code: "owner-busy" }),
      ),
    ).toThrowError(SshBootstrapRefusedError);
  });
});
