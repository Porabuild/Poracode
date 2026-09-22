import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import { LOOPBACK_HOST } from "../harness/constants.ts";

/**
 * Managed Electron session driver for the v2 architecture qualification cells.
 *
 * Staging and teardown are owned by the interactive-testing skill launcher
 * (`poracode-cdp.mjs launch/stop`): the arm's own copy of the skill scripts is
 * invoked from the arm root, so the session-owned runtime snapshot, its hashes
 * and the verified teardown come from the frozen arm and not this checkout.
 * This module only drives the resulting session over CDP.
 */

export interface ManagedAppSession {
  readonly sessionFile: string;
  readonly root: string;
  readonly appUrl: string;
  readonly cdpPort: number;
  readonly devServerPort: number;
  readonly baseDir: string;
  readonly projectDir: string;
  readonly outDir: string;
  readonly ownerPid: number;
  readonly appPid: number | null;
  readonly mode: "mock" | "real";
  readonly runtime: Record<string, unknown> | null;
  readonly raw: Record<string, unknown>;
}

export function managedLauncherPath(armRoot: string): string {
  return join(armRoot, ".agents", "skills", "interactive-testing", "scripts", "poracode-cdp.mjs");
}

/** Extracts the launcher's JSON manifest from stdout that may carry log noise. */
export function extractJsonObject(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`managed launcher produced no JSON manifest: ${stdout.slice(-500)}`);
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1)) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("managed launcher JSON manifest is not an object");
  }
  return parsed as Record<string, unknown>;
}

function requiredString(raw: Record<string, unknown>, key: string, sessionFile: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`managed session ${sessionFile} is missing ${key}`);
  }
  return value;
}

export function readManagedSession(sessionFile: string): ManagedAppSession {
  const raw = JSON.parse(readFileSync(sessionFile, "utf8")) as Record<string, unknown>;
  const mode = raw.mode === "real" ? "real" : raw.mode === "mock" ? "mock" : null;
  if (mode === null) throw new Error(`managed session ${sessionFile} has an invalid mode`);
  const runtime = raw.runtime;
  return {
    sessionFile,
    root: requiredString(raw, "root", sessionFile),
    appUrl: requiredString(raw, "appUrl", sessionFile),
    cdpPort: Number(raw.cdpPort),
    devServerPort: Number(raw.devServerPort),
    baseDir: requiredString(raw, "baseDir", sessionFile),
    projectDir: requiredString(raw, "projectDir", sessionFile),
    outDir: requiredString(raw, "outDir", sessionFile),
    ownerPid: Number(raw.ownerPid),
    appPid: typeof raw.appPid === "number" ? raw.appPid : null,
    mode,
    runtime:
      typeof runtime === "object" && runtime !== null ? (runtime as Record<string, unknown>) : null,
    raw,
  };
}

function runLauncher(input: {
  readonly armRoot: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    // `undefined` values are dropped (Node skips them on spawn), so a caller
    // can explicitly clear an inherited variable for the child.
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries({ ...process.env, ...input.env })) {
      if (value !== undefined) env[key] = value;
    }
    const child = spawn(process.execPath, [managedLauncherPath(input.armRoot), ...input.args], {
      cwd: input.armRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`managed launcher timed out after ${String(input.timeoutMs)}ms`));
    }, input.timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) resolve(out);
      else reject(new Error(`managed launcher exited ${String(code)}: ${err.slice(-1000)}`));
    });
  });
}

export async function launchManagedAppSession(input: {
  readonly armRoot: string;
  readonly sessionRoot: string;
  /**
   * Smoke-launcher isolation mode. `mock` (default) sets
   * `PORACODE_MOCK_AGENTS=1` and refuses every provider spawn. A structured
   * workload cell must use `real`: the fixture is a real ACP child launched by
   * the supervisor, and the mock guard must never be weakened to run it.
   */
  readonly mode?: "mock" | "real";
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /**
   * Bound the launcher's own READY wait (`--timeout` seconds). The launcher
   * builds the arm's session-owned runtime first, so a cold arm can exceed its
   * 180 s default before the app is ready.
   */
  readonly launcherTimeoutSeconds?: number;
}): Promise<ManagedAppSession> {
  const args = ["launch", "--new", "--mode", input.mode ?? "mock", "--root", input.sessionRoot];
  if (input.launcherTimeoutSeconds !== undefined) {
    args.push("--timeout", String(input.launcherTimeoutSeconds));
  }
  const stdout = await runLauncher({
    armRoot: input.armRoot,
    args,
    env: { ...process.env, ...input.env },
    timeoutMs: input.timeoutMs ?? (input.launcherTimeoutSeconds ?? 180) * 1000 + 120_000,
  });
  const manifest = extractJsonObject(stdout);
  const sessionFile = String(manifest.sessionFile);
  return readManagedSession(sessionFile);
}

