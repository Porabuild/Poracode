import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  AgentStatus,
  ProjectLocation,
  SessionRef,
  StartThreadPayload,
  ThreadConfig,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { createAgentRegistry } from "@/supervisor/agents/registry";
import { SupervisorRuntime } from "@/supervisor/runtime";

// Live-CLI integration: for each adapter in `createAgentRegistry()`, this test
// starts a real thread with a cheap model, waits for sessionRef discovery,
// closes the thread, resumes it, and asserts the original prompt is visible in
// the resumed PTY's terminal scrollback. Providers that aren't installed or
// authenticated are skipped — the test fails only when an installed +
// authenticated provider loses the initial message across close/resume.

const PROMPT_TOKEN = `lightcode-int-${randomUUID().slice(0, 8)}`;
const PROMPT = `Reply with the single word OK. (token: ${PROMPT_TOKEN})`;
const SESSION_REF_TIMEOUT_MS = 120_000;
const TURN_COMPLETE_TIMEOUT_MS = 180_000;
const SCROLLBACK_WAIT_TIMEOUT_MS = 120_000;

// Hand-picked cheapest model per provider. For dynamic-model providers
// (Codex / Copilot / Grok / OpenCode), we fall back to scanning the detected
// capabilities for a "mini/flash/lite/haiku/small/fast" name, then the first
// model. None of these defaults are guaranteed to exist on every host — the
// test will surface a clear error if the chosen model is rejected by the CLI.
const PREFERRED_MODEL: Record<string, string> = {
  claude: "haiku",
  cursor: "auto",
  antigravity: "auto",
  opencode: "opencode/big-pickle",
};

const CHEAP_NAME_HINTS = ["haiku", "mini", "flash-lite", "flash", "lite", "small", "fast", "nano"];

// First-run interactive prompts we know how to answer in the test. The
// scrollback contains ANSI escapes (cursor positioning, colors), so the
// matcher only looks at decoded text fragments. Each entry sends its keystroke
// once and is then disarmed for the rest of the run.
interface DialogResponder {
  needle: RegExp;
  response: string;
  reason: string;
}

const KIND_DIALOG_RESPONDERS: Record<string, DialogResponder[]> = {
  // Codex >= 0.130 gates first-run on a "Hooks need review" dialog whenever
  // CODEX_HOME contains hooks the user hasn't accepted. The supervisor stages
  // a fresh hook bundle into a temp CODEX_HOME each test invocation, so we
  // always see this prompt; auto-select "2. Trust all and continue".
  codex: [
    {
      needle: /Hooks\s+need\s+review/i,
      response: "2\r",
      reason: "codex: accept hooks trust dialog",
    },
  ],
};

function decodeScrollbackText(scrollback: string): string {
  // Strip CSI / OSC / private-mode escape sequences so simple substring or
  // regex matches find the underlying text fragments. Regexes are built
  // dynamically so the source contains no literal control bytes.
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const osc = new RegExp(ESC + "\\][^" + BEL + ESC + "]*(" + BEL + "|" + ESC + "\\\\)", "g");
  const csi = new RegExp(ESC + "\\[[0-?]*[ -/]*[@-~]", "g");
  const privateMode = new RegExp(ESC + "[=>]", "g");
  return scrollback.replace(osc, "").replace(csi, "").replace(privateMode, "");
}

function pickCheapModel(adapter: AgentAdapter, status: AgentStatus): string | undefined {
  const preferred = PREFERRED_MODEL[adapter.kind];
  if (preferred) return preferred;

  const models = status.capabilities.models ?? adapter.capabilities.models ?? [];
  for (const hint of CHEAP_NAME_HINTS) {
    const match = models.find((m) => m.id.toLowerCase().includes(hint));
    if (match) return match.id;
  }
  return models[0]?.id;
}

function makeProjectLocation(cwd: string): ProjectLocation {
  if (process.platform === "win32") {
    return { kind: "windows", path: cwd };
  }
  return { kind: "posix", path: cwd };
}

