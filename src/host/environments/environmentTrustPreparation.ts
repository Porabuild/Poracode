import { readFile, rm } from "node:fs/promises";
import type { EnvironmentRecord, EnvironmentTrust } from "@/shared/environments";
import type {
  SshHostKeyObservation,
  SshHostKeyProbe,
  SshKnownHostsPolicy,
  SshResolvedTarget,
} from "@/host/ssh/sshHostKeyTrust";
import type { EnvironmentStore } from "./EnvironmentStore";
import { environmentKnownHostsPath } from "./environmentKnownHosts";
import type { EnvironmentTrustAuthority } from "./environmentTrustAuthority";
import { EnvironmentRuntimeError, environmentRuntimeError } from "./environmentRuntimeErrors";

/**
 * Trust preparation for one host-owned environment (ADR §4).
 *
 * The accepted fingerprint is the *only* trust anchor:
 * - `acceptTrust` writes exactly the accepted observation's known-hosts line,
 *   even when the probe offered several keys;
 * - an adopted system known-hosts entry records and writes exactly the one
 *   adopted observation;
 * - a recorded pin/observation is matched against every offered observation
 *   (a pinned key type need not be the probe's preferred one), and the
 *   per-environment file is rewritten to exactly that line when it differs,
 *   so stale or unaccepted material never survives a verified connect.
 *
 * Every file replacement goes through `writeKnownHostsFile` (atomic replace).
 */
export interface EnvironmentTrustContext {
  readonly resolved: SshResolvedTarget;
  readonly knownHostsPath: string;
  readonly trust: EnvironmentTrust;
  readonly accepted: SshHostKeyObservation;
}

export interface EnvironmentTrustProbeResult {
  readonly fingerprint: string;
  readonly keyType: string;
  readonly host: string;
  readonly port: number;
  readonly lookupName: string;
}

export interface EnvironmentTrustPreparationDeps {
  readonly store: Pick<EnvironmentStore, "dataRoot">;
  readonly trust: EnvironmentTrustAuthority;
  /**
   * Runtime-owned observation write with internal CAS retry. Returns the
   * updated record so the caller continues from the recorded fingerprint.
   */
  readonly recordObservedTrust: (
    environmentId: string,
    observedFingerprint: string,
  ) => Promise<EnvironmentRecord>;
  /** Explicit manage pin write with the caller's strict expectedRevision. */
  readonly pinTrust: (
    environmentId: string,
    expectedRevision: number,
    fingerprint: string,
  ) => Promise<EnvironmentRecord>;
}

export class EnvironmentTrustPreparation {
  constructor(private readonly deps: EnvironmentTrustPreparationDeps) {}

  async probe(
    record: EnvironmentRecord,
    signal?: AbortSignal,
  ): Promise<EnvironmentTrustProbeResult> {
    const resolved = await this.resolve(record, signal);
    const probe = await this.probeOrThrow(resolved, signal);
    return {
      fingerprint: probe.preferred.fingerprint,
      keyType: probe.preferred.keyType,
      host: resolved.host,
      port: resolved.port,
      lookupName: resolved.lookupName,
    };
  }

  /**
   * Establish the trust context for an authenticated connect: adopt a trusted
   * system entry (recording and writing only that observation), or enforce the
   * recorded pin/observation against the live probe, pruning any other key
   * material from the per-environment file.
   */
  async prepare(record: EnvironmentRecord, signal?: AbortSignal): Promise<EnvironmentTrustContext> {
    const resolved = await this.resolve(record, signal);
    const knownHostsPath = environmentKnownHostsPath(
      this.deps.store.dataRoot,
      record.environmentId,
    );
    let trust = record.trust;
    if (trust.state === "unknown") {
      let systemTrust;
      try {
        systemTrust = await this.deps.trust.readSystemTrust(resolved, signal);
      } catch (error) {
        throw environmentRuntimeError(error);
      }
      const adopted = systemTrust.observations[0];
      if (adopted === undefined) {
        const probe = await this.probeOrThrow(resolved, signal);
        throw new EnvironmentRuntimeError(
          "environment/trust-required",
          undefined,
          probe.preferred.fingerprint,
          probe.preferred.keyType,
        );
      }
      // Record first, then derive the file: a failed write can then never
      // leave material broader than the durable record.
      trust = (await this.deps.recordObservedTrust(record.environmentId, adopted.fingerprint))
        .trust;
      await this.writeOnly(knownHostsPath, [adopted], resolved);
    }
    if (trust.state === "unknown") {
      // Unreachable: the branch above either records an observation or throws.
      throw new EnvironmentRuntimeError("environment/internal-error");
    }
    const expected =
      trust.state === "pinned" ? trust.hostKeyFingerprint : trust.observedFingerprint;
    const probe = await this.probeOrThrow(resolved, signal);
    const accepted = probe.observations.find((observation) => observation.fingerprint === expected);
    if (accepted === undefined) {
      throw new EnvironmentRuntimeError(
        trust.state === "pinned" ? "environment/hostkey-mismatch" : "environment/trust-changed",
        undefined,
        probe.preferred.fingerprint,
        probe.preferred.keyType,
      );
    }
    await this.ensureKnownHostsFile(knownHostsPath, resolved, accepted);
    return { resolved, knownHostsPath, trust, accepted };
  }

