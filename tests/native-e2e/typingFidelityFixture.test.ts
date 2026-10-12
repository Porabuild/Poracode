import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertBaselineArmReady, computeArmRecord, readObserverAck } from "./helpers/armFreeze.ts";
import {
  ManagedCdpClient,
  launchManagedAppSession,
  stopManagedAppSession,
  type ManagedAppSession,
} from "./helpers/managedAppSession.ts";
import {
  buildPaneSetupScript,
  seedQualificationFixture,
  waitForFixtureThreadsInStore,
  waitForNaturalBoot,
  waitForVisiblePanes,
  type QualificationCellSpec,
  type QualificationFixture,
} from "./helpers/qualificationCell.ts";

/**
 * Focused real-app typing-fidelity fixture.
 *
 * One managed Electron session on the frozen arm, one seeded visible chat pane,
 * and one declared probe string typed into the REAL focused composer through
 * the harness trusted-input helper (`ManagedCdpClient.trustedType`). The actual
 * editable text read back from the live contenteditable must equal the declared
 * workload with each character inserted exactly once; a raw page-side event log
 * (keydown/keypress/beforeinput/input, trusted flags and `data`) is captured to
 * prove the insertion mechanism independently of the helper's own report.
 *
 * This gate exists because a prior helper sequence dispatched both a keyDown
 * carrying `text` and a separate `char` event with the same text, so every
 * declared character was inserted twice. Typing fidelity is not provable from
 * latency or long-task evidence; it needs this read-back.
 *
 * Opt-in only (`V2Q_TYPING_FIDELITY=1` plus the arm env): it launches a real
 * app and never runs in the ordinary suite.
 */

const ARM_ROOT = process.env.V2Q_ARM_ROOT ?? "";
const OUT_DIR = process.env.V2Q_OUT_DIR ?? "";
const ACK_PATH =
  process.env.V2Q_OBSERVER_ACK ??
  join(process.cwd(), "tmp/v2-production/a0-startup-corrected-ack.json");
const ENABLED =
  process.env.V2Q_TYPING_FIDELITY === "1" && ARM_ROOT.length > 0 && OUT_DIR.length > 0;

const COMPOSER_SELECTOR = '[data-composer-input-anchor] [contenteditable="true"]';

const TYPING_FIDELITY_SPEC: QualificationCellSpec = {
  id: "typing-fidelity",
  label: "single-pane real-composer typing fidelity",
  producers: 0,
  clients: 0,
  legacyClient: false,
  slowClient: false,
  reconnectClient: false,
  visibleChatPanes: 1,
  terminalSurface: "none",
  visibleTerminal: false,
  catalogThreads: 0,
  durationMs: 30_000,
  protocol: "idle",
  assertBudgets: false,
  trustedInput: null,
  structuredWorkload: null,
};

const EVENT_RECORDER_KEY = "__v2qTypingFidelity";
const EVENT_CAPACITY = 400;

