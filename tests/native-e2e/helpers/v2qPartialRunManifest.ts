import { arch, platform, release } from "node:os";
import type { ArmRecord } from "./armFreeze.ts";
import type { QualificationCellSpec } from "./qualificationCell.ts";
import type { HostLoadSummary } from "./hostLoadSampler.ts";

/**
 * Partial run manifest (`run-partial.json`) for the v2 architecture
 * qualification cell (plan §4.2, D2).
 *
 * The final `run.json` is written at the end of the cell body, so any late
 * abort used to lose every sampler/contamination summary with it. When the
 * body fails before that write, the cell's `afterAll` records whatever
 * summaries exist plus the failure message. This is diagnostics only: it
 * carries no budget verdicts (they were never computed) and never changes
 * pass/fail semantics — the final `run.json` remains the only qualified
 * manifest, and budgets are untouched.
 */

export interface PartialRunManifestInput {
  readonly spec: QualificationCellSpec;
  readonly arm: ArmRecord | null;
  /** Error message(s) collected from the failed cell body, if any. */
  readonly failure: string | null;
  readonly timeline: Record<string, number | string>;
  readonly clientAccounting: Record<string, unknown>;
  readonly contamination: Record<string, unknown> | null;
  readonly memory: unknown;
  readonly processCpu: unknown;
  readonly nodePerf: readonly unknown[];
}

export interface PartialRunManifest {
  readonly partial: true;
  readonly reason: string;
  readonly failure: string | null;
  readonly cell: QualificationCellSpec;
  readonly arm: ArmRecord | null;
  readonly environment: {
    readonly platform: string;
    readonly release: string;
    readonly arch: string;
    readonly nodeVersion: string;
    readonly contamination: Record<string, unknown> | null;
  };
  readonly results: {
    readonly timeline: Record<string, number | string>;
    readonly clientAccounting: Record<string, unknown>;
    readonly memory: unknown;
    readonly processCpu: unknown;
    readonly nodePerf: readonly unknown[];
  };
}

/**
 * The host-load contamination record shared by the final `run.json` and the
 * partial manifest: a contaminated window never authorizes a capacity claim.
 */
export function buildContaminationRecord(
  summary: HostLoadSummary | null,
): Record<string, unknown> | null {
  if (!summary) return null;
  return {
    samples: summary.samples,
    contaminatedSamples: summary.contaminatedSamples,
    peakLoad1: summary.peakLoad1,
    maxForeignBuildProcesses: summary.maxForeignBuildProcesses,
    probeFailures: summary.probeFailures,
    capacityClaimAllowed:
      summary.contaminatedSamples === 0 && summary.peakLoad1 <= summary.cpuCount,
    policy:
      "no capacity claim is made from a contaminated window; timing figures are functional evidence only",
  };
}

export function buildPartialRunManifest(input: PartialRunManifestInput): PartialRunManifest {
  return {
    partial: true,
    reason:
      "the cell body did not complete its final run.json write; the summaries below are " +
      "whatever the samplers had collected when the run aborted",
    failure: input.failure,
    cell: input.spec,
    arm: input.arm,
    environment: {
      platform: platform(),
      release: release(),
      arch: arch(),
      nodeVersion: process.version,
      contamination: input.contamination,
    },
    results: {
      timeline: input.timeline,
      clientAccounting: input.clientAccounting,
      memory: input.memory,
      processCpu: input.processCpu,
      nodePerf: input.nodePerf,
    },
  };
}
