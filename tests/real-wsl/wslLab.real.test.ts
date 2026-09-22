// Fail-closed real-WSL qualification scenarios, driven against the lab that
// scripts/ci-windows-wsl-lab.mjs provisions: an ASCII-named Ubuntu 24.04
// primary plus a second distro whose name carries spaces and non-ASCII
// characters — the shapes real users create and production code must survive.
//
// Every scenario goes through existing production seams (never ad-hoc
// reimplementations): the bootstrap probes, the UNC staging service, the
// host-access resolver, the project-location translation, and the Node
// runtime resolver with its per-distro single-flight.
//
// Gating: without PORACODE_WSL_LAB=1 everything skips (macOS dev machines);
// with the flag set, any lab defect fails the run instead of skipping.
// Scenarios register through `test` directly and open with `skipIfDisabled`
// so the vitest lint rules see a plain test structure.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, expect, test, vi, type TestContext } from "vitest";
import { toWslUncPath } from "@/shared/wsl";
import {
  clearWslHostAccessCache,
  computeWslHostAccess,
  parseDefaultRouteGateway,
} from "@/supervisor/wsl/hostAccess";
import { windowsProjectLocationInWslDistro } from "@/supervisor/wsl/projectLocation";
import { batchWslCommandsForBootstrap, probeDistroArch } from "@/supervisor/wsl/runtime/probe";
import type { RuntimeProgressEvent } from "@/supervisor/wsl/runtime/types";
import { WslStagingService } from "@/supervisor/wsl/staging";
import {
  guestTcpProbeArgs,
  listRegisteredDistros,
  resolveRealWslGate,
  runInDistro,
  startTcpPayloadServer,
  terminateDistro,
  type RealWslGate,
} from "./helpers/lab";

const gate: RealWslGate = resolveRealWslGate(process.env);

// ── Harness: skip guard + evidence ledger ───────────────────────────────────

interface EvidenceRow {
  name: string;
  ok: boolean;
  ms: number;
  detail: Record<string, unknown>;
}

const evidence: EvidenceRow[] = [];

/** Skip with a note on ordinary hosts; the caller returns immediately. */
function skipIfDisabled(ctx: TestContext): boolean {
  if (gate.enabled) return false;
  ctx.skip(gate.skipReason ?? "real-WSL lab disabled");
  return true;
}

function startedRow(): number {
  return performance.now();
}

function passRow(name: string, started: number, detail: Record<string, unknown> = {}): void {
  evidence.push({ name, ok: true, ms: Math.round(performance.now() - started), detail });
}

function failRow(name: string, started: number, error: unknown): void {
  evidence.push({
    name,
    ok: false,
    ms: Math.round(performance.now() - started),
    detail: { error: error instanceof Error ? error.message : String(error) },
  });
}

/** Run `fn` under the evidence ledger; rethrows after recording the failure. */
async function ledger(name: string, started: number, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passRow(name, started);
  } catch (error) {
    failRow(name, started, error);
    throw error;
  }
}

afterAll(() => {
  if (!gate.enabled || !gate.evidenceDir) return;
  writeFileSync(
    join(gate.evidenceDir, "suite-evidence.json"),
    `${JSON.stringify({ mode: gate.lab?.mode, rows: evidence }, null, 2)}\n`,
    "utf8",
  );
});

// ── Shared helpers ──────────────────────────────────────────────────────────