function writeJson(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function readableEditableTextExpression(selector: string): string {
  return (
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});` +
    ` if (!el) return null;` +
    ` if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;` +
    ` if (el instanceof HTMLElement && el.isContentEditable) return el.textContent ?? "";` +
    ` return null; })()`
  );
}

/**
 * The pane anchor commits before the editor's inner contenteditable mounts, so
 * the fixture waits (bounded) for a readable editable element instead of racing
 * one render tick. A composer that never becomes readable is still a failure.
 */
async function waitForReadableComposer(
  cdp: ManagedCdpClient,
  selector: string,
  timeoutMs = 15_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const text = await cdp
      .evaluate<string | null>(readableEditableTextExpression(selector))
      .catch(() => null);
    if (text !== null) return text;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function installEventRecorderExpression(): string {
  return `(() => {
    if (window.${EVENT_RECORDER_KEY}) return "present";
    const state = { events: [], truncated: false };
    window.${EVENT_RECORDER_KEY} = state;
    const record = (event) => {
      if (state.events.length >= ${String(EVENT_CAPACITY)}) {
        state.truncated = true;
        return;
      }
      state.events.push({
        type: event.type,
        isTrusted: event.isTrusted === true,
        key: typeof event.key === "string" ? event.key : null,
        data: typeof event.data === "string" ? event.data : null,
        inputType: typeof event.inputType === "string" ? event.inputType : null,
      });
    };
    for (const type of ["keydown", "keypress", "beforeinput", "input", "keyup"]) {
      document.addEventListener(type, record, true);
    }
    return "installed";
  })()`;
}

function readEventRecorderExpression(): string {
  return (
    `(() => { const state = window.${EVENT_RECORDER_KEY};` +
    ` if (!state) return null;` +
    ` return { events: state.events.slice(), truncated: state.truncated === true }; })()`
  );
}

interface TypingEventRecord {
  readonly type: string;
  readonly isTrusted: boolean;
  readonly key: string | null;
  readonly data: string | null;
  readonly inputType: string | null;
}

interface TypingEventLog {
  readonly events: readonly TypingEventRecord[];
  readonly truncated: boolean;
}

let armRecord: Record<string, unknown> | undefined;
let session: ManagedAppSession | undefined;
let cdp: ManagedCdpClient | undefined;
let fixture: QualificationFixture | undefined;
let teardownError: string | null = null;

describe.skipIf(!ENABLED)("typing fidelity fixture (real focused composer)", () => {
  beforeAll(async () => {
    const ack = readObserverAck(ACK_PATH);
    const record = computeArmRecord(ARM_ROOT, ack);
    assertBaselineArmReady(record, ack);
    armRecord = record as unknown as Record<string, unknown>;
    mkdirSync(OUT_DIR, { recursive: true });
    writeJson(join(OUT_DIR, "evidence", "arm-record.json"), armRecord);

    const startedAt = Date.now();
    const sessionRoot = join(
      homedir(),
      ".poracode-smoke",
      "v2q",
      `${basename(ARM_ROOT)}-typing-fidelity-${String(startedAt)}`,
    );
    session = await launchManagedAppSession({
      armRoot: ARM_ROOT,
      sessionRoot,
      mode: "mock",
      launcherTimeoutSeconds: 900,
    });
    writeJson(join(OUT_DIR, "evidence", "session-manifest.json"), session.raw);
    cdp = await ManagedCdpClient.connect({ cdpPort: session.cdpPort, appUrl: session.appUrl });
    await cdp.waitForRendererReady();
    if (!(await cdp.hasDevBridge())) {
      throw new Error(
        "managed renderer has no DEV bridge; the fixture needs the skill-managed app",
      );
    }
    fixture = await seedQualificationFixture({
      cdp,
      spec: TYPING_FIDELITY_SPEC,
      expectedProjectDir: session.projectDir,
    });
    writeJson(join(OUT_DIR, "evidence", "fixture.json"), fixture);
    await cdp.enablePerfDiagnosticsAndReload({
      timeoutMs: 90_000,
      evidenceDir: join(OUT_DIR, "evidence"),
      label: "typing-fidelity-diagnostics",
    });
    const naturalBoot = await waitForNaturalBoot({ cdp, timeoutMs: 90_000 });
    writeJson(join(OUT_DIR, "evidence", "natural-boot.json"), naturalBoot);
    await waitForFixtureThreadsInStore({ cdp, fixture, timeoutMs: 30_000 });
    const paneSetup = await cdp.evaluate(
      buildPaneSetupScript({ chatThreadIds: [fixture.chatThreadIds[0]!], terminalThreadId: null }),
    );
    if ((paneSetup as { ok?: boolean }).ok !== true) {
      throw new Error(`typing-fidelity pane setup failed: ${JSON.stringify(paneSetup)}`);
    }
    const panes = await waitForVisiblePanes({
      cdp,
      spec: TYPING_FIDELITY_SPEC,
      expectedPaneCount: 1,
      timeoutMs: 60_000,
    });
    writeJson(join(OUT_DIR, "evidence", "visible-panes.json"), panes);
    if ((panes.composerCount ?? 0) < 1) {
      throw new Error(`no composer rendered: ${JSON.stringify(panes)}`);
    }
    await cdp.prepareForegroundSurface();
  }, 900_000);

  afterAll(async () => {
    if (cdp) {
      writeJson(join(OUT_DIR, "evidence", "console.json"), cdp.consoleLog());
    }
    if (session) {
      try {
        await stopManagedAppSession({ armRoot: ARM_ROOT, sessionFile: session.sessionFile });
      } catch (error) {
        teardownError = error instanceof Error ? error.message : String(error);
        writeJson(join(OUT_DIR, "evidence", "teardown.json"), { teardownError });
      }
    }
  }, 300_000);

  it("inserts each declared character exactly once in the real composer", async () => {
    if (!cdp || !fixture) throw new Error("typing fidelity fixture did not initialize");
    const declaredText = "v2q fidelity probe 012";
    await cdp.evaluate(installEventRecorderExpression());
    const beforeText = await waitForReadableComposer(cdp, COMPOSER_SELECTOR);
    expect(
      beforeText !== null,
      "the real composer must be present and readable before typing",
    ).toBe(true);
    expect(beforeText === "", "the fixture composer must start empty").toBe(true);
    const rect = await cdp.evaluate<{ x: number; y: number; width: number; height: number } | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)});` +
        ` if (!el) return null; const r = el.getBoundingClientRect();` +
        ` return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
    );
    const typingStartedAt = Date.now();
    let typingError: string | null = null;
    try {
      await cdp.trustedType(COMPOSER_SELECTOR, declaredText);
    } catch (error) {
      typingError = error instanceof Error ? error.message : String(error);
    }
    const afterText = await cdp.evaluate<string | null>(
      readableEditableTextExpression(COMPOSER_SELECTOR),
    );
    const recorder = await cdp.evaluate<TypingEventLog | null>(readEventRecorderExpression());
    const screenshot = (await cdp
      .send("Page.captureScreenshot", { format: "jpeg", quality: 70 }, 15_000)
      .catch(() => null)) as { data?: unknown } | null;
    const screenshotData = typeof screenshot?.data === "string" ? screenshot.data : null;
    if (screenshotData !== null) {
      writeFileSync(
        join(OUT_DIR, "evidence", "typing-fidelity-composer.jpg"),
        Buffer.from(screenshotData, "base64"),
        { mode: 0o600 },
      );
    }
    // One `input` event per text insertion: a correct trusted key dispatch
    // produces exactly one per declared character; the doubled helper
    // sequence produced two (one from keyDown-with-text, one from `char`).
    const inputEventData = (recorder?.events ?? [])
      .filter((event) => event.type === "input")
      .map((event) => event.data ?? "");
    writeJson(join(OUT_DIR, "evidence", "typing-fidelity.json"), {
      declaredText,
      declaredChars: declaredText.length,
      beforeText,
      afterText,
      observedChars: afterText?.length ?? null,
      composerRect: rect,
      typingError,
      typingDurationMs: Date.now() - typingStartedAt,
      pageEvents: recorder,
      pageInputEventCount: inputEventData.length,
      pageInputEventDataJoined: inputEventData.join(""),
      screenshotPath: screenshotData === null ? null : "typing-fidelity-composer.jpg",
      trustedInput: {
        kind: "cdp-input-dispatch-key-events",
        note: "the CDP Input dispatch path produces isTrusted key events; the page recorder proves it",
        trustedEventCount: (recorder?.events ?? []).filter((event) => event.isTrusted).length,
      },
      arm: armRecord,
    });
    expect(typingError === null).toBe(true);
    // Diagnostics for a mismatch are already written to typing-fidelity.json
    // (declared/before/after strings and the raw page event log).
    expect(afterText).toBe(declaredText);
    expect(recorder).not.toBeNull();
    expect(recorder?.truncated === false).toBe(true);
    expect(inputEventData.join("")).toBe(declaredText);
  }, 600_000);
});
