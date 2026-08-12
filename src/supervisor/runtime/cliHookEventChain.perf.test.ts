import { afterEach, describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  type AgentEventEnvelope,
  type AgentEventIntent,
} from "@/shared/contracts";
import type { AgentAdapter } from "../agents/base";
import { BufferedLogWriter } from "./bufferedLogWriter";
import { dispatchAgentEvent } from "./agentEventDispatcher";
import { HookIngress } from "./hookIngress";
import type { SessionRuntime } from "./sessionTypes";
import { ThreadOutputPipeline } from "./threadOutputPipeline";

/**
 * End-to-end latency smoke for the CLI hook path:
 *   HTTP POST → HookIngress (auth, JSON, zod) → dispatchAgentEvent →
 *   ThreadOutputPipeline.applyCliHookPluginState → thread-state emit
 *
 * Six logical threads post concurrently (Promise.all over per-thread loops).
 * Scale with `PORACODE_PERF_SCALE` (default 1): events per thread = 40 × scale, capped at 400.
 */

const THREAD_COUNT = 6;

function eventsPerThread(): number {
  const scale = Math.max(1, Math.min(20, Number(process.env.PORACODE_PERF_SCALE ?? "1") || 1));
  return Math.min(400, 40 * scale);
}

function makeSession(threadId: string): SessionRuntime {
  return {
    threadId,
    instanceId: `inst-${threadId}`,
    agentKind: "claude",
    status: "idle",
    attention: "none",
    config: { model: "perf-stub" },
    runtimeLaunchConfig: { model: "perf-stub" },
    canResumeWithConfig: false,
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    outputLength: 0,
    prevChunk: "",
    projectLocation: { kind: "posix", path: "/tmp/perf" },
    adapter: {
      kind: "claude",
      label: "claude",
      capabilities: { liveInputMode: "terminal", presentationMode: "terminal" },
    } as unknown as AgentAdapter,
    pty: {} as SessionRuntime["pty"],
  } as unknown as SessionRuntime;
}

function envelopeFor(threadId: string, intent: AgentEventIntent, seq: number): AgentEventEnvelope {
  return {
    protocolVersion: PROTOCOL_VERSION,
    agentKind: "claude",
    pluginVersion: "perf",
    threadId,
    ts: 1_700_000_000_000 + seq,
    intent,
  };
}

describe("CLI hook event chain (6 threads)", () => {
  let ingress: HookIngress | undefined;

  afterEach(async () => {
    if (ingress) {
      await ingress.dispose();
      ingress = undefined;
    }
  });

  it("keeps HookIngress → dispatcher → output pipeline under loose latency bounds", async () => {
    const sessions = new Map<string, SessionRuntime>();
    for (let i = 0; i < THREAD_COUNT; i += 1) {
      const id = `perf-thread-${i}`;
      sessions.set(id, makeSession(id));
    }

    const threadStateEmits: unknown[] = [];
    const pipeline = new ThreadOutputPipeline({
      emit: (ev) => {
        if (ev.type === "thread-state") threadStateEmits.push(ev);
      },
      isDev: false,
      logWriter: new BufferedLogWriter(),
      resolveLogPath: () => "/dev/null",
      resolveHintLogPath: () => "/dev/null",
      readDisableCliHookPlugin: () => false,
      onRecoverInvalidSessionRef: () => undefined,
      onStartQueuedLaunchPrompt: () => undefined,
      onStartSessionRefDiscovery: () => undefined,
    });

    const onEvent = (e: AgentEventEnvelope): void =>
      dispatchAgentEvent(e, {
        lookupSession: ({ threadId, sessionId }) => {
          if (threadId) return sessions.get(threadId);
          if (sessionId) {
            for (const s of sessions.values()) {
              if (s.sessionRef?.providerSessionId === sessionId) return s;
            }
          }
          return undefined;
        },
        applyCliHookPluginState: (session, change) =>
          pipeline.applyCliHookPluginState(session, change),
      });

    ingress = new HookIngress({ onEvent, onError: () => undefined });
    ingress.start();
    const { url, secret } = await ingress.ready;

    const n = eventsPerThread();
    const totalEvents = THREAD_COUNT * n;
    const latenciesMs: number[] = [];

    const tWall0 = performance.now();
    await Promise.all(
      Array.from({ length: THREAD_COUNT }, async (_, ti) => {
        const threadId = `perf-thread-${ti}`;
        for (let e = 0; e < n; e += 1) {
          const intent: AgentEventIntent =
            e % 2 === 0 ? "session.turn_started" : "session.turn_finished";
          const body = JSON.stringify(envelopeFor(threadId, intent, ti * 10_000 + e));
          const t0 = performance.now();
          const res = await fetch(url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${secret}`,
              "content-type": "application/json",
            },
            body,
          });
          latenciesMs.push(performance.now() - t0);
          expect(res.status).toBe(202);
        }
      }),
    );
    const wallMs = performance.now() - tWall0;

    latenciesMs.sort((a, b) => a - b);
    const p50 = latenciesMs[Math.floor(latenciesMs.length * 0.5)] ?? 0;
    const p95 = latenciesMs[Math.floor(latenciesMs.length * 0.95)] ?? 0;
    const avg = latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length;

    // Every request should drive a real status flip (idle↔working), so one thread-state emit each.
    expect(threadStateEmits).toHaveLength(totalEvents);

    // Throughput: entire burst should complete without grinding to a halt.
    expect(wallMs).toBeLessThan(Math.max(30_000, totalEvents * 2));

    // Per-request: localhost + small body; generous ceiling for shared CI runners.
    expect(avg).toBeLessThan(30);
    expect(p95).toBeLessThan(160);

    if (process.env.PORACODE_PERF_LOG) {
      console.log(
        `[perf/cli-hook] threads=${THREAD_COUNT} events/thread=${n} total=${totalEvents} wallMs=${wallMs.toFixed(1)} avgMs=${avg.toFixed(3)} p50Ms=${p50.toFixed(3)} p95Ms=${p95.toFixed(3)}`,
      );
    }
  }, 60_000);
});