function enabledDistro(role: "primary" | "secondary"): string {
  const lab = gate.lab;
  if (!gate.enabled || !lab) throw new Error("the lab must be enabled inside a scenario");
  const distro = lab.distros.find((entry) => entry.role === role);
  if (!distro) throw new Error(`lab has no ${role} distro`);
  return distro.name;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/** Isolated staging front door; never the supervisor-wide singleton. */
function newIsolatedStaging(): WslStagingService {
  return new WslStagingService({
    cachedHome: () => "/root",
    requestTimeoutMs: 20_000,
    idleTimeoutMs: 600_000,
    maxExecutors: 4,
  });
}

// ── 1. Cold boot + stop/restart through production bootstrap probes ─────────

test("cold boot and stop/restart via the bootstrap probes", async (ctx) => {
  if (skipIfDisabled(ctx)) return;
  const started = startedRow();
  await ledger("cold-boot", started, async () => {
    const distro = enabledDistro("primary");

    // The manifest must match reality, and both names — including the
    // space/Unicode one — must survive wsl.exe's UTF-16LE list decoding.
    const registered = await listRegisteredDistros();
    expect(registered).toContain(distro);
    expect(registered).toContain(enabledDistro("secondary"));

    const arch = await probeDistroArch(distro, false);
    expect(arch === "x64" || arch === "arm64").toBe(true);

    const [warmMarker] = await batchWslCommandsForBootstrap(distro, ["printf warm-boot-marker"]);
    expect(warmMarker?.stdout).toContain("warm-boot-marker");

    await terminateDistro(distro);
    const coldStarted = performance.now();
    const [coldMarker] = await batchWslCommandsForBootstrap(distro, [
      "printf cold-boot-marker; uname -r",
    ]);
    expect(coldMarker?.stdout).toContain("cold-boot-marker");
    const coldBootMs = Math.round(performance.now() - coldStarted);

    // And again: stop/restart must be repeatable, not a one-off boot
    // accident. The production probes bound a single command at 15s — a
    // reboot that cannot make that budget is what this lane must surface.
    await terminateDistro(distro);
    const [secondMarker] = await batchWslCommandsForBootstrap(distro, ["printf restart-marker"]);
    expect(secondMarker?.stdout).toContain("restart-marker");

    passRow("cold-boot-ms", coldStarted, {
      coldBootMs,
      bound: 15_000,
      note: "production bootstrap probe budget",
    });
  });
});

// ── 2. Unicode/space distro: wslpath + UNC round-trips ──────────────────────

test("unicode/space distro: project location translation and UNC round-trips", async (ctx) => {
  if (skipIfDisabled(ctx)) return;
  const started = startedRow();
  const staging = newIsolatedStaging();
  try {
    await ledger("unicode-unc-roundtrip", started, async () => {
      const distro = enabledDistro("secondary");

      const hostDir = mkdtempSync(join(tmpdir(), "poracode-wsl-lab-ünïcodé dir-"));
      const markerName = "grüße 日本語.txt";
      const markerContent = "pängu-lab-roundtrip";
      writeFileSync(join(hostDir, markerName), markerContent, "utf8");

      const location = await windowsProjectLocationInWslDistro(
        { kind: "windows", path: hostDir },
        distro,
      );
      expect(location.distro).toBe(distro);
      expect(location.linuxPath.startsWith("/")).toBe(true);
      expect(location.uncPath.startsWith("\\\\wsl.localhost\\")).toBe(true);

      const linuxMarker = `${location.linuxPath}/${markerName}`;
      const viaDistro = await runInDistro(distro, ["cat", linuxMarker]);
      expect(viaDistro.stdout).toContain(markerContent);

      // Host → guest over UNC (the production fs path for WSL projects).
      expect(readFileSync(toWslUncPath(distro, linuxMarker), "utf8")).toBe(markerContent);

      // Staging service writes into the distro; both views must agree.
      const staged = `${location.linuxPath}/staged-ünïcodé-write.txt`;
      const stagedContent = "staged-through-production-service";
      await staging.writeTextFile(distro, staged, stagedContent);
      expect(readFileSync(toWslUncPath(distro, staged), "utf8")).toBe(stagedContent);
      const stagedViaDistro = await runInDistro(distro, ["cat", staged]);
      expect(stagedViaDistro.stdout).toContain(stagedContent);
      const stagedReadBack = await staging.readTextFile(distro, staged);
      expect(stagedReadBack).toBe(stagedContent);
      await staging.remove(distro, staged);

      rmSync(hostDir, { recursive: true, force: true });
    });
  } finally {
    await staging.dispose();
  }
});

// ── 3. Host reachability in the lab's real networking mode ──────────────────

/**
 * The production resolver's verdict must match the lab's declared networking
 * mode; mismatches throw with the exact drift. Plain throws (not conditional
 * expects) keep the assertions lint-clean and the failures precise.
 */
function hostAccessIpForMode(
  mode: "nat" | "mirrored",
  access: NonNullable<Awaited<ReturnType<typeof computeWslHostAccess>>>,
): string {
  if (mode === "nat") {
    if (access.kind !== "gateway") {
      throw new Error(`NAT lab resolved host access as ${access.kind}, expected gateway`);
    }
    return access.ip;
  }
  if (access.kind !== "loopback") {
    throw new Error(`mirrored lab resolved host access as ${access.kind}, expected loopback`);
  }
  return "127.0.0.1";
}

test("host reachability matches the lab networking mode", async (ctx) => {
  if (skipIfDisabled(ctx)) return;
  const started = startedRow();
  await ledger("host-reachability", started, async () => {
    const lab = gate.lab;
    if (!lab) throw new Error("unreachable: enabled runs always have the manifest");
    const distro = enabledDistro("primary");

    clearWslHostAccessCache();
    const access = await computeWslHostAccess(distro);
    if (access === undefined) throw new Error("the production host-access resolver returned none");
    const targetIp = hostAccessIpForMode(lab.mode, access);

    // Cross-check the resolver's gateway against a live route probe (NAT
    // only; in mirrored mode the resolver intentionally reports loopback).
    if (lab.mode === "nat") {
      const route = await runInDistro(distro, ["ip", "route", "show", "default"]);
      const routeGateway = parseDefaultRouteGateway(route.stdout);
      if (routeGateway !== targetIp) {
        throw new Error(
          `route gateway ${String(routeGateway)} does not match resolver ${targetIp}`,
        );
      }
    }
    expect(lab.firewall.ruleAdded).toBe(lab.mode === "nat");

    const payload = "poracode-wsl-lab-ok";
    const server = await startTcpPayloadServer(payload, lab.reachabilityPort);
    try {
      const probe = await runInDistro(distro, guestTcpProbeArgs(targetIp, server.port), {
        timeoutMs: 30_000,
      });
      expect(probe.stdout).toContain(payload);
      expect(server.connectionCount()).toBeGreaterThanOrEqual(1);
    } finally {
      await server.close();
    }
  });
});

// ── 4. Concurrent installs share the per-distro single-flight ───────────────

test(
  "concurrent runtime installs share one single-flight (network)",
  { timeout: 900_000 },
  async (ctx) => {
    if (skipIfDisabled(ctx)) return;
    const started = startedRow();
    await ledger("single-flight-installs", started, async () => {
      const distro = enabledDistro("primary");

      // Fresh module graph: the runtime resolver caches per distro in module
      // state, and this scenario must observe the actual single-flight, not a
      // warm cache.
      vi.resetModules();
      const runtime = await import("@/supervisor/wsl/runtime");
      const eventsA: RuntimeProgressEvent[] = [];
      const eventsB: RuntimeProgressEvent[] = [];

      const [resolvedA, resolvedB] = await Promise.all([
        runtime.resolveNodeForDistro(distro, {
          useBridge: false,
          onProgress: (event) => eventsA.push(event),
        }),
        runtime.resolveNodeForDistro(distro, {
          useBridge: false,
          onProgress: (event) => eventsB.push(event),
        }),
      ]);

      expect(resolvedA.nodePath).toBe(resolvedB.nodePath);
      expect(resolvedA.source).toBe("poracode-managed");
      expect(eventsA.filter((event) => event.kind === "download-start")).toHaveLength(1);
      expect(
        eventsB.some((event) => event.kind === "ready"),
        "the joined caller resolves",
      ).toBe(true);
      expect(
        eventsB.some((event) => event.kind === "download-start"),
        "the joined caller never repeats the download",
      ).toBe(false);

      // The installed binary must be visible both in-distro and over UNC.
      expect(existsSync(toWslUncPath(distro, resolvedA.nodePath))).toBe(true);
      const version = await runInDistro(distro, [resolvedA.nodePath, "--version"]);
      expect(version.stdout.trim()).toMatch(/^v\d+\.\d+\.\d+$/u);

      const staging = await import("@/supervisor/wsl/staging");
      await staging.disposeWslStagingService();

      passRow("single-flight-events", started, {
        callerA: eventsA.map((event) => event.kind),
        callerB: eventsB.map((event) => event.kind),
      });
    });
  },
);

// ── 5. Stalled distro: bounded failure, cross-distro progress, recovery ─────

test("a stalled distro cannot pin the staging service", async (ctx) => {
  if (skipIfDisabled(ctx)) return;
  const started = startedRow();
  const staging = newIsolatedStaging();
  const payloadDir = mkdtempSync(join(tmpdir(), "poracode-wsl-lab-stall-"));
  try {
    await ledger("stalled-distro-isolation", started, async () => {
      const stalled = enabledDistro("secondary");
      const healthy = enabledDistro("primary");

      // A 48 MiB payload keeps the UNC copy in flight long enough for the
      // terminate to land mid-request.
      const payloadPath = join(payloadDir, "payload.bin");
      writeFileSync(payloadPath, Buffer.alloc(48 * 1024 * 1024, 7));
      const stagedDest = `/tmp/poracode-lab-stall-${Date.now()}.bin`;

      const stalledStage = staging
        .stageFile(stalled, { src: payloadPath, dest: toWslUncPath(stalled, stagedDest) })
        .then(
          () => "resolved" as const,
          () => "rejected" as const,
        );

      await delay(300);
      await terminateDistro(stalled);

      // Cross-distro progress: the healthy distro's requests must complete
      // while the stalled one is unresolved, and they must be bounded by the
      // service deadline, not by the sick neighbor.
      const progressStarted = performance.now();
      const progressPath = "/tmp/poracode-lab-progress.txt";
      await staging.writeTextFile(healthy, progressPath, "progress-marker");
      const progressReadBack = await staging.readTextFile(healthy, progressPath);
      const progressMs = performance.now() - progressStarted;
      expect(progressReadBack).toBe("progress-marker");
      expect(progressMs).toBeLessThan(20_000);

      // The stalled request must settle bounded — a terminated distro kills
      // its 9p handles, so resolution is not a legitimate outcome.
      const stalledOutcome = await stalledStage;
      const stalledMs = performance.now() - progressStarted;
      expect(stalledOutcome).toBe("rejected");
      expect(stalledMs).toBeLessThan(20_000 + 40_000);

      // Recovery: the same service instance serves the rebooted distro again.
      await runInDistro(stalled, ["printf", "rebooted"]);
      const recoveredPath = "/tmp/poracode-lab-recovered.txt";
      await staging.writeTextFile(stalled, recoveredPath, "recovered");
      expect(await staging.readTextFile(stalled, recoveredPath)).toBe("recovered");
      await staging.remove(stalled, recoveredPath);
      await staging.remove(stalled, stagedDest);
      try {
        await staging.remove(healthy, progressPath);
      } catch {
        // Advisory cleanup.
      }

      passRow("stall-bounds", progressStarted, {
        progressMs: Math.round(progressMs),
        stalledOutcome,
      });
    });
  } finally {
    rmSync(payloadDir, { recursive: true, force: true });
    await staging.dispose();
  }
});