function armDialogAutoResponder(
  runtime: SupervisorRuntime,
  threadId: string,
  kind: string,
): () => void {
  const responders = (KIND_DIALOG_RESPONDERS[kind] ?? []).map((r) => ({ ...r, fired: false }));
  if (responders.length === 0) return () => undefined;
  const state = { stopped: false };
  void (async () => {
    while (!state.stopped) {
      const text = decodeScrollbackText(runtime.readTerminalScrollback(threadId));
      for (const r of responders) {
        if (!r.fired && r.needle.test(text)) {
          r.fired = true;
          try {
            await runtime.writeTerminal({ threadId, data: r.response });
            // eslint-disable-next-line no-console
            console.log(`[int-test] auto-respond → ${r.reason}`);
          } catch {
            // PTY may have closed; ignore.
          }
        }
      }
      if (responders.every((r) => r.fired)) return;
      await sleep(500);
    }
  })();
  return () => {
    state.stopped = true;
  };
}

async function waitForSessionRef(
  runtime: SupervisorRuntime,
  events: SupervisorEvent[],
  threadId: string,
  timeoutMs: number,
): Promise<SessionRef> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const event of events) {
      if (
        event.type === "thread-state" &&
        event.threadId === threadId &&
        event.sessionRef?.providerSessionId
      ) {
        return event.sessionRef;
      }
      if (
        event.type === "thread-state" &&
        event.threadId === threadId &&
        event.status === "error"
      ) {
        throw new Error(
          `Thread ${threadId} entered error state: ${event.errorMessage ?? "(no message)"}`,
        );
      }
    }
    // Also check the live snapshot — some adapters surface sessionRef via the
    // CLI hook channel without ever emitting a populated thread-state event
    // before we poll.
    const snapshot = runtime.getThreadSnapshots().find((s) => s.threadId === threadId);
    if (snapshot?.sessionRef?.providerSessionId) {
      return snapshot.sessionRef;
    }
    await sleep(500);
  }
  const tail = runtime.readTerminalScrollback(threadId).slice(-600).replace(/\s+/g, " ").trim();
  const recentThreadStates = events
    .filter((e) => e.type === "thread-state" && (e as { threadId?: string }).threadId === threadId)
    .slice(-5)
    .map((e) => {
      const ev = e as {
        status?: string;
        attention?: string;
        sessionRef?: { providerSessionId?: string };
        errorMessage?: string;
      };
      return {
        status: ev.status,
        attention: ev.attention,
        sessionId: ev.sessionRef?.providerSessionId,
        errorMessage: ev.errorMessage,
      };
    });
  const eventTypes = [...new Set(events.map((e) => e.type))];
  throw new Error(
    `Timed out waiting for sessionRef on thread ${threadId} after ${timeoutMs}ms. ` +
      `Scrollback tail: ${tail || "(empty)"} ` +
      `Recent thread-state events: ${JSON.stringify(recentThreadStates)} ` +
      `Emitted event types: ${eventTypes.join(",")}`,
  );
}

