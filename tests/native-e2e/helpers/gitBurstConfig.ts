import { join } from "node:path";
import { GIT_NETWORK_TIMEOUT } from "../../../src/supervisor/git/exec.ts";
import { GIT_SLOW_FETCH_EXECUTION_MS } from "../../../src/supervisor/git/gitProcessAdmission.ts";
import {
  GIT_BURST_BOUND_STEER_ECHO_MS,
  GIT_BURST_BOUND_STEER_EXEC_MS,
  GIT_BURST_BOUND_TERMINAL_CLOSE_MS,
} from "./gitBurstStream.ts";
import { gitBurstUnsupportedMeasurements } from "./gitBurstDiagnostics.ts";

/**
 * Frozen configuration of the §4 Git-burst cell: burst sizes, stream shape,
 * WS5 loopback bounds (bounds, not SLAs — see the qualification test doc) and
 * the honest-measurement environment descriptor that every artifact carries.
 */

export const GIT_BURST_SEED_PROJECT_NAME = "native-e2e-fixture";

/** §4 burst sizes: distinct worktrees refreshed concurrently. */
export const GIT_BURST_WORKTREE_COUNT = 64;
export const GIT_BURST_CLIENTS_BY_SIZE: Record<number, number> = { 1: 1, 16: 4, 64: 8 };

export const GIT_BURST_GENERATOR_LINES = 8_000;
/** WS5 interleave tolerance: control bytes may split a pad line mid-stream. */
export const GIT_BURST_INTERLEAVE_TOLERANCE_LINES = 8;
export const GIT_BURST_GENERATOR_DONE_WAIT_MS = 90_000;
export const GIT_BURST_DRAIN_TIMEOUT_MS = 15_000;

/** Disposable scratch namespace shared by the host data root and worktrees. */
export const GIT_BURST_TMP_DIR = join("tmp", ".tmp", "git-burst-qa");

/** The frozen loopback bounds of the cell, in one budget object (the keys are
 * the `bounds` evidence shape of the run-summary artifact). */
export const GIT_BURST_BOUNDS = {
  controlAckMaxMs: 2_000,
  clientPingMaxMs: 2_000,
  steerEchoMs: GIT_BURST_BOUND_STEER_ECHO_MS,
  steerExecMs: GIT_BURST_BOUND_STEER_EXEC_MS,
  terminalCloseMs: GIT_BURST_BOUND_TERMINAL_CLOSE_MS,
  /** Stalled fetch: production network timeout plus spawn/admission margin. */
  fetchStallMaxMs: GIT_NETWORK_TIMEOUT + 15_000,
  slowFetchThresholdMs: GIT_SLOW_FETCH_EXECUTION_MS,
  networkTimeoutMs: GIT_NETWORK_TIMEOUT,
} as const;

export const GIT_BURST_RUN_ENVIRONMENT = {
  cell:
    "§4 Git burst: 1/16/64 distinct worktree refreshes across multiple clients, " +
    "one stalled network fetch, streaming PTY + Stop",
  evidence:
    "Active/queued per environment, queue wait vs execution and refusal counters come " +
    "from the production B7 admission diagnostics on loopback /metrics; refresh " +
    "outcomes are classified per client. Burst clients share one device credential " +
    "and may exhaust their own B3 principal budget; navigation/control and Stop are " +
    "measured on a separate authenticated control principal. These measurements do " +
    "not establish a production latency guarantee.",
  unsupported: gitBurstUnsupportedMeasurements(),
};
