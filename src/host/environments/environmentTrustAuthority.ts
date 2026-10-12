import {
  SshHostKeyTrust,
  type SshHostKeyObservation,
  type SshHostKeyProbe,
  type SshHostKeyTrustOptions,
  type SshResolvedTarget,
} from "@/host/ssh/sshHostKeyTrust";

/**
 * The trust surface the environment runtime service consumes. The default
 * adapter is `SshHostKeyTrust` over a tracked command runner; tests and other
 * compositions can substitute their own authority without changing the
 * lifecycle logic (probe → explicit acceptance or system trust → strict
 * enforcement).
 */
export interface EnvironmentTrustAuthority {
  resolveTarget(
    connection: { readonly target: string; readonly port?: number },
    signal?: AbortSignal,
  ): Promise<SshResolvedTarget>;
  probe(target: SshResolvedTarget, signal?: AbortSignal): Promise<SshHostKeyProbe>;
  readSystemTrust(
    target: SshResolvedTarget,
    signal?: AbortSignal,
  ): Promise<{
    readonly lookupName: string;
    readonly observations: readonly SshHostKeyObservation[];
  }>;
  knownHostsLine(observation: SshHostKeyObservation, target: SshResolvedTarget): string;
  writeKnownHostsFile(path: string, lines: readonly string[]): Promise<void>;
}

export interface EnvironmentTrustProbeResult {
  readonly fingerprint: string;
  readonly keyType: string;
  readonly host: string;
  readonly port: number;
  readonly lookupName: string;
}

export function createEnvironmentTrustAuthority(
  options: SshHostKeyTrustOptions,
): EnvironmentTrustAuthority {
  const trust = new SshHostKeyTrust(options);
  return {
    resolveTarget: (connection, signal) => trust.resolveTarget(connection, signal),
    probe: (target, signal) => trust.probe(target, signal),
    readSystemTrust: (target, signal) => trust.readSystemTrust(target, signal),
    knownHostsLine: (observation, target) => trust.knownHostsLine(observation, target),
    writeKnownHostsFile: (path, lines) => trust.writeKnownHostsFile(path, lines),
  };
}