async function waitForTurnComplete(
  runtime: SupervisorRuntime,
  threadId: string,
  promptToken: string,
  timeoutMs: number,
): Promise<void> {
  // Providers only flush their conversation file to disk after the turn
  // settles. The supervisor's thread-state isn't a reliable cross-provider
  // signal (some adapters emit launching→idle before the LLM has even
  // responded), so we use output quiescence instead: wait until the prompt
  // is visible in scrollback and the PTY has produced no new bytes for
  // QUIET_MS. That holds for every CLI in the registry because they all
  // stream tokens through the PTY and stop writing once the turn settles.
  const QUIET_MS = 4000;
  const deadline = Date.now() + timeoutMs;
  let lastLen = -1;
  let lastChangeAt = Date.now();
  let promptSeen = false;
  while (Date.now() < deadline) {
    const scrollback = runtime.readTerminalScrollback(threadId);
    if (!promptSeen) {
      promptSeen = scrollback.includes(promptToken);
      if (promptSeen) {
        lastLen = scrollback.length;
        lastChangeAt = Date.now();
      }
    } else if (scrollback.length !== lastLen) {
      lastLen = scrollback.length;
      lastChangeAt = Date.now();
    } else if (Date.now() - lastChangeAt >= QUIET_MS) {
      return;
    }
    await sleep(500);
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for turn to settle on thread ${threadId} ` +
      `(promptSeen=${promptSeen})`,
  );
}

async function waitForScrollbackMatch(
  runtime: SupervisorRuntime,
  threadId: string,
  needle: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastScrollback = "";
  while (Date.now() < deadline) {
    const scrollback = runtime.readTerminalScrollback(threadId);
    lastScrollback = scrollback;
    if (scrollback.includes(needle)) {
      return scrollback;
    }
    await sleep(500);
  }
  // Surface a snippet of the last-seen scrollback to make failures debuggable.
  const tail = lastScrollback.slice(-400).replace(/\s+/g, " ").trim();
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for "${needle}" in scrollback for thread ${threadId}. ` +
      `Tail: ${tail || "(empty)"}`,
  );
}

interface SuiteContext {
  runtime: SupervisorRuntime;
  events: SupervisorEvent[];
  cwd: string;
  dataDir: string;
  prevDataDir: string | undefined;
  adapters: AgentAdapter[];
}

const ctx: SuiteContext = {
  runtime: undefined as unknown as SupervisorRuntime,
  events: [],
  cwd: "",
  dataDir: "",
  prevDataDir: process.env.LIGHTCODE_DATA_DIR,
  adapters: [],
};

beforeAll(() => {
  // Use the actual repo root as the project cwd so providers that gate launch
  // on directory trust (Claude's "Do you trust this folder?" dialog, Cursor's
  // workspace prompt, etc.) don't block on a never-seen tmp path. The test
  // prompt is "reply OK" — providers do not write files for that — so using
  // the repo dir is non-destructive. Supervisor state stays isolated via
  // LIGHTCODE_DATA_DIR (set per test in beforeEach).
  ctx.cwd = process.cwd();
  ctx.adapters = createAgentRegistry();
});

// Providers that need CLI hook plugins active to surface sessionRef back into
// the runtime. OpenCode's structured-session→terminal handoff drops the
// session id when hooks are disabled, so we leave hooks enabled for it.
// Codex must stay on `disableCliHookPlugin: true` — its first-run "Hooks
// need review" dialog triggers off the installed hook bundle.
const NEEDS_HOOKS_ENABLED = new Set(["opencode"]);

beforeEach((testCtx) => {
  // Fresh supervisor + data dir per test row. Real CLI processes leave
  // lingering state (PTY handles, session files, hook plugin installs) that
  // can poison later providers when the same runtime is reused. Isolating
  // each test costs ~1s of construction but eliminates order-dependent
  // flakiness in the full sweep.
  ctx.dataDir = mkdtempSync(join(tmpdir(), "lightcode-int-"));
  process.env.LIGHTCODE_DATA_DIR = ctx.dataDir;
  const kind = testCtx.task.name;
  const disableHooks = !NEEDS_HOOKS_ENABLED.has(kind);
  writeFileSync(
    join(ctx.dataDir, "settings.json"),
    JSON.stringify({ disableCliHookPlugin: disableHooks }),
  );
  ctx.events = [];
  ctx.runtime = new SupervisorRuntime((event) => {
    ctx.events.push(event);
  });
});

afterEach(() => {
  try {
    ctx.runtime?.dispose();
  } catch {
    // best-effort
  }
  if (ctx.prevDataDir === undefined) {
    delete process.env.LIGHTCODE_DATA_DIR;
  } else {
    process.env.LIGHTCODE_DATA_DIR = ctx.prevDataDir;
  }
  // Only remove the data dir — `ctx.cwd` is the lightcode repo root and must
  // never be deleted.
  if (ctx.dataDir) rmSync(ctx.dataDir, { recursive: true, force: true });
});

