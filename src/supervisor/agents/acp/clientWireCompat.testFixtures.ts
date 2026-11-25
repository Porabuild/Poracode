/**
 * Driver for the ACP client wire-compatibility baseline.
 *
 * Runs one scripted agent scenario (`fixtures/wire-compat-agent.mjs`) through a
 * caller-supplied client subject and records what crossed the wire, which
 * handlers ran with which raw params, and how every call settled. The test file
 * applies this to the installed SDK today so a later SDK upgrade can be compared
 * against the same recording.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { RequestError, type Stream } from "@agentclientprotocol/sdk/unstable";
import { createAcpInboundStream } from "./sessionInboundStream";

/** The client-side handler surface Poracode implements (the shape the SDK 1.x `Client` interface had). */
export interface WireCompatHandlers {
  requestPermission(params: unknown): unknown;
  sessionUpdate(params: unknown): unknown;
  readTextFile?(params: unknown): unknown;
  writeTextFile?(params: unknown): unknown;
  createTerminal?(params: unknown): unknown;
  terminalOutput?(params: unknown): unknown;
  releaseTerminal?(params: unknown): unknown;
  waitForTerminalExit?(params: unknown): unknown;
  killTerminal?(params: unknown): unknown;
  createElicitation?(params: unknown): unknown;
  completeElicitation?(params: unknown): unknown;
  extMethod?(method: string, params: unknown): unknown;
  extNotification?(method: string, params: unknown): unknown;
}

/** The agent-facing calls the driver makes. */
export interface WireCompatPeer {
  initialize(params: unknown): Promise<unknown>;
  authenticate?(params: unknown): Promise<unknown>;
  newSession(params: unknown): Promise<unknown>;
  loadSession(params: unknown): Promise<unknown>;
  resumeSession(params: unknown): Promise<unknown>;
  prompt(params: unknown): Promise<unknown>;
  setSessionConfigOption(params: unknown): Promise<unknown>;
  setSessionMode(params: unknown): Promise<unknown>;
  cancel(params: unknown): Promise<void>;
  extMethod(method: string, params?: unknown): Promise<unknown>;
  closeSession(params: unknown): Promise<unknown>;
  deleteSession(params: unknown): Promise<unknown>;
  closed?: Promise<void>;
}

/** Builds the client side of a connection over Poracode's production inbound stream. */
export type WireCompatSubject = (stream: Stream, handlers: WireCompatHandlers) => WireCompatPeer;

export interface WireCompatScenario {
  name: string;
  init: "full" | "minimal" | "odd";
  close: "close_32002" | "close_ok";
  exitWhilePending?: boolean;
  stray?: boolean;
  /** Which client handlers the subject implements. */
  handlers: "all" | "core";
  /** Whether the client implements extMethod / extNotification. */
  extensions: boolean;
}

export interface WireCompatError {
  name: string;
  message: string;
  code?: number;
  data?: unknown;
}

export interface WireCompatTranscript {
  /** Our outbound requests and notifications in call order. */
  calls: Array<{ method: string; params: unknown }>;
  /** Method names of our requests and notifications in the order the agent received them. */
  wireOrder: string[];
  /** What the agent received in answer to each of its own requests, keyed by request id. */
  agentSaw: Record<string, unknown>;
  /** Handler invocations, in start order, with the raw params each one received. */
  handlerCalls: Array<{ handler: string; method: string; params: unknown }>;
  /** Handlers in the order their returned promise settled (only for handlers that settle asynchronously). */
  handlerSettled: string[];
  /** How each outbound call settled, in settlement order. */
  outcomes: Array<{
    method: string;
    status: "resolved" | "rejected";
    value?: unknown;
    error?: WireCompatError;
  }>;
  /** How the connection ended. */
  closed: { status: "resolved" | "rejected" | "timeout"; error?: WireCompatError };
}

export const WIRE_COMPAT_AGENT = fileURLToPath(
  new URL("./fixtures/wire-compat-agent.mjs", import.meta.url),
);

export const WIRE_COMPAT_SCENARIOS: readonly WireCompatScenario[] = [
  {
    name: "full-all-extensions",
    init: "full",
    close: "close_32002",
    handlers: "all",
    extensions: true,
  },
  {
    name: "minimal-core-no-extensions",
    init: "minimal",
    close: "close_ok",
    handlers: "core",
    extensions: false,
  },
  {
    name: "minimal-core-extensions",
    init: "minimal",
    close: "close_ok",
    handlers: "core",
    extensions: true,
  },
  {
    name: "odd-exit-while-pending",
    init: "odd",
    close: "close_ok",
    handlers: "all",
    extensions: true,
    exitWhilePending: true,
  },
  {
    name: "full-stray-response",
    init: "full",
    close: "close_ok",
    handlers: "all",
    extensions: true,
    stray: true,
  },
];

