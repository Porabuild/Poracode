/**
 * Live-process tests for `probeAcpCapabilities` compatibility and timing paths.
 *
 * These drive the real probe against a fake ACP agent process
 * (`fixtures/fake-acp-agent.mjs`) that injects deterministic timing faults.
 *
 * Each test asserts the correct behavior for timing and process-failure paths
 * that are difficult to exercise reliably against a live provider.
 */
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { probeAcpCapabilities, type AcpProbeResult } from "./probe";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-acp-agent.mjs", import.meta.url));

function probeWith(
  env: Record<string, string>,
  timeoutMs: number,
): Promise<AcpProbeResult | undefined> {
  return probeAcpCapabilities(process.execPath, [FIXTURE], process.cwd(), {
    env,
    timeoutMs,
    label: "stress",
  });
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

describe("probeAcpCapabilities live-process paths", () => {
  it("uses initialize._meta.modelState after a successful session handshake", async () => {
    const result = await probeWith({ FAKE_INIT_MODELS: "grok-4.5" }, 3_000);

    expect(result?.models).toEqual([{ id: "grok-4.5", label: "Grok 4.5" }]);
    expect(result?.modelMetadata).toEqual({
      "grok-4.5": { totalContextTokens: 500_000 },
    });
    expect(result?.authState).toBe("authenticated");
  });

  it.each(["delete", "close"] as const)(
    "cleans up its disposable session with session/%s",
    async (capability) => {
      const root = await mkdtemp(join(tmpdir(), "poracode-acp-probe-"));
      const marker = join(root, "cleanup.txt");
      try {
        const result = await probeWith(
          {
            FAKE_SESSION_CLEANUP_CAPABILITY: capability,
            FAKE_SESSION_CLEANUP_MARKER: marker,
          },
          5_000,
        );

        expect(result?.sessionEstablished).toBe(true);
        expect(await readFile(marker, "utf8")).toBe(`session/${capability}`);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("falls back to session/close when session/delete is null", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-acp-probe-"));
    const marker = join(root, "cleanup.txt");
    try {
      await probeWith(
        {
          FAKE_SESSION_CLEANUP_CAPABILITY: "null-delete-close",
          FAKE_SESSION_CLEANUP_MARKER: marker,
        },
        5_000,
      );

      expect(await readFile(marker, "utf8")).toBe("session/close");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not call a null session cleanup capability", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-acp-probe-"));
    const marker = join(root, "cleanup.txt");
    try {
      await probeWith(
        {
          FAKE_SESSION_CLEANUP_CAPABILITY: "null",
          FAKE_SESSION_CLEANUP_MARKER: marker,
        },
        3_000,
      );

      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reserves enough of a short probe deadline to delete the session", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-acp-probe-"));
    const marker = join(root, "cleanup.txt");
    const started = Date.now();
    try {
      const result = await probeWith(
        {
          FAKE_SESSION_CLEANUP_CAPABILITY: "delete",
          FAKE_SESSION_CLEANUP_MARKER: marker,
        },
        800,
      );

      expect(result?.sessionEstablished).toBe(true);
      expect(await readFile(marker, "utf8")).toBe("session/delete");
      expect(Date.now() - started).toBeLessThan(1_300);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(["error", "hang"] as const)(
    "keeps the detection result when session cleanup returns %s",
    async (behavior) => {
      const started = Date.now();
      const result = await probeWith(
        {
          FAKE_SESSION_CLEANUP_CAPABILITY: "delete",
          FAKE_SESSION_CLEANUP_BEHAVIOR: behavior,
        },
        1_200,
      );

      expect(result?.sessionEstablished).toBe(true);
      expect(Date.now() - started).toBeLessThan(1_700);
    },
  );

  it("does not expose initialize models when the session requires authentication", async () => {
    const result = await probeWith(
      { FAKE_INIT_MODELS: "grok-4.5", FAKE_AUTH_REQUIRED_ON_NEW: "1" },
      3_000,
    );

    expect(result?.models).toBeUndefined();
    expect(result?.authState).toBe("missing");
  });

  it("captures slash commands delivered in a later batch within the 2s grace window", async () => {
    // Qoder can deliver its initial command list after newSession resolves and
    // may append skills after its built-ins have already been published.
    const result = await probeWith(
      {
        FAKE_SLASH_BATCHES: JSON.stringify([
          { delayMs: 300, commands: [{ name: "quest", description: "workflow orchestrator" }] },
          {
            delayMs: 700,
            commands: [
              { name: "quest", description: "workflow orchestrator" },
              { name: "status", description: "show status" },
            ],
          },
        ]),
      },
      5_000,
    );

    const ids = result?.slashCommands?.map((command) => command.id) ?? [];
    expect(ids).toContain("quest");
    expect(ids).toContain("status");
  });

  it("bounds the whole probe by timeoutMs, not just the handshake", async () => {
    // The slash-command grace and per-model config RPCs must share the single
    // caller-supplied budget rather than extending it.
    const started = Date.now();
    await probeWith(
      {
        FAKE_MODELS: "auto,ultimate,fast",
        FAKE_REASONING_EFFORT: "1",
        FAKE_SLASH_BATCHES: JSON.stringify([
          { delayMs: 50, commands: [{ name: "quest", description: "workflow" }] },
        ]),
        FAKE_SET_CONFIG_DELAY_MS: "800",
      },
      1_000,
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_500);
  });

  it("cuts off a wedged session/set_config_option instead of hanging", async () => {
    // The budget is deliberately large enough that per-model probing IS reached
    // (slash grace ~2s first), so the wedged config RPC actually fires. It must
    // be cut off by MODEL_THOUGHT_LEVEL_PROBE_TIMEOUT_MS (300ms) and the global
    // budget — before the fix this RPC had no timeout and hung the probe forever.
    const probePromise = probeWith(
      {
        FAKE_MODELS: "auto,ultimate",
        FAKE_HANG_SET_CONFIG: "1",
        // Safety net so the fake agent is reaped even if the probe regresses.
        FAKE_SELF_DESTRUCT_MS: "8000",
      },
      3_000,
    );

    const watchdog = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), 4_000);
    });

    try {
      const outcome = await Promise.race([probePromise.then(() => "resolved" as const), watchdog]);
      // ~2s slash grace + one wedged model RPC cut off at ~300ms ≈ 2.3s, well
      // inside the 3s budget. A regression to the untimed RPC never resolves.
      expect(outcome).toBe("resolved");
    } finally {
      await probePromise.catch(() => undefined);
    }
  });

  it("aborts promptly when the agent crashes right after session/new", async () => {
    // Process exit must end the slash grace and prevent per-model retries.
    const started = Date.now();
    await probeWith(
      {
        FAKE_MODELS: "auto,m1,m2,m3",
        FAKE_REASONING_EFFORT: "1",
        FAKE_CRASH_AFTER_NEW_SESSION: "1",
      },
      5_000,
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
  });

  it("aborts and reaps the probe process when its caller is cancelled", async () => {
    const abort = new AbortController();
    const started = Date.now();
    const pending = probeAcpCapabilities(process.execPath, [FIXTURE], process.cwd(), {
      timeoutMs: 5_000,
      label: "cancelled",
      signal: abort.signal,
    });
    setTimeout(() => abort.abort(), 100);

    await pending;

    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("cleans up a created session before reaping an aborted probe", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-acp-probe-"));
    const sessionMarker = join(root, "session.txt");
    const cleanupMarker = join(root, "cleanup.txt");
    const abort = new AbortController();
    const started = Date.now();
    try {
      const pending = probeAcpCapabilities(process.execPath, [FIXTURE], process.cwd(), {
        env: {
          FAKE_SESSION_CLEANUP_CAPABILITY: "delete",
          FAKE_SESSION_CLEANUP_MARKER: cleanupMarker,
          FAKE_SESSION_NEW_MARKER: sessionMarker,
        },
        timeoutMs: 5_000,
        label: "cancelled-after-session",
        signal: abort.signal,
      });
      await waitForFile(sessionMarker);
      await new Promise((resolve) => setTimeout(resolve, 25));
      abort.abort();

      await pending;

      expect(await readFile(cleanupMarker, "utf8")).toBe("session/delete");
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