export async function stopManagedAppSession(input: {
  readonly armRoot: string;
  readonly sessionFile: string;
  readonly timeoutMs?: number;
}): Promise<void> {
  const timeoutSeconds = Math.ceil((input.timeoutMs ?? 90_000) / 1000);
  const stdout = await runLauncher({
    armRoot: input.armRoot,
    args: ["stop", "--session", input.sessionFile, "--timeout", String(timeoutSeconds)],
    env: process.env,
    timeoutMs: (input.timeoutMs ?? 90_000) + 30_000,
  });
  if (!stdout.includes("stop:ok")) {
    throw new Error(`managed session teardown did not verify: ${stdout.slice(-500)}`);
  }
}

export interface CdpTarget {
  readonly id: string;
  readonly url: string;
  readonly webSocketDebuggerUrl: string;
}

async function listCdpTargets(cdpPort: number): Promise<CdpTarget[]> {
  const response = await fetch(`http://${LOOPBACK_HOST}:${String(cdpPort)}/json/list`);
  if (!response.ok) throw new Error(`CDP target list failed: HTTP ${String(response.status)}`);
  const parsed = (await response.json()) as Array<Record<string, unknown>>;
  return parsed
    .filter((target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    .map((target) => ({
      id: String(target.id),
      url: String(target.url ?? ""),
      webSocketDebuggerUrl: String(target.webSocketDebuggerUrl),
    }));
}

/** The renderer target is the one whose URL equals the app URL, ignoring the
 * session query the smoke launcher appends. */
export function targetMatchesAppUrl(target: CdpTarget, appUrl: string): boolean {
  const strip = (value: string): string => value.split("?")[0] ?? value;
  return strip(target.url) === strip(appUrl);
}

interface CdpPending {
  readonly method: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** One bounded console/exception/log record captured from the renderer target. */
export interface CdpConsoleEntry {
  readonly kind: "console" | "exception" | "log";
  readonly level: string;
  readonly text: string;
  readonly atMs: number;
}

const CONSOLE_ENTRY_CAPACITY = 300;

/** Fidelity evidence for one trusted typing call. */
export interface TrustedTypingEvidence {
  readonly selector: string;
  readonly declaredText: string;
  readonly declaredChars: number;
  readonly beforeText: string | null;
  readonly afterText: string | null;
  /** `afterText.length - beforeText.length` when both reads succeeded. */
  readonly insertedChars: number | null;
  /**
   * True when `afterText` equals `beforeText` with the declared workload
   * inserted exactly once at a single caret position (or, for an empty
   * workload, when the text is unchanged).
   */
  readonly insertedExactlyOnce: boolean;
  readonly insertionAssertion: "verified" | "not-asserted";
}

/**
 * Physical-key fields for one US-layout printable character in the Chromium
 * `Input.dispatchKeyEvent` shape. `windowsVirtualKeyCode`/`nativeVirtualKeyCode`
 * are the legacy virtual key codes a real keyboard reports (uppercase letters
 * are the VK for their base key, shifted glyphs keep the base key's VK and set
 * the Shift modifier), and `code` is the physical key code.
 */
export interface UsPhysicalKey {
  readonly key: string;
  readonly code: string;
  readonly text: string;
  readonly unmodifiedText: string;
  readonly windowsVirtualKeyCode: number;
  readonly nativeVirtualKeyCode: number;
  /** CDP modifier bitmask: 8 = Shift. */
  readonly modifiers: number;
}

/** US-layout base keys and their shifted glyphs (Shift = 8). */
const US_PUNCTUATION_KEYS: Readonly<
  Record<string, { readonly code: string; readonly vk: number }>
> = {
  "`": { code: "Backquote", vk: 192 },
  "-": { code: "Minus", vk: 189 },
  "=": { code: "Equal", vk: 187 },
  "[": { code: "BracketLeft", vk: 219 },
  "]": { code: "BracketRight", vk: 221 },
  "\\": { code: "Backslash", vk: 220 },
  ";": { code: "Semicolon", vk: 186 },
  "'": { code: "Quote", vk: 222 },
  ",": { code: "Comma", vk: 188 },
  ".": { code: "Period", vk: 190 },
  "/": { code: "Slash", vk: 191 },
};

/** Shifted digit row glyphs mapped to their base digit. */
const US_SHIFTED_DIGITS: Readonly<Record<string, string>> = {
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
};

/** Shifted punctuation glyphs mapped to their base key. */
const US_SHIFTED_PUNCTUATION: Readonly<Record<string, string>> = {
  "~": "`",
  _: "-",
  "+": "=",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
};

/**
 * Maps one printable US-layout character to the physical-key fields a real
 * key press reports. The legacy virtual key code must be the *key's* code, not
 * the character's code point: `p` is VK 80 (`KeyP`), not 112 (VK_F1), and `$`
 * is VK 52 on `Digit4`, not 36 (VK_HOME). KeyCode-sensitive consumers such as
 * xterm's `evaluateKeyboardEvent` dispatch on those legacy codes, so sending
 * `codePointAt(0)` silently turned typed letters into F-key escape sequences.
 * Shifted glyphs keep their base key's VK and carry the Shift modifier bit.
 * Returns null for characters with no single US physical key (e.g. newline or
 * non-ASCII text), so callers can choose their own handling.
 */
export function usPhysicalKey(character: string): UsPhysicalKey | null {
  const codePoint = character.codePointAt(0) ?? 0;
  if (character.length !== 1 || codePoint < 0x20 || codePoint > 0x7e) return null;
  if (character === " ") {
    return {
      key: " ",
      code: "Space",
      text: " ",
      unmodifiedText: " ",
      windowsVirtualKeyCode: 32,
      nativeVirtualKeyCode: 32,
      modifiers: 0,
    };
  }
  if (character >= "a" && character <= "z") {
    const upper = character.toUpperCase();
    return {
      key: character,
      code: `Key${upper}`,
      text: character,
      unmodifiedText: character,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      nativeVirtualKeyCode: upper.charCodeAt(0),
      modifiers: 0,
    };
  }
  if (character >= "A" && character <= "Z") {
    return {
      key: character,
      code: `Key${character}`,
      text: character,
      unmodifiedText: character.toLowerCase(),
      windowsVirtualKeyCode: character.charCodeAt(0),
      nativeVirtualKeyCode: character.charCodeAt(0),
      modifiers: 8,
    };
  }
  if (character >= "0" && character <= "9") {
    return {
      key: character,
      code: `Digit${character}`,
      text: character,
      unmodifiedText: character,
      windowsVirtualKeyCode: character.charCodeAt(0),
      nativeVirtualKeyCode: character.charCodeAt(0),
      modifiers: 0,
    };
  }
  const shiftedDigit = US_SHIFTED_DIGITS[character];
  if (shiftedDigit) {
    return {
      key: character,
      code: `Digit${shiftedDigit}`,
      text: character,
      unmodifiedText: shiftedDigit,
      windowsVirtualKeyCode: shiftedDigit.charCodeAt(0),
      nativeVirtualKeyCode: shiftedDigit.charCodeAt(0),
      modifiers: 8,
    };
  }
  const base = US_PUNCTUATION_KEYS[character] ? character : US_SHIFTED_PUNCTUATION[character];
  if (!base) return null;
  const physical = US_PUNCTUATION_KEYS[base];
  if (!physical) return null;
  return {
    key: character,
    code: physical.code,
    text: character,
    unmodifiedText: base,
    windowsVirtualKeyCode: physical.vk,
    nativeVirtualKeyCode: physical.vk,
    modifiers: character === base ? 0 : 8,
  };
}

/**
 * Pure matcher for "the declared text was inserted exactly once": `after` must
 * be `before` with `inserted` written at exactly one caret position, with no
 * added or removed characters. A doubled insertion (the same text written twice
 * per dispatch) fails the length check; a partial insertion fails the
 * one-position match.
 */
export function editableTextInsertedExactlyOnce(
  before: string,
  after: string,
  inserted: string,
): boolean {
  if (inserted.length === 0) return before === after;
  if (after.length !== before.length + inserted.length) return false;
  for (let index = 0; index <= before.length; index += 1) {
    if (
      after.startsWith(inserted, index) &&
      after.slice(0, index) === before.slice(0, index) &&
      after.slice(index + inserted.length) === before.slice(index)
    ) {
      return true;
    }
  }
  return false;
}

/** The renderer document facts used to tell a pre-reload document from its replacement. */
interface CdpDocumentState {
  readonly timeOriginMs: number | null;
  readonly reloadToken: string | null;
  readonly readyState: string | null;
  readonly rootChildren: number;
  readonly hostBridge: string;
  readonly diagnosticsHandle: string;
}

export class ManagedCdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, CdpPending>();
  private readonly consoleEntries: CdpConsoleEntry[] = [];
  private readonly targetId: string;
  private readonly targetAppUrl: string;
  private readonly cdpPort: number;
  private loadEventCount = 0;
  private executionContextDestructionCount = 0;
  private captureEnabled = false;

  private constructor(
    private readonly ws: WebSocket,
    binding: { readonly targetId: string; readonly appUrl: string; readonly cdpPort: number },
  ) {
    this.targetId = binding.targetId;
    this.targetAppUrl = binding.appUrl;
    this.cdpPort = binding.cdpPort;
    ws.on("message", (data: WebSocket.RawData) => {
      try {
        this.handleMessage(JSON.parse(String(data)) as Record<string, unknown>);
      } catch {
        // Malformed CDP frames are ignored; the command timeout owns failures.
      }
    });
  }

  static async connect(input: {
    readonly cdpPort: number;
    readonly appUrl: string;
    /** Target returned by the managed window-kind inspector; required when URLs are ambiguous. */
    readonly targetId?: string;
    readonly timeoutMs?: number;
  }): Promise<ManagedCdpClient> {
    const deadline = Date.now() + (input.timeoutMs ?? 120_000);
    let target: CdpTarget | undefined;
    for (;;) {
      const targets = await listCdpTargets(input.cdpPort).catch(() => [] as CdpTarget[]);
      const matching = targets.filter(
        (candidate) =>
          targetMatchesAppUrl(candidate, input.appUrl) &&
          (input.targetId === undefined || candidate.id === input.targetId),
      );
      if (matching.length > 1) {
        throw new Error("ambiguous managed renderer app URL; pass an inspected targetId");
      }
      target = matching[0];
      if (target) break;
      if (Date.now() >= deadline) {
        throw new Error(
          `no managed renderer CDP target matching ${input.appUrl} on port ${String(input.cdpPort)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("timed out opening the managed renderer CDP socket")),
        10_000,
      );
      ws.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const client = new ManagedCdpClient(ws, {
      targetId: target.id,
      appUrl: input.appUrl,
      cdpPort: input.cdpPort,
    });
    await client.enableCapture();
    return client;
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout after ${String(timeoutMs)}ms: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
    });
  }

  private handleMessage(payload: Record<string, unknown>): void {
    const id = payload.id;
    if (typeof id !== "number") {
      this.handleEvent(payload);
      return;
    }
    const item = this.pending.get(id);
    if (!item) return;
    this.pending.delete(id);
    clearTimeout(item.timer);
    if (payload.error) {
      item.reject(new Error(`${item.method}: ${JSON.stringify(payload.error)}`));
      return;
    }
    item.resolve(payload.result);
  }

  private handleEvent(payload: Record<string, unknown>): void {
    if (typeof payload.method !== "string") return;
    const params = (payload.params ?? {}) as Record<string, unknown>;
    if (payload.method === "Page.loadEventFired") {
      this.loadEventCount += 1;
      return;
    }
    if (payload.method === "Runtime.executionContextDestroyed") {
      this.executionContextDestructionCount += 1;
      return;
    }
    if (payload.method === "Runtime.consoleAPICalled") {
      const level = typeof params.type === "string" ? params.type : "log";
      const args = Array.isArray(params.args) ? params.args : [];
      const text = args
        .map((arg) => {
          const value = arg as { value?: unknown; description?: unknown };
          if (value.value !== undefined) {
            return typeof value.value === "string" ? value.value : JSON.stringify(value.value);
          }
          return typeof value.description === "string" ? value.description : typeof value.value;
        })
        .join(" ");
      this.recordConsoleEntry({ kind: "console", level, text, atMs: Date.now() });
      return;
    }
    if (payload.method === "Runtime.exceptionThrown") {
      const details = params.exceptionDetails as
        | { text?: unknown; exception?: { description?: unknown } }
        | undefined;
      const text =
        typeof details?.exception?.description === "string"
          ? details.exception.description
          : typeof details?.text === "string"
            ? details.text
            : "unconfirmed renderer exception";
      this.recordConsoleEntry({ kind: "exception", level: "error", text, atMs: Date.now() });
      return;
    }
    if (payload.method === "Log.entryAdded") {
      const entry = params.entry as { level?: unknown; text?: unknown } | undefined;
      if (typeof entry?.text !== "string") return;
      const level = typeof entry.level === "string" ? entry.level : "info";
      this.recordConsoleEntry({
        kind: "log",
        level,
        text: entry.text,
        atMs: Date.now(),
      });
    }
  }

  private recordConsoleEntry(entry: CdpConsoleEntry): void {
    this.consoleEntries.push(entry);
    while (this.consoleEntries.length > CONSOLE_ENTRY_CAPACITY) this.consoleEntries.shift();
  }

  /** Bounded console/exception/log buffer collected from the bound renderer target. */
  consoleLog(): readonly CdpConsoleEntry[] {
    return [...this.consoleEntries];
  }

  private async enableCapture(): Promise<void> {
    if (this.captureEnabled) return;
    this.captureEnabled = true;
    for (const method of ["Runtime.enable", "Log.enable", "Page.enable"]) {
      await this.send(method, {}, 10_000).catch(() => undefined);
    }
  }

  /** The renderer target this client is bound to; never re-resolved after connect. */
  get binding(): { readonly targetId: string; readonly appUrl: string } {
    return { targetId: this.targetId, appUrl: this.targetAppUrl };
  }

  private documentState(): Promise<CdpDocumentState> {
    return this.evaluate<CdpDocumentState>(
      `(() => ({` +
        ` timeOriginMs: typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : null,` +
        ` reloadToken: typeof window.__poracodeReloadToken === "string" ? window.__poracodeReloadToken : null,` +
        ` readyState: typeof document !== "undefined" ? document.readyState : null,` +
        ` rootChildren: (document.querySelector("#root")?.childElementCount ?? 0),` +
        ` hostBridge: typeof window.poracodeHost,` +
        ` diagnosticsHandle: typeof window.__poracodePerfDiagnostics }))()`,
      { timeoutMs: 10_000 },
    );
  }

  /** Re-checks the CDP target list still holds the bound page target. */
  private async assertTargetBinding(): Promise<void> {
    try {
      const targets = await listCdpTargets(this.cdpPort);
      const bound = targets.find((candidate) => candidate.id === this.targetId);
      if (bound && targetMatchesAppUrl(bound, this.targetAppUrl)) return;
      throw new Error(
        `CDP target binding changed: ${this.targetId} is no longer the ${this.targetAppUrl} page`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("CDP target binding changed")) {
        throw error;
      }
      // A transient target-list failure must not fail an otherwise healthy reload;
      // the next evaluate call still proves the same WebSocket session works.
    }
  }

  async evaluate<T>(expression: string, options?: { readonly timeoutMs?: number }): Promise<T> {
    const result = (await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      options?.timeoutMs ?? 30_000,
    )) as {
      exceptionDetails?: { exception?: { description?: string }; text?: string };
      result?: { value?: unknown };
    };
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "unknown exception";
      throw new Error(`renderer evaluate failed: ${detail}`);
    }
    return result.result?.value as T;
  }

  async waitForRendererReady(timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const state = await this.evaluate<{
        rootChildren: number;
        hostBridge: string;
      }>(
        "(() => ({ rootChildren: (document.querySelector('#root')?.childElementCount ?? 0)," +
          " hostBridge: typeof window.poracodeHost }))()",
      ).catch(() => ({ rootChildren: 0, hostBridge: "undefined" }));
      if (state.rootChildren > 0 && state.hostBridge === "object") return;
      if (Date.now() >= deadline) {
        throw new Error(`managed renderer did not become ready: ${JSON.stringify(state)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  hasDevBridge(): Promise<boolean> {
    return this.evaluate<boolean>("typeof window.__poracodeDev === 'object'");
  }

  async invokeProcedure(procedure: string, payload?: unknown): Promise<unknown> {
    const args = payload === undefined ? [] : [payload];
    return this.evaluate(
      `window.poracodeHost.invokeProcedure(${JSON.stringify(procedure)}, ${JSON.stringify(args)})`,
    );
  }

  /**
   * Enables renderer diagnostics and reloads, then waits for the *new* document
   * and its `window.__poracodePerfDiagnostics` handle before reading a snapshot.
   *
   * `Page.reload` resolves before the old execution context goes away, so a
   * ready-check issued right after it can still read the pre-reload document
   * (which has no diagnostics handle). This method therefore marks the old
   * document, requires a different `performance.timeOrigin` and the absence of
   * that marker, then polls the handle with a bounded deadline. On failure it
   * writes console/exception records and a screenshot to `evidenceDir`.
   */
  async enablePerfDiagnosticsAndReload(options?: {
    readonly timeoutMs?: number;
    readonly evidenceDir?: string;
    readonly label?: string;
  }): Promise<Record<string, unknown>> {
    await this.enableCapture();
    const flagState = await this.evaluate<string>(
      `(() => { window.localStorage.setItem("poracode-perf-diag", "1");` +
        ` return window.localStorage.getItem("poracode-perf-diag") ?? "missing"; })()`,
    );
    if (flagState !== "1") {
      throw new Error(`renderer refused the diagnostics localStorage flag: ${flagState}`);
    }
    const timeoutMs = options?.timeoutMs ?? 90_000;
    const before = await this.documentState().catch(() => null);
    try {
      await this.reload({ timeoutMs });
      await this.assertTargetBinding();
      return await this.waitForPerfDiagnostics(timeoutMs);
    } catch (error) {
      await this.captureDiagnosticEvidence(
        options?.evidenceDir,
        options?.label ?? "diagnostics-activation",
        { before, flagState, timeline: "enablePerfDiagnosticsAndReload" },
      );
      throw error;
    }
  }

  /**
   * Reloads the page and returns only once the *replacement* document is live
   * (new `performance.timeOrigin`, the pre-reload marker gone, a mounted root,
   * and the preload bridge present). No fixed sleep is used; the wait is
   * polled with a bounded deadline. The WebSocket stays bound to the same
   * target/session across the navigation.
   */
  async reload(options?: { readonly timeoutMs?: number }): Promise<void> {
    await this.enableCapture();
    const token = `v2q-doc-${randomUUID()}`;
    const before = await this.documentState().catch(() => null);
    await this.evaluate<string>(
      `(window.__poracodeReloadToken = ${JSON.stringify(token)}, "ok")`,
    ).catch(() => "ok");
    await this.send("Page.reload", { ignoreCache: false });
    const deadline = Date.now() + (options?.timeoutMs ?? 90_000);
    let last: CdpDocumentState | null = null;
    for (;;) {
      const state = await this.documentState().catch(() => null);
      if (state) last = state;
      const documentReplaced =
        state !== null &&
        state.reloadToken === null &&
        state.readyState !== null &&
        (before === null ||
          before.timeOriginMs === null ||
          state.timeOriginMs === null ||
          state.timeOriginMs !== before.timeOriginMs);
      if (documentReplaced && state.rootChildren > 0 && state.hostBridge === "object") return;
      if (Date.now() >= deadline) {
        throw new Error(
          `renderer document did not replace after reload: ` +
            `${JSON.stringify({ before, after: last })}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /** Waits (bounded) for the diagnostics handle and returns one readable snapshot. */
  async waitForPerfDiagnostics(timeoutMs = 60_000): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs;
    let last = "handle-missing";
    for (;;) {
      const state = await this.evaluate<{ kind: string }>(
        `(() => { const handle = window.__poracodePerfDiagnostics;` +
          ` return { kind: !handle ? "handle-missing" : typeof handle.snapshot === "function" ? "ready" : "handle-invalid" }; })()`,
        { timeoutMs: 10_000 },
      ).catch(() => ({ kind: "context-unavailable" }));
      last = state.kind;
      if (state.kind === "ready") {
        const snapshot = await this.snapshot().catch(() => null);
        if (snapshot && typeof snapshot.formatVersion === "number") return snapshot;
        last = "snapshot-unavailable";
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `renderer diagnostics did not activate after reload within ${String(timeoutMs)}ms (${last})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  private async captureScreenshot(): Promise<string | null> {
    try {
      const result = (await this.send("Page.captureScreenshot", { format: "png" }, 15_000)) as {
        result?: { value?: { data?: unknown } };
      };
      const data = result?.result?.value?.data;
      return typeof data === "string" ? data : null;
    } catch {
      return null;
    }
  }

  /** Writes bounded console/exception evidence plus a screenshot when a path is given. */
  async captureDiagnosticEvidence(
    evidenceDir: string | undefined,
    label: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    if (!evidenceDir) return;
    const page = await this.evaluate<{
      readonly href: string;
      readonly text: string;
      readonly hydrated: boolean | null;
    }>(
      `(() => ({` +
        ` href: location.href,` +
        ` text: (document.body?.innerText ?? "").slice(0, 2000),` +
        ` hydrated: window.__poracodeDev?.stores?.app?.persist?.hasHydrated?.() ?? null }))()`,
      { timeoutMs: 10_000 },
    ).catch(() => null);
    try {
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(
        join(evidenceDir, `${label}.console.json`),
        `${JSON.stringify(
          {
            targetId: this.targetId,
            appUrl: this.targetAppUrl,
            loadEvents: this.loadEventCount,
            executionContextDestructions: this.executionContextDestructionCount,
            entries: this.consoleLog(),
            extra: extra ?? null,
            page,
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );
    } catch {
      // Evidence capture must never mask the failure it documents.
    }
    const screenshot = await this.captureScreenshot();
    if (screenshot === null) return;
    try {
      writeFileSync(join(evidenceDir, `${label}.png`), Buffer.from(screenshot, "base64"), {
        mode: 0o600,
      });
    } catch {
      // See above.
    }
  }

  async setPhase(name: string): Promise<void> {
    await this.evaluate(
      `(window.__poracodePerfDiagnostics.setPhase(${JSON.stringify(name)}), "ok")`,
    );
  }

  snapshot(): Promise<Record<string, unknown> | null> {
    return this.evaluate<Record<string, unknown> | null>(
      "window.__poracodePerfDiagnostics ? window.__poracodePerfDiagnostics.snapshot() : null",
    );
  }

  /** Viewport center of the first element matching `selector`; null when absent
   * or zero-sized. Public so a protocol can resolve its target once and then
   * dispatch input while the renderer main thread is deliberately blocked. */
  async resolveElementCenter(selector: string): Promise<{ x: number; y: number } | null> {
    return this.evaluate<{ x: number; y: number } | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});` +
        ` if (!el) return null; el.scrollIntoView({ block: "center", inline: "center" });` +
        ` const r = el.getBoundingClientRect();` +
        ` if (r.width <= 0 || r.height <= 0) return null;` +
        ` return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
  }

  async trustedClick(selector: string): Promise<void> {
    const center = await this.resolveElementCenter(selector);
    if (!center) throw new Error(`trusted click target is missing or not visible: ${selector}`);
    await this.dispatchTrustedClickAt(center);
  }

  /**
   * Enqueues one trusted click (moved/pressed/released) at a pre-resolved
   * point and resolves when the browser acknowledges all three dispatch
   * commands. All three commands are written to the CDP socket before the first
   * response is awaited, so a click enqueued while the renderer main thread is
   * blocked is delivered *into* the browser pipeline immediately instead of
   * waiting for the blocking click's own acknowledgement.
   */
  dispatchTrustedClickAt(center: { readonly x: number; readonly y: number }): Promise<void> {
    const base = { x: center.x, y: center.y, button: "left", clickCount: 1 };
    return Promise.all([
      this.send("Input.dispatchMouseEvent", { ...base, type: "mouseMoved" }),
      this.send("Input.dispatchMouseEvent", { ...base, type: "mousePressed", buttons: 1 }),
      this.send("Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 }),
    ]).then(() => undefined);
  }

  /**
   * Measurement-policy surface preparation: the launcher may keep the window
   * unmapped/backgrounded, and a backgrounded renderer pauses rAF and delays
   * input and observer delivery. This activates the target and enables CDP's
   * focus emulation so document.hasFocus()/visibility behave like a foreground
   * app without requiring the user's OS focus. Raw per-command results are
   * returned as evidence; failures are recorded, never fabricated.
   */
  async prepareForegroundSurface(): Promise<{
    readonly bringToFront: "ok" | string;
    readonly focusEmulation: "ok" | string;
    readonly lifecycleActive: "ok" | string;
  }> {
    const attempt = async (method: string, params: Record<string, unknown>): Promise<string> => {
      try {
        await this.send(method, params, 10_000);
        return "ok";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    const bringToFront = await attempt("Page.bringToFront", {});
    const focusEmulation = await attempt("Emulation.setFocusEmulationEnabled", { enabled: true });
    const lifecycleActive = await attempt("Page.setWebLifecycleState", { state: "active" });
    return { bringToFront, focusEmulation, lifecycleActive };
  }

  /**
   * Reads the retained text of an editable element: `value` for input/textarea,
   * `textContent` for a contenteditable host. Returns null when the selector
   * matches nothing editable.
   */
  readEditableText(selector: string): Promise<string | null> {
    return this.evaluate<string | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});` +
        ` if (!el) return null;` +
        ` if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;` +
        ` if (el instanceof HTMLElement && el.isContentEditable) return el.textContent ?? "";` +
        ` return null; })()`,
    );
  }

  /**
   * Trusted keyboard typing through CDP `Input.dispatchKeyEvent`.
   *
   * Each declared character is dispatched as one physical press: a `keyDown`
   * carrying `key`/`code`/`text`/`unmodifiedText` and the US-layout legacy
   * virtual key codes (see {@link usPhysicalKey}), followed by `keyUp`. An
   * explicit `char` event must NOT be added: `keyDown` already inserts the
   * text, so a second text-carrying event inserts it twice.
   *
   * The physical fields matter beyond text insertion: `code`, `keyCode` and
   * modifiers are what keyCode-sensitive consumers read. xterm's
   * `evaluateKeyboardEvent` dispatches on the legacy key code, so a lowercase
   * `p` must arrive as VK 80 (`KeyP`) — sending its code point (112 = VK_F1)
   * produced F-key escape sequences instead of text.
   *
   * After the last key the method reads the editable text back and asserts the
   * declared workload was inserted exactly once at a single caret position
   * (`editableTextInsertedExactlyOnce`) — typed content must equal the declared
   * workload, not a doubled or partial copy. Callers typing into a surface that
   * does not retain inserted text (xterm's helper textarea is an input
   * transport whose observable output is the PTY, not its `value`) pass
   * `assertInsertion: false`; the returned evidence records that choice.
   */
  async trustedType(
    selector: string,
    text: string,
    options?: { readonly assertInsertion?: boolean },
  ): Promise<TrustedTypingEvidence> {
    const assertInsertion = options?.assertInsertion ?? true;
    const focus = await this.evaluate<string>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});` +
        ` if (!el) return "missing";` +
        ` if (!(el instanceof HTMLElement)) return "not-html";` +
        ` if (!el.isContentEditable && !(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return "not-editable";` +
        ` el.scrollIntoView({ block: "center" }); el.focus();` +
        ` return document.activeElement === el ? "focused" : "not-focusable"; })()`,
    );
    if (focus !== "focused") throw new Error(`cannot type into ${selector}: ${focus}`);
    const beforeText = await this.readEditableText(selector);
    if (assertInsertion && beforeText === null) {
      throw new Error(
        `cannot verify the trusted typing workload in ${selector}: no readable editable text`,
      );
    }
    for (const character of text) {
      const physical = usPhysicalKey(character);
      if (!physical) {
        throw new Error(
          `trusted typing has no US physical key for ${JSON.stringify(character)}; ` +
            "declare a workload of printable US-layout characters",
        );
      }
      await this.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: physical.modifiers,
        key: physical.key,
        code: physical.code,
        text: physical.text,
        unmodifiedText: physical.unmodifiedText,
        windowsVirtualKeyCode: physical.windowsVirtualKeyCode,
        nativeVirtualKeyCode: physical.nativeVirtualKeyCode,
      });
      await this.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: physical.modifiers,
        key: physical.key,
        code: physical.code,
        windowsVirtualKeyCode: physical.windowsVirtualKeyCode,
        nativeVirtualKeyCode: physical.nativeVirtualKeyCode,
      });
    }
    const afterText = beforeText === null ? null : await this.readEditableText(selector);
    const insertedChars =
      beforeText === null || afterText === null ? null : afterText.length - beforeText.length;
    const insertedExactlyOnce =
      beforeText !== null &&
      afterText !== null &&
      editableTextInsertedExactlyOnce(beforeText, afterText, text);
    if (assertInsertion && !insertedExactlyOnce) {
      throw new Error(
        `trusted typing did not insert the declared workload exactly once in ${selector}: ` +
          `declared=${JSON.stringify(text)} before=${JSON.stringify(beforeText)} ` +
          `after=${JSON.stringify(afterText)}`,
      );
    }
    return {
      selector,
      declaredText: text,
      declaredChars: text.length,
      beforeText,
      afterText,
      insertedChars,
      insertedExactlyOnce,
      insertionAssertion: assertInsertion ? "verified" : "not-asserted",
    };
  }

  close(): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("CDP client closed"));
    }
    this.pending.clear();
    try {
      this.ws.close();
    } catch {
      this.ws.terminate();
    }
  }
}