const REGISTRY_KINDS = createAgentRegistry().map((a) => a.kind);

describe("provider lifecycle: create → unload → resume → initial message visible", () => {
  for (const kind of REGISTRY_KINDS) {
    it(`${kind}`, async (testCtx) => {
      const adapter = ctx.adapters.find((a) => a.kind === kind);
      if (!adapter) {
        testCtx.skip(`adapter ${kind} not in registry`);
        return;
      }

      if (!adapter.capabilities.supportsResume) {
        testCtx.skip(`${kind}: adapter does not support resume`);
        return;
      }

      const status = await adapter.detectInstall();
      if (!status.installed) {
        testCtx.skip(`${kind}: CLI not installed`);
        return;
      }
      if (status.authState !== "authenticated") {
        testCtx.skip(`${kind}: authState=${status.authState} (need "authenticated")`);
        return;
      }

      const model = pickCheapModel(adapter, status);
      if (!model) {
        testCtx.skip(`${kind}: no model available in capabilities`);
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`[int-test] ${kind} using model: ${model}`);

      const threadId = `int-${kind}-${randomUUID()}`;
      const projectLocation = makeProjectLocation(ctx.cwd);
      const config: ThreadConfig = { model };
      const startPayload: StartThreadPayload = {
        threadId,
        projectLocation,
        agentKind: kind,
        config,
        prompt: PROMPT,
        initialSize: { cols: 132, rows: 40 },
        // Force PTY/TUI even for adapters that expose `presentationModes:
        // ["terminal", "gui"]` so we exercise the real terminal scrollback
        // path. Without this, future drift in any adapter's default could
        // silently push the test into structured/ACP mode.
        presentationMode: "terminal",
      };

      let resumeStarted = false;
      const stopResponder = armDialogAutoResponder(ctx.runtime, threadId, kind);
      try {
        await ctx.runtime.startThread(startPayload);
        const sessionRef = await waitForSessionRef(
          ctx.runtime,
          ctx.events,
          threadId,
          SESSION_REF_TIMEOUT_MS,
        );

        // Wait for the first turn to settle so the provider has persisted
        // the conversation to disk. Without this Claude (and most CLI
        // providers) reject resume with "no conversation found".
        await waitForTurnComplete(ctx.runtime, threadId, PROMPT_TOKEN, TURN_COMPLETE_TIMEOUT_MS);

        // Unload — close the live thread, leaving the discovered sessionRef
        // as the resume handle.
        await ctx.runtime.closeThread({ threadId });
        await sleep(750);

        // Resume — same threadId, supply the sessionRef so the supervisor's
        // restart path uses the adapter's `buildResumeArgv`.
        const resumePayload: StartThreadPayload = {
          threadId,
          projectLocation,
          agentKind: kind,
          config,
          prompt: "",
          initialSize: { cols: 132, rows: 40 },
          sessionRef,
          presentationMode: "terminal",
        };
        resumeStarted = true;
        await ctx.runtime.startThread(resumePayload);

        // After resume, the provider CLI normally reprints prior conversation
        // history into the PTY. Assert the original prompt's token is back
        // in scrollback.
        await waitForScrollbackMatch(
          ctx.runtime,
          threadId,
          PROMPT_TOKEN,
          SCROLLBACK_WAIT_TIMEOUT_MS,
        );

        const scrollback = ctx.runtime.readTerminalScrollback(threadId);
        expect(scrollback).toContain(PROMPT_TOKEN);
      } finally {
        stopResponder();
        try {
          await ctx.runtime.closeThread({ threadId });
        } catch {
          // best-effort
        }
        // Guard against orphaned PTYs if the resume path threw before close.
        if (!resumeStarted) {
          await sleep(100);
        }
      }
    });
  }
});