function normalizeError(err: unknown): WireCompatError {
  const candidate = err as { name?: unknown; message?: unknown; code?: unknown; data?: unknown };
  return {
    name: typeof candidate?.name === "string" ? candidate.name : typeof err,
    message: String(candidate?.message ?? err),
    ...(typeof candidate?.code === "number" ? { code: candidate.code } : {}),
    ...(candidate?.data !== undefined ? { data: candidate.data } : {}),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWireCompatScenario(
  subject: WireCompatSubject,
  scenario: WireCompatScenario,
): Promise<WireCompatTranscript> {
  const dir = await mkdtemp(join(tmpdir(), "poracode-wire-compat-"));
  const logPath = join(dir, "wire.log");
  const donePath = join(dir, "done");
  const calls: WireCompatTranscript["calls"] = [];
  const handlerCalls: WireCompatTranscript["handlerCalls"] = [];
  const handlerSettled: string[] = [];
  const outcomes: WireCompatTranscript["outcomes"] = [];

  const child = spawn(process.execPath, [WIRE_COMPAT_AGENT], {
    stdio: ["pipe", "pipe", "ignore"],
    env: {
      ...process.env,
      PORACODE_WIRE_LOG: logPath,
      PORACODE_WIRE_DONE: donePath,
      PORACODE_WIRE_INIT: scenario.init,
      PORACODE_WIRE_CLOSE: scenario.close,
      PORACODE_WIRE_EXIT: scenario.exitWhilePending ? "exit_while_pending" : "",
      PORACODE_WIRE_STRAY: scenario.stray ? "1" : "",
    },
  });

  const record = (handler: string, method: string, params: unknown) => {
    handlerCalls.push({ handler, method, params: structuredClone(params) });
  };

  const handlers: WireCompatHandlers = {
    requestPermission(params) {
      record("requestPermission", "session/request_permission", params);
      return { outcome: { outcome: "selected", optionId: "allow" } };
    },
    sessionUpdate(params) {
      record("sessionUpdate", "session/update", params);
      const update = (params as { update?: { sessionUpdate?: unknown } } | undefined)?.update;
      if (update?.sessionUpdate === "usage_update") handlerSettled.push("session/update");
      return undefined;
    },
  };

  if (scenario.handlers === "all") {
    handlers.readTextFile = async (params) => {
      record("readTextFile", "fs/read_text_file", params);
      await sleep(150);
      handlerSettled.push("fs/read_text_file");
      return { content: "l3\nl4" };
    };
    handlers.writeTextFile = (params) => {
      record("writeTextFile", "fs/write_text_file", params);
      return { bytesWritten: 3 };
    };
    handlers.createTerminal = (params) => {
      record("createTerminal", "terminal/create", params);
      return { id: "t1" };
    };
    handlers.terminalOutput = (params) => {
      record("terminalOutput", "terminal/output", params);
      return { output: "out", truncated: false };
    };
    handlers.releaseTerminal = (params) => {
      record("releaseTerminal", "terminal/release", params);
      return undefined;
    };
    handlers.waitForTerminalExit = (params) => {
      record("waitForTerminalExit", "terminal/wait_for_exit", params);
      return { exitStatus: { exitCode: 0, signal: null } };
    };
    handlers.killTerminal = (params) => {
      record("killTerminal", "terminal/kill", params);
      return undefined;
    };
    handlers.createElicitation = (params) => {
      record("createElicitation", "elicitation/create", params);
      return { action: "accept", content: { ok: true } };
    };
    handlers.completeElicitation = (params) => {
      record("completeElicitation", "elicitation/complete", params);
      return undefined;
    };
  }

  if (scenario.extensions) {
    handlers.extMethod = (method, params) => {
      record("extMethod", method, params);
      if (method === "vendor/throw_plain") throw new Error("boom");
      if (method === "vendor/throw_request_error") {
        throw new RequestError(-32000, "custom failure", { detail: 1 });
      }
      if (method === "vendor/return_undefined") return undefined;
      return { echo: params };
    };
    handlers.extNotification = (method, params) => {
      record("extNotification", method, params);
      return undefined;
    };
  }

  const toAgent = Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>;
  const fromAgent = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
  const stream = createAcpInboundStream(toAgent, fromAgent);

  const settle = async <T>(method: string, fn: () => Promise<T> | T): Promise<T | undefined> => {
    try {
      const value = await fn();
      outcomes.push({ method, status: "resolved", value });
      return value;
    } catch (err) {
      outcomes.push({ method, status: "rejected", error: normalizeError(err) });
      return undefined;
    }
  };

  try {
    const peer = subject(stream, handlers);

    const initializeParams = {
      protocolVersion: 1,
      clientInfo: { name: "poracode", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        elicitation: { form: {}, url: {} },
        terminal: true,
      },
    };
    calls.push({ method: "initialize", params: initializeParams });
    await settle("initialize", () => peer.initialize(initializeParams));

    if (peer.authenticate) {
      const authenticateParams = { methodId: "oauth-personal" };
      calls.push({ method: "authenticate", params: authenticateParams });
      await settle("authenticate", () => peer.authenticate!(authenticateParams));
    }

    const newSessionParams = { cwd: "/w", mcpServers: [] };
    calls.push({ method: "newSession", params: newSessionParams });
    await settle("newSession", () => peer.newSession(newSessionParams));

    const loadSessionParams = { sessionId: "s-1", cwd: "/w" };
    calls.push({ method: "loadSession", params: loadSessionParams });
    await settle("loadSession", () => peer.loadSession(loadSessionParams));

    const resumeSessionParams = { sessionId: "s-1", cwd: "/w" };
    calls.push({ method: "resumeSession", params: resumeSessionParams });
    await settle("resumeSession", () => peer.resumeSession(resumeSessionParams));

    const promptParams = { sessionId: "s-1", prompt: [{ type: "text", text: "hello" }] };
    calls.push({ method: "prompt", params: promptParams });
    await settle("prompt", () => peer.prompt(promptParams));

    if (!scenario.exitWhilePending) {
      const setConfigParams = { sessionId: "s-1", configId: "flag", value: true };
      calls.push({ method: "setSessionConfigOption", params: setConfigParams });
      await settle("setSessionConfigOption", () => peer.setSessionConfigOption(setConfigParams));

      const setModeParams = { sessionId: "s-1", modeId: "default" };
      calls.push({ method: "setSessionMode", params: setModeParams });
      await settle("setSessionMode", () => peer.setSessionMode(setModeParams));

      const cancelParams = { sessionId: "s-1" };
      calls.push({ method: "cancel", params: cancelParams });
      await settle("cancel", () => peer.cancel(cancelParams));

      const extParams = { a: 1 };
      calls.push({ method: "extMethod vendor/echo", params: extParams });
      await settle("extMethod vendor/echo", () => peer.extMethod("vendor/echo", extParams));

      const closeParams = { sessionId: "s-1" };
      calls.push({ method: "closeSession", params: closeParams });
      await settle("closeSession", () => peer.closeSession(closeParams));

      const deleteParams = { sessionId: "s-1" };
      calls.push({ method: "deleteSession", params: deleteParams });
      await settle("deleteSession", () => peer.deleteSession(deleteParams));
    }

    if (!scenario.exitWhilePending) {
      const deadline = Date.now() + 8_000;
      for (;;) {
        try {
          await readFile(donePath);
          break;
        } catch {
          if (Date.now() >= deadline) break;
          await sleep(25);
        }
      }
    }

    let closed: WireCompatTranscript["closed"] = { status: "timeout" };
    if (peer.closed) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), 2_000);
      });
      const raced = await Promise.race([
        peer.closed.then(
          () => ({ status: "resolved" as const }),
          (err: unknown) => ({ status: "rejected" as const, error: normalizeError(err) }),
        ),
        timeout,
      ]);
      if (timer) clearTimeout(timer);
      closed = raced === "timeout" ? { status: "timeout" } : raced;
    }

    let wireOrder: string[] = [];
    const agentSaw: Record<string, unknown> = {};
    try {
      const raw = await readFile(logPath, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        let frame: { method?: unknown; id?: unknown };
        try {
          frame = JSON.parse(line) as { method?: unknown; id?: unknown };
        } catch {
          continue;
        }
        if (typeof frame.method === "string") wireOrder.push(frame.method);
        else if (frame.id !== undefined) agentSaw[String(frame.id)] = frame;
      }
    } catch {
      wireOrder = [];
    }

    return { calls, wireOrder, agentSaw, handlerCalls, handlerSettled, outcomes, closed };
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }
}
