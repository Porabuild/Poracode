import assert from "node:assert/strict";
import type { ProfileClient } from "./concurrencyProfileClient.ts";
import {
  QUALIFICATION_STEER_ECHO_BOUND_MS,
  QUALIFICATION_STEER_EXEC_BOUND_MS,
  QUALIFICATION_TERMINAL_CLOSE_BOUND_MS,
} from "./qualificationControlBounds.ts";
import { expectOk, posixLocation, type WorkloadProject } from "./sharedHostWorkload.ts";

/**
 * Real supervisor PTY streaming, input (steer) probes and the bounded Stop
 * for the §4 Git-burst cell. Declared provider stand-in, exactly like the
 * WS5 load profile: no model turn runs, but every byte travels the production
 * supervisor → host → client pipeline, so the burst measures the shared
 * control surfaces Git admission must not starve.
 *
 * Bounds are the FROZEN loopback constants of the WS5 load profile (large
 * margins — the point is "bounded", not a latency SLA); this module measures,
 * the qualification test asserts against those same constants.
 */

/** WS5 frozen loopback bounds, reused verbatim so the two cells speak one
 * budget language (see sharedHostLoadProfile.test.ts). */
export const GIT_BURST_BOUND_STEER_ECHO_MS = QUALIFICATION_STEER_ECHO_BOUND_MS;
export const GIT_BURST_BOUND_STEER_EXEC_MS = QUALIFICATION_STEER_EXEC_BOUND_MS;
export const GIT_BURST_BOUND_TERMINAL_CLOSE_MS = QUALIFICATION_TERMINAL_CLOSE_BOUND_MS;

const WARMUP_ATTEMPTS = 8;
const WARMUP_ECHO_WAIT_MS = 4_000;
/** Incompressible pad line streamed by the generator; shared with the
 * delivered-line accounting in `readStreamEvidence`. */
const GENERATOR_PAD_LINE = `gitburst-stream-pad-${"x".repeat(72)}`;

export interface GitBurstStreamHandle {
  readonly shellId: string;
  readonly watchId: string;
  readonly client: ProfileClient;
}

/** Starts one streaming shell and warms it with an executed (not echoed)
 * marker, write-until-seen — the first write to a fresh PTY can land during
 * shell init and never be read (observed with a fish continuation prompt). */
export async function startStreamingShell(input: {
  readonly client: ProfileClient;
  readonly project: WorkloadProject;
  readonly shellId: string;
  readonly watchId: string;
}): Promise<GitBurstStreamHandle> {
  const started = await input.client.fetchJson("terminal-start", "/api/terminal/start", {
    method: "POST",
    body: {
      shellId: input.shellId,
      projectLocation: posixLocation(input.project),
    },
  });
  expectOk(started.status, `terminal start ${input.shellId}`, started.body);
  const ready = await input.client.watchTerminalReliable(input.shellId, input.watchId);
  assert.strictEqual(ready.status, "ready", `watch for ${input.shellId} must be ready`);

  const marker = "GITBURST-READY\r\n";
  let warmed = false;
  for (let attempt = 1; attempt <= WARMUP_ATTEMPTS && !warmed; attempt += 1) {
    const warmup = await input.client.fetchJson(
      "terminal-warmup",
      `/api/threads/${input.shellId}/terminal/write`,
      { method: "POST", body: { data: `printf 'GITBURST-READY\\n'\r` } },
    );
    expectOk(warmup.status, `${input.shellId} warmup write`, warmup.body);
    warmed =
      (await waitForTerminalFragment(input.client, input.watchId, marker, WARMUP_ECHO_WAIT_MS)) !==
      null;
  }
  assert(warmed, `${input.shellId} warmup marker never executed`);
  return { shellId: input.shellId, watchId: input.watchId, client: input.client };
}

/** Polls a watcher's assembled text for a fragment; returns the wait in ms,
 * or null on deadline (a no-sample for the caller to report, never a zero). */
