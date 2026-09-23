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
import { SupervisorRuntime } from "@/supervisor/supervisorRuntime";
import {
  LIVE_PROVIDERS_REQUIRED_ENV,
  parseRequiredLiveProviders,
  skipOrThrowRequired,
} from "./helpers/liveProvidersRequired";

// Live-CLI integration: for each adapter in `createAgentRegistry()`, this test
// starts a real thread with a cheap model, waits for sessionRef discovery,
// closes the thread, resumes it, and asserts the original prompt is visible in
// the resumed PTY's terminal scrollback. Providers that aren't installed or
// authenticated are skipped — the test fails only when an installed +
// authenticated provider loses the initial message across close/resume.
//
// Strict mode: set PORACODE_LIVE_PROVIDERS_REQUIRED to a comma-separated list
// of provider kinds that MUST run (e.g. "claude,codex"). Every named kind must
// be a known registry kind, and none of them may silently skip — a missing
// binary, credential, or model fails the named provider's test instead of
// skipping it. Unset, the suite keeps its ordinary skip-for-absent behavior.

const PROMPT_TOKEN = `poracode-int-${randomUUID().slice(0, 8)}`;
const PROMPT = `Reply with the single word OK. (token: ${PROMPT_TOKEN})`;
const SESSION_REF_TIMEOUT_MS = 120_000;
const TURN_COMPLETE_TIMEOUT_MS = 180_000;
const SCROLLBACK_WAIT_TIMEOUT_MS = 120_000;

// Hand-picked cheapest model per provider. For dynamic-model providers
// (Codex / Copilot / Qwen / Grok / OpenCode / Pi), we fall back to scanning the detected
// capabilities for a "mini/flash/lite/haiku/small/fast" name, then the first
// model. None of these defaults are guaranteed to exist on every host — the
// test will surface a clear error if the chosen model is rejected by the CLI.
const PREFERRED_MODEL: Record<string, string> = {
  devin: "swe-1-6-fast",
  claude: "haiku",
  cursor: "auto",
  antigravity: "auto",
  commandcode: "google/gemini-3.1-flash-lite",
  opencode: "opencode/big-pickle",
  opencode2: "opencode-go/deepseek-v4.1-flash",
  kimi: "kimi-code/kimi-for-coding",
  muse: "muse-spark-1.3",
  qwen: "qwen3.8-max",
  // qoder: was "lite" — stale pin. qodercli 1.1.61's discovered catalog is
  // auto (default), ultimate, performance, efficient, … with no "lite"; the
  // ACP lane rejects set_model("lite") with "Invalid or unavailable model".
  qoder: "auto",
};

const CHEAP_NAME_HINTS = ["haiku", "mini", "flash-lite", "flash", "lite", "small", "fast", "nano"];

// First-run interactive prompts we know how to answer in the test. The
// scrollback contains ANSI escapes (cursor positioning, colors), so the
// matcher only looks at decoded text fragments. Note that CLIs often paint
// modal text word-by-word with cursor-position escapes, so the decoded text
// has no spaces between those words — needles join words with `\s*` (zero or
// more) rather than `\s+`.
interface DialogResponder {
  needle: RegExp;
  response: string;
  reason: string;
  // The test relaunches the CLI for the resume leg, and each launch starts a
  // fresh PTY transcript. Gates that reappear on every launch (claude
  // re-runs onboarding; a dialog whose acceptance wasn't persisted) must be
  // answerable again, so a fired responder re-arms once its needle
  // disappears from the decoded scrollback, up to maxFires (default 1).
  maxFires?: number;
}