  /**
   * Probe and match the operator-accepted fingerprint against every offered
   * observation. No store or file write happens here; the caller performs the
   * required disconnect before {@link commitAccepted}.
   */
  async probeAccepted(
    record: EnvironmentRecord,
    fingerprint: string,
    signal?: AbortSignal,
  ): Promise<{ readonly resolved: SshResolvedTarget; readonly accepted: SshHostKeyObservation }> {
    const resolved = await this.resolve(record, signal);
    const probe = await this.probeOrThrow(resolved, signal);
    const accepted = probe.observations.find(
      (observation) => observation.fingerprint === fingerprint,
    );
    if (accepted === undefined) {
      throw new EnvironmentRuntimeError(
        "environment/trust-mismatch",
        undefined,
        probe.preferred.fingerprint,
        probe.preferred.keyType,
      );
    }
    return { resolved, accepted };
  }

  /** Pin the accepted observation and write exactly its known-hosts line. */
  async commitAccepted(
    record: EnvironmentRecord,
    expectedRevision: number,
    resolved: SshResolvedTarget,
    accepted: SshHostKeyObservation,
  ): Promise<EnvironmentRecord> {
    const updated = await this.deps.pinTrust(
      record.environmentId,
      expectedRevision,
      accepted.fingerprint,
    );
    await this.writeOnly(
      environmentKnownHostsPath(this.deps.store.dataRoot, record.environmentId),
      [accepted],
      resolved,
    );
    return updated;
  }

  async removeKnownHosts(environmentId: string): Promise<void> {
    try {
      await rm(environmentKnownHostsPath(this.deps.store.dataRoot, environmentId), {
        force: true,
      });
    } catch {
      // Derived material; a leftover file never grants trust on its own.
    }
  }

  knownHostsPolicy(context: EnvironmentTrustContext): SshKnownHostsPolicy {
    return { userKnownHostsFile: context.knownHostsPath, strict: true };
  }

  private async resolve(
    record: EnvironmentRecord,
    signal?: AbortSignal,
  ): Promise<SshResolvedTarget> {
    try {
      return await this.deps.trust.resolveTarget(
        {
          target: record.target,
          ...(record.port === undefined ? {} : { port: record.port }),
        },
        signal,
      );
    } catch (error) {
      throw environmentRuntimeError(error);
    }
  }

  private async probeOrThrow(
    resolved: SshResolvedTarget,
    signal?: AbortSignal,
  ): Promise<SshHostKeyProbe> {
    try {
      return await this.deps.trust.probe(resolved, signal);
    } catch (error) {
      throw environmentRuntimeError(error);
    }
  }

  /**
   * Rewrite the file only when its parsed key lines differ from exactly the
   * expected single line. Comment headers and blank lines are not trust
   * material and do not trigger a rewrite.
   */
  private async ensureKnownHostsFile(
    path: string,
    resolved: SshResolvedTarget,
    accepted: SshHostKeyObservation,
  ): Promise<void> {
    const expectedLine = this.deps.trust.knownHostsLine(accepted, resolved);
    try {
      const contents = await readFile(path, "utf8");
      const lines = parseKnownHostsKeyLines(contents);
      if (lines.length === 1 && lines[0] === expectedLine) return;
    } catch {
      // Missing/unreadable material is regenerated from the accepted key.
    }
    await this.deps.trust.writeKnownHostsFile(path, [expectedLine]);
  }

  private async writeOnly(
    path: string,
    observations: readonly SshHostKeyObservation[],
    resolved: SshResolvedTarget,
  ): Promise<void> {
    await this.deps.trust.writeKnownHostsFile(
      path,
      observations.map((observation) => this.deps.trust.knownHostsLine(observation, resolved)),
    );
  }
}

/** Parsed known-hosts key lines: comments and blanks are not key material. */
export function parseKnownHostsKeyLines(contents: string): string[] {
  return contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