export async function waitForTerminalFragment(
  client: ProfileClient,
  watchId: string,
  fragment: string,
  timeoutMs: number,
): Promise<number | null> {
  const startedAt = performance.now();
  const deadline = startedAt + timeoutMs;
  for (;;) {
    if (client.terminalState(watchId)?.assembledText.includes(fragment)) {
      return performance.now() - startedAt;
    }
    if (performance.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Starts the incompressible tick generator inside the shell (real PTY
 * output racing the burst; `head` bounds it deterministically). */
export async function startGenerator(input: {
  readonly handle: GitBurstStreamHandle;
  readonly lines: number;
}): Promise<void> {
  const command =
    `yes '${GENERATOR_PAD_LINE}' | head -n ${String(input.lines)}; ` +
    `printf '%s\\n' 'GITBURST-GEN-DONE'\r`;
  const write = await input.handle.client.fetchJson(
    "terminal-generate",
    `/api/threads/${input.handle.shellId}/terminal/write`,
    { method: "POST", body: { data: command } },
  );
  expectOk(write.status, `${input.handle.shellId} generator write`, write.body);
}

export interface GitBurstSteerProbe {
  readonly probeId: string;
  /** Echo observed within the frozen bound (2s); null is a no-sample failure. */
  readonly echoWaitMs: number | null;
  /** Queued input executed by the busy shell after its generator drains. */
  readonly execWaitMs: number | null;
}

/** Control input into the busy streaming shell: the echoed comment carries
 * STEERECHO, the executed printf later emits STEEREXEC — the markers cannot
 * be confused (WS5 probe discipline). */
export async function steerStreamingShell(input: {
  readonly handle: GitBurstStreamHandle;
  readonly probeId: string;
}): Promise<GitBurstSteerProbe> {
  const echoMarker = `STEERECHO-${input.probeId}`;
  const execMarker = `STEEREXEC-${input.probeId}`;
  const write = await input.handle.client.fetchJson(
    "terminal-steer",
    `/api/threads/${input.handle.shellId}/terminal/write`,
    {
      method: "POST",
      body: { data: `printf '${execMarker}\\n' # ${echoMarker}\r` },
    },
  );
  expectOk(write.status, `steer probe ${input.probeId} write`, write.body);
  const echoWaitMs = await waitForTerminalFragment(
    input.handle.client,
    input.handle.watchId,
    echoMarker,
    GIT_BURST_BOUND_STEER_ECHO_MS,
  );
  const execWaitMs = await waitForTerminalFragment(
    input.handle.client,
    input.handle.watchId,
    `${execMarker}\r\n`,
    GIT_BURST_BOUND_STEER_EXEC_MS,
  );
  return { probeId: input.probeId, echoWaitMs, execWaitMs };
}

export interface GitBurstStreamEvidence {
  readonly ticksBeforeStop: number;
  readonly generatorCompleted: boolean;
  readonly deliveredPadLines: number;
}

/** Snapshot of the stream's delivered payload (bounded integrity check: the
 * healthy watcher keeps receiving output while the burst and the stalled
 * fetch run). */
export function readStreamEvidence(
  handle: GitBurstStreamHandle,
  generatorLines: number,
): GitBurstStreamEvidence {
  const assembled = handle.client.terminalState(handle.watchId)?.assembledText ?? "";
  const deliveredPadLines = assembled.split(`${GENERATOR_PAD_LINE}\r\n`).length - 1;
  return {
    ticksBeforeStop: deliveredPadLines,
    generatorCompleted: assembled.includes("GITBURST-GEN-DONE\r\n"),
    deliveredPadLines: Math.min(deliveredPadLines, generatorLines),
  };
}

/** Stop: `terminal/close` tears the streaming session down; the bounded close
 * reply IS the teardown proof (closeThread awaits PTY exit before replying,
 * same semantics the WS5 load profile freezes). */
export async function stopStreamingShell(handle: GitBurstStreamHandle): Promise<number> {
  const close = await handle.client.fetchJson(
    "terminal-close",
    `/api/threads/${handle.shellId}/terminal/close`,
    { method: "POST", body: {} },
  );
  expectOk(close.status, `terminal close ${handle.shellId}`, close.body);
  assert(
    close.elapsedMs <= GIT_BURST_BOUND_TERMINAL_CLOSE_MS,
    `terminal close for ${handle.shellId} took ${String(close.elapsedMs)}ms ` +
      `(bound ${String(GIT_BURST_BOUND_TERMINAL_CLOSE_MS)}ms)`,
  );
  return close.elapsedMs;
}