const KIND_DIALOG_RESPONDERS: Record<string, DialogResponder[]> = {
  // Codex >= 0.130 gates first-run on a "Hooks need review" dialog whenever
  // CODEX_HOME contains hooks the user hasn't accepted. The supervisor stages
  // a fresh hook bundle into a temp CODEX_HOME each test invocation, so we
  // always see this prompt; auto-select "2. Trust all and continue".
  codex: [
    {
      needle: /Hooks\s*need\s*review/i,
      response: "2\r",
      reason: "codex: accept hooks trust dialog",
      maxFires: 2,
    },
    {
      // Codex 0.155+ blocks startup on a model-retirement modal while the
      // pinned model is being retired ("GPT-5.5 retires on October 14, 2026.
      // … › 1. Try new model  2. Use existing model"). Answering "2" keeps
      // the configured model instead of switching the CLI's default.
      needle: /retires\s*on|Choose\s*how\s*you'd\s*like\s*Codex\s*to\s*proceed/i,
      response: "2\r",
      reason: "codex: keep configured model on retirement modal",
      maxFires: 2,
    },
    {
      // Non-deterministic update-available modal ("✨ Update available!
      // 0.155.1 -> 0.156.0 … › 1. Update now  2. Skip  3. Skip until next
      // version"). Answer "2" — the default is "Update now", which pipes a
      // remote install script through `sh`, so a bare "\r" here is dangerous.
      // Require the modal's own option chrome, not words a model reply could
      // contain: this needle is matched against the whole decoded transcript.
      needle: /Update\s*available!?[\s\S]*Update\s*now[\s\S]*Skip\s*until\s*next\s*version/i,
      response: "2\r",
      reason: "codex: skip update-available modal (default is Update now!)",
      maxFires: 2,
    },
  ],
  // Claude 2.1.280 re-runs first-run onboarding on interactive TUI launches
  // when the stored onboarding version lags the CLI — dir-independent and
  // unaffected by adapter flags. The captured probe chain is: theme screen
  // ("Choose the text style…", cursor already on the default "2. Dark mode ✔")
  // → security-notes screen → folder-trust dialog → bypass-permissions
  // confirmation. Which screens re-appear varies per launch (partial state
  // persists), so every responder stays armed. Screens paint word-by-word,
  // so the decoded text drops spaces inside dialog bodies; needles join with
  // \s* so they match painted and stripped renderings alike.
  claude: [
    {
      needle: /Choose\s*the\s*text\s*style/i,
      response: "\r",
      reason: "claude: accept default theme on first-run onboarding",
      maxFires: 3,
    },
    {
      // Static security notice after the theme screen ("Security notes: …
      // Learn more: https://code.claude.com/docs/en/security — Press Enter to
      // continue…"). Advances on Enter. Anchored on "Security notes" so the
      // trailing "Press enter to continue" phrasing can never match a codex
      // modal.
      needle: /Security\s*notes[\s\S]*Press\s*Enter\s*to\s*continue/i,
      response: "\r",
      reason: "claude: accept security notes",
      maxFires: 2,
    },
    {
      // Folder-trust dialog for the repo cwd ("⚠ This folder pre-approves 23
      // tool permissions in .claude/settings.local.json …"). The default
      // cursor sits on "❯ No, exit", so a bare Enter would terminate the CLI —
      // send Down+Enter to select "Yes, I trust this folder". Never answer
      // this dialog with a plain "\r".
      needle: /Yes,\s*I\s*trust\s*this\s*folder/i,
      response: "\x1b[B\r",
      reason: "claude: trust repo folder (down+enter, default is No)",
      maxFires: 2,
    },
    {
      // Bypass-permissions confirmation, shown because the supervisor launches
      // claude with --allow-dangerously-skip-permissions ("In Bypass
      // Permissions mode, Claude Code will not ask for your approval …").
      // Default cursor is again "❯ No, exit" — send Down+Enter to select
      // "Yes, I accept". Never answer this dialog with a plain "\r".
      needle: /Bypass\s*Permissions[\s\S]*Yes,\s*I\s*accept/i,
      response: "\x1b[B\r",
      reason: "claude: accept bypass-permissions dialog (down+enter, default is No)",
      maxFires: 2,
    },
  ],
  // qodercli gates an untrusted cwd on its folder-trust dialog before the
  // composer paints ("Do you trust the files in this folder?" — the suite's
  // repo cwd is not in qoder's permissions.trustDirectories), and no prompt
  // is ever submitted while it blocks. The default cursor sits on
  // "❯ 1. Trust folder", so bare Enter is the SAFE answer here (unlike the
  // claude/codex dialogs above, whose defaults exit). Answering persists the
  // cwd into ~/.qoder/settings.json → permissions.trustDirectories — the
  // same class of host side effect as the claude trust responder.
  qoder: [
    {
      needle: /Do\s*you\s*trust\s*the\s*files\s*in\s*this\s*folder/i,
      response: "\r",
      reason: "qoder: trust folder (default is Trust folder)",
      maxFires: 2,
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
  const responders = (KIND_DIALOG_RESPONDERS[kind] ?? []).map((r) => ({
    ...r,
    maxFires: r.maxFires ?? 1,
    fires: 0,
    armed: true,
  }));
  const state = { stopped: false };
  void (async () => {
    // Beyond painted dialogs, some CLIs probe the terminal with device
    // queries during startup and stall or exit silently when nothing answers
    // (muse 1.3.x sends OSC palette queries, kitty `CSI ?u`, primary DA
    // `CSI c`, and cursor-position `CSI 6n`, then exits 0 with no output).
    // The real app is unaffected — its xterm.js surface parses the queries
    // and emits the replies through its onData channel — but the headless
    // supervisor PTY answers nothing. Emulate that one terminal behavior
    // here, generically for every kind: watch the RAW (undecoded) scrollback
    // for new `CSI 6n` cursor-position queries and answer each new
    // occurrence once with a `CSI 1;1R` report. Strictly reactive — nothing
    // else is ever written, and `decodeScrollbackText` strips CSI sequences,
    // so the queries are invisible to the needle responders below and the
    // report bytes never satisfy a needle either. Transcripts are
    // append-only per launch, so answered occurrences are counted per
    // transcript; a shrinking raw scrollback means the resume leg's fresh
    // transcript has started and counting restarts.
    const CURSOR_QUERY = "\x1b[6n";
    const CURSOR_REPORT = "\x1b[1;1R";
    let answeredQueries = 0;
    let lastRawLength = 0;
    while (!state.stopped) {
      const raw = runtime.threadSessionManager.readTerminalScrollback(threadId);
      if (raw.length < lastRawLength) answeredQueries = 0;
      lastRawLength = raw.length;
      let queries = 0;
      for (let idx = raw.indexOf(CURSOR_QUERY); idx !== -1; queries += 1) {
        idx = raw.indexOf(CURSOR_QUERY, idx + CURSOR_QUERY.length);
      }
      while (queries > answeredQueries) {
        answeredQueries += 1;
        try {
          await runtime.threadSessionManager.writeTerminal({ threadId, data: CURSOR_REPORT });
          // eslint-disable-next-line no-console
          console.log(
            "[int-test] auto-respond → cursor-position query (CSI 6n) with CSI 1;1R report",
          );
        } catch {
          answeredQueries -= 1;
          break; // PTY may have closed; ignore.
        }
      }
      const text = decodeScrollbackText(raw);
      for (const r of responders) {
        const matched = r.needle.test(text);
        if (matched && r.armed && r.fires < r.maxFires) {
          r.armed = false;
          r.fires += 1;
          try {
            await runtime.threadSessionManager.writeTerminal({ threadId, data: r.response });
            // eslint-disable-next-line no-console
            console.log(`[int-test] auto-respond → ${r.reason}`);
          } catch {
            // PTY may have closed; ignore.
          }
        } else if (!matched && !r.armed) {
          // The needle left the fresh-per-launch transcript, so the next
          // launch (resume leg) can be answered again.
          r.armed = true;
        }
      }
      // No early exit: the cursor-query watch must stay armed for the whole
      // thread lifetime (including the resume relaunch), so the loop stops
      // only via the returned cancel, which the test's finally always calls.
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
    const snapshot = runtime.threadSessionManager
      .getThreadSnapshots()
      .find((s) => s.threadId === threadId);
    if (snapshot?.sessionRef?.providerSessionId) {
      return snapshot.sessionRef;
    }
    await sleep(500);
  }
  const tail = runtime.threadSessionManager
    .readTerminalScrollback(threadId)
    .slice(-600)
    .replace(/\s+/g, " ")
    .trim();
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
    const scrollback = runtime.threadSessionManager.readTerminalScrollback(threadId);
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
    const scrollback = runtime.threadSessionManager.readTerminalScrollback(threadId);
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
  prevDataDir: process.env.PORACODE_DATA_DIR,
  adapters: [],
};

beforeAll(() => {
  // Use the actual repo root as the project cwd so providers that gate launch
  // on directory trust (Claude's "Do you trust this folder?" dialog, Cursor's
  // workspace prompt, etc.) don't block on a never-seen tmp path. The test
  // prompt is "reply OK" — providers do not write files for that — so using
  // the repo dir is non-destructive. Supervisor state stays isolated via
  // PORACODE_DATA_DIR (set per test in beforeEach).
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
  ctx.dataDir = mkdtempSync(join(tmpdir(), "poracode-int-"));
  process.env.PORACODE_DATA_DIR = ctx.dataDir;
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
    delete process.env.PORACODE_DATA_DIR;
  } else {
    process.env.PORACODE_DATA_DIR = ctx.prevDataDir;
  }
  // Only remove the data dir — `ctx.cwd` is the poracode repo root and must
  // never be deleted.
  if (ctx.dataDir) rmSync(ctx.dataDir, { recursive: true, force: true });
});

const REGISTRY_KINDS = createAgentRegistry().map((a) => a.kind);

// Validated once at module load: an invalid list fails the whole file with an
// actionable error before any provider is started.
const REQUIRED_PROVIDERS = parseRequiredLiveProviders(
  process.env[LIVE_PROVIDERS_REQUIRED_ENV],
  REGISTRY_KINDS,
);

describe("provider lifecycle: create → unload → resume → initial message visible", () => {
  for (const kind of REGISTRY_KINDS) {
    it(`${kind}`, async (testCtx) => {
      // Strict mode converts every skip below into a hard failure for the
      // named kinds only; all other providers keep ordinary skip behavior.
      const isRequired = REQUIRED_PROVIDERS.names.includes(kind);
      const skipOrThrow = (reason: string) =>
        skipOrThrowRequired(testCtx, isRequired, kind, reason);

      const adapter = ctx.adapters.find((a) => a.kind === kind);
      if (!adapter) {
        skipOrThrow(`adapter ${kind} not in registry`);
        return;
      }

      if (!adapter.capabilities.supportsResume) {
        skipOrThrow(`${kind}: adapter does not support resume`);
        return;
      }

      const presentationModes = adapter.capabilities.presentationModes ?? [
        adapter.capabilities.presentationMode,
      ];
      if (!presentationModes.includes("terminal")) {
        skipOrThrow(`${kind}: adapter does not support terminal presentation`);
        return;
      }

      const status = await adapter.detectInstall();
      if (!status.installed) {
        skipOrThrow(`${kind}: CLI not installed`);
        return;
      }
      if (status.authState !== "authenticated") {
        skipOrThrow(`${kind}: authState=${status.authState} (need "authenticated")`);
        return;
      }

      const model = pickCheapModel(adapter, status);
      if (!model) {
        skipOrThrow(`${kind}: no model available in capabilities`);
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
        await ctx.runtime.threadSessionManager.startThread(startPayload);
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
        await ctx.runtime.threadSessionManager.closeThread({ threadId });
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
        await ctx.runtime.threadSessionManager.startThread(resumePayload);

        // After resume, the provider CLI normally reprints prior conversation
        // history into the PTY. Assert the original prompt's token is back
        // in scrollback.
        await waitForScrollbackMatch(
          ctx.runtime,
          threadId,
          PROMPT_TOKEN,
          SCROLLBACK_WAIT_TIMEOUT_MS,
        );

        const scrollback = ctx.runtime.threadSessionManager.readTerminalScrollback(threadId);
        expect(scrollback).toContain(PROMPT_TOKEN);
      } finally {
        stopResponder();
        try {
          await ctx.runtime.threadSessionManager.closeThread({ threadId });
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
