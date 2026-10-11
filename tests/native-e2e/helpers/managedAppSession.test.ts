import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import {
  ManagedCdpClient,
  editableTextInsertedExactlyOnce,
  extractJsonObject,
  launchManagedAppSession,
  managedLauncherPath,
  readManagedSession,
  stopManagedAppSession,
  targetMatchesAppUrl,
  usPhysicalKey,
  type CdpTarget,
} from "./managedAppSession.ts";

/**
 * Managed-session and CDP lifecycle mapping tests.
 *
 * The qualification cell maps the smoke launcher's session manifest into a
 * typed handle and drives the renderer over CDP. These tests pin the manifest
 * mapping, the launcher stdout contract, the target URL match (session query
 * stripped) and the CDP request/response lifecycle without launching Electron.
 */

const roots: string[] = [];
const servers: Array<{ server: Server; wss: WebSocketServer }> = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "v2q-session-"));
  roots.push(root);
  return root;
}

function writeLauncherScript(armRoot: string, source: string): void {
  const path = managedLauncherPath(armRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

const LAUNCH_SCRIPT = `
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[process.argv.indexOf("--root") + 1];
const mode = process.argv[process.argv.indexOf("--mode") + 1] ?? "mock";
mkdirSync(root, { recursive: true });
const sessionFile = join(root, "session.json");
writeFileSync(sessionFile, JSON.stringify({
  root,
  appUrl: "http://127.0.0.1:1/?poracodeDebugSession=token",
  cdpPort: 9222,
  devServerPort: 3100,
  baseDir: join(root, "base"),
  projectDir: join(root, "project"),
  outDir: join(root, "out"),
  ownerPid: process.pid,
  appPid: 4321,
  mode,
  envProbe: process.env.V2Q_ENV_PROBE ?? "unset",
  runtime: { entrypoint: "electron" },
  token: "launcher-secret",
  args: process.argv.slice(2),
}));
console.log("launcher noise before the manifest");
console.log(JSON.stringify({ sessionFile, ignored: true }));
`;

const STOP_SCRIPT = `
const session = process.argv[process.argv.indexOf("--session") + 1] ?? "";
console.log(session.endsWith("fail.json") ? "stop:failed" : "stop:ok");
`;

interface FakeCdpRequest {
  readonly method: string;
  readonly params?: { readonly expression?: string; readonly [key: string]: unknown };
}

/** A scripted response; unhandled requests fall through to the generic reply. */
interface FakeCdpScriptResult {
  readonly handled: boolean;
  readonly value?: unknown;
}

async function startFakeCdp(
  appUrl: string,
  options?: {
    readonly script?: (request: FakeCdpRequest) => FakeCdpScriptResult;
    readonly duplicateAppTarget?: boolean;
  },
): Promise<{ port: number; wss: WebSocketServer }> {
  let port = 0;
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/json/list")) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify([
          {
            id: "other",
            type: "page",
            url: "http://127.0.0.1:1/other",
            webSocketDebuggerUrl: "ws://x",
          },
          ...(options?.duplicateAppTarget
            ? [
                {
                  id: "quick-composer",
                  type: "page",
                  url: `${appUrl}?poracodeDebugSession=token`,
                  webSocketDebuggerUrl: `ws://127.0.0.1:${String(port)}/devtools/page/quick-composer`,
                },
              ]
            : []),
          {
            id: "renderer",
            type: "page",
            url: `${appUrl}?poracodeDebugSession=token`,
            webSocketDebuggerUrl: `ws://127.0.0.1:${String(port)}/devtools/page/renderer`,
          },
        ]),
      );
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket) => {
    socket.on("message", (data: Buffer) => {
      const request = JSON.parse(String(data)) as FakeCdpRequest & { id: number };
      if (request.method === "Unknown.method") return;
      const scripted = options?.script?.(request);
      if (scripted?.handled) {
        socket.send(
          JSON.stringify({ id: request.id, result: { result: { value: scripted.value } } }),
        );
        return;
      }
      const expression = request.params?.expression ?? "";
      if (expression.includes("renderer-exception")) {
        socket.send(
          JSON.stringify({
            id: request.id,
            result: { exceptionDetails: { text: "script blew up" } },
          }),
        );
        return;
      }
      if (expression.includes("rootChildren")) {
        socket.send(
          JSON.stringify({
            id: request.id,
            result: { result: { value: { rootChildren: 1, hostBridge: "object" } } },
          }),
        );
        return;
      }
      if (expression.includes("__poracodeDev")) {
        socket.send(JSON.stringify({ id: request.id, result: { result: { value: true } } }));
        return;
      }
      socket.send(JSON.stringify({ id: request.id, result: { result: { value: 42 } } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  servers.push({ server, wss });
  return { port, wss };
}

afterEach(async () => {
  for (const { server, wss } of servers.splice(0)) {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve, reject) => {
      wss.close((error) => (error ? reject(error) : resolve()));
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("readManagedSession", () => {
  const raw = {
    root: "/tmp/session",
    appUrl: "http://127.0.0.1:9/?poracodeDebugSession=x",
    cdpPort: 9222,
    devServerPort: 3100,
    baseDir: "/tmp/session/base",
    projectDir: "/tmp/session/project",
    outDir: "/tmp/session/out",
    ownerPid: 11,
    appPid: 12,
    mode: "mock",
    runtime: { entrypoint: "electron" },
  };

  function writeSession(payload: Record<string, unknown>): string {
    const root = makeTempRoot();
    const path = join(root, "session.json");
    writeFileSync(path, JSON.stringify(payload));
    return path;
  }

  it("maps the launcher manifest into the typed session handle", () => {
    const sessionFile = writeSession(raw);
    const session = readManagedSession(sessionFile);
    expect(session).toMatchObject({
      sessionFile,
      root: "/tmp/session",
      appUrl: raw.appUrl,
      cdpPort: 9222,
      devServerPort: 3100,
      baseDir: "/tmp/session/base",
      projectDir: "/tmp/session/project",
      outDir: "/tmp/session/out",
      ownerPid: 11,
      appPid: 12,
      mode: "mock",
      runtime: { entrypoint: "electron" },
    });
  });

  it("keeps appPid null and runtime null when the launcher did not observe them", () => {
    const { appPid: _appPid, runtime: _runtime, ...withoutOptional } = raw;
    const session = readManagedSession(writeSession(withoutOptional));
    expect(session.appPid).toBeNull();
    expect(session.runtime).toBeNull();
    expect(session.mode).toBe("mock");
  });

  it("rejects an invalid mode and a manifest missing a required path", () => {
    expect(() => readManagedSession(writeSession({ ...raw, mode: "half" }))).toThrow(
      "has an invalid mode",
    );
    expect(() => readManagedSession(writeSession({ ...raw, root: "" }))).toThrow("is missing root");
  });
});

describe("launcher lifecycle mapping", () => {
  it("extracts the JSON manifest from stdout noise and positions the launcher path", () => {
    expect(extractJsonObject('noise\n{"sessionFile":"/tmp/s.json"}\ntrailing')).toEqual({
      sessionFile: "/tmp/s.json",
    });
    expect(() => extractJsonObject("no json here")).toThrow("produced no JSON manifest");
    expect(managedLauncherPath("/arms/a0")).toBe(
      "/arms/a0/.agents/skills/interactive-testing/scripts/poracode-cdp.mjs",
    );
  });

  it("launches through the arm's own launcher and returns the mapped session", async () => {
    const armRoot = makeTempRoot();
    writeLauncherScript(armRoot, LAUNCH_SCRIPT);
    const sessionRoot = join(makeTempRoot(), "session-root");
    const session = await launchManagedAppSession({
      armRoot,
      sessionRoot,
      env: { PORACODE_REMOTE_ACCESS_PORT: "49152" },
      launcherTimeoutSeconds: 30,
      timeoutMs: 10_000,
    });
    expect(session.root).toBe(sessionRoot);
    expect(session.mode).toBe("mock");
    expect(session.appPid).toBe(4321);
    expect(session.raw.token).toBe("launcher-secret");
    expect(session.raw.args).toContain("--timeout");
    expect((session.raw.args as string[]).at(-1)).toBe("30");
  });

  it("forwards an explicit real mode and can clear an inherited environment variable", async () => {
    const armRoot = makeTempRoot();
    writeLauncherScript(armRoot, LAUNCH_SCRIPT);
    const sessionRoot = join(makeTempRoot(), "session-root");
    process.env.V2Q_ENV_PROBE = "inherited";
    try {
      const session = await launchManagedAppSession({
        armRoot,
        sessionRoot,
        mode: "real",
        env: { V2Q_ENV_PROBE: undefined },
        timeoutMs: 10_000,
      });
      expect(session.mode).toBe("real");
      expect(session.raw.args).toContain("--mode");
      expect(
        (session.raw.args as string[])[(session.raw.args as string[]).indexOf("--mode") + 1],
      ).toBe("real");
      expect(session.raw.envProbe).toBe("unset");
    } finally {
      delete process.env.V2Q_ENV_PROBE;
    }
  });

  it("requires the verified stop acknowledgment and surfaces a launcher failure", async () => {
    const armRoot = makeTempRoot();
    writeLauncherScript(armRoot, STOP_SCRIPT);
    await expect(
      stopManagedAppSession({ armRoot, sessionFile: "/tmp/session.json", timeoutMs: 10_000 }),
    ).resolves.toBeUndefined();
    await expect(
      stopManagedAppSession({
        armRoot,
        sessionFile: "/tmp/fail.json",
        timeoutMs: 10_000,
      }),
    ).rejects.toThrow("managed session teardown did not verify");
  });
});

describe("ManagedCdpClient over a loopback CDP endpoint", () => {
  it("matches the renderer target by app URL ignoring the session query", () => {
    const target: CdpTarget = {
      id: "t",
      url: "http://127.0.0.1:3100/?poracodeDebugSession=abc",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/t",
    };
    expect(targetMatchesAppUrl(target, "http://127.0.0.1:3100/")).toBe(true);
    expect(targetMatchesAppUrl(target, "http://127.0.0.1:3101/")).toBe(false);
    expect(
      targetMatchesAppUrl(
        { ...target, url: "http://127.0.0.1:3100/other" },
        "http://127.0.0.1:3100/",
      ),
    ).toBe(false);
  });

  it("refuses ambiguous app URLs instead of driving the first same-URL window", async () => {
    const appUrl = "http://127.0.0.1:1/";
    const { port } = await startFakeCdp(appUrl, { duplicateAppTarget: true });
    await expect(
      ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 500 }),
    ).rejects.toThrow("ambiguous managed renderer");
  });

  it("binds the explicitly inspected target when windows share the app URL", async () => {
    const appUrl = "http://127.0.0.1:1/";
    const { port } = await startFakeCdp(appUrl, { duplicateAppTarget: true });
    const cdp = await ManagedCdpClient.connect({
      cdpPort: port,
      appUrl,
      targetId: "renderer",
      timeoutMs: 500,
    });
    try {
      expect(cdp.binding.targetId).toBe("renderer");
      expect(await cdp.evaluate("1 + 1")).toBe(42);
    } finally {
      cdp.close();
    }
  });

  it("connects, evaluates values, and reports renderer exceptions", async () => {
    const appUrl = "http://127.0.0.1:1/";
    const { port } = await startFakeCdp(appUrl);
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    try {
      expect(await cdp.evaluate<number>("1 + 1")).toBe(42);
      await expect(cdp.evaluate("renderer-exception")).rejects.toThrow("script blew up");
      expect(await cdp.hasDevBridge()).toBe(true);
      await expect(cdp.waitForRendererReady(2_000)).resolves.toBeUndefined();
    } finally {
      cdp.close();
    }
  });

  it("times out an unanswered command and rejects pending commands on close", async () => {
    const appUrl = "http://127.0.0.1:2/";
    const { port } = await startFakeCdp(appUrl);
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    await expect(cdp.send("Unknown.method", {}, 100)).rejects.toThrow(
      "CDP timeout after 100ms: Unknown.method",
    );
    const pending = cdp.send("Unknown.method", {}, 10_000);
    cdp.close();
    await expect(pending).rejects.toThrow("CDP client closed");
  });

  it("fails the connect when no renderer target ever matches", async () => {
    const { port } = await startFakeCdp("http://127.0.0.1:3/");
    await expect(
      ManagedCdpClient.connect({ cdpPort: port, appUrl: "http://127.0.0.1:4/", timeoutMs: 300 }),
    ).rejects.toThrow("no managed renderer CDP target matching");
  });

  it("waits for the replacement document and the diagnostics handle across a reload", async () => {
    const appUrl = "http://127.0.0.1:5/";
    let reloaded = false;
    const { port } = await startFakeCdp(appUrl, {
      script: (request) => {
        if (request.method === "Page.reload") {
          reloaded = true;
          return { handled: true };
        }
        const expression = request.params?.expression ?? "";
        if (expression.includes("__poracodeReloadToken = ")) return { handled: true, value: "ok" };
        if (expression.includes("timeOriginMs")) {
          return {
            handled: true,
            value: {
              timeOriginMs: reloaded ? 2_000 : 1_000,
              reloadToken: reloaded ? null : "stale-token",
              readyState: "complete",
              rootChildren: 1,
              hostBridge: "object",
              diagnosticsHandle: "undefined",
            },
          };
        }
        if (expression.includes("poracode-perf-diag")) return { handled: true, value: "1" };
        if (expression.includes("handle.snapshot"))
          return { handled: true, value: { kind: "ready" } };
        if (expression.includes("__poracodePerfDiagnostics.snapshot()")) {
          return { handled: true, value: { formatVersion: 2, phase: "session" } };
        }
        return { handled: false };
      },
    });
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    try {
      const snapshot = await cdp.enablePerfDiagnosticsAndReload({ timeoutMs: 3_000 });
      expect(snapshot).toMatchObject({ formatVersion: 2 });
      expect(reloaded).toBe(true);
    } finally {
      cdp.close();
    }
  });

  it("captures console and screenshot evidence when diagnostics never activate", async () => {
    const appUrl = "http://127.0.0.1:6/";
    const evidenceDir = join(makeTempRoot(), "evidence");
    let reloaded = false;
    const { port } = await startFakeCdp(appUrl, {
      script: (request) => {
        if (request.method === "Page.reload") {
          reloaded = true;
          return { handled: true };
        }
        if (request.method === "Page.captureScreenshot") {
          return { handled: true, value: { data: Buffer.from("png-bytes").toString("base64") } };
        }
        const expression = request.params?.expression ?? "";
        if (expression.includes("__poracodeReloadToken = ")) return { handled: true, value: "ok" };
        if (expression.includes("timeOriginMs")) {
          return {
            handled: true,
            value: {
              timeOriginMs: reloaded ? 2_000 : 1_000,
              reloadToken: reloaded ? null : "stale-token",
              readyState: "complete",
              rootChildren: 1,
              hostBridge: "object",
              diagnosticsHandle: "undefined",
            },
          };
        }
        if (expression.includes("poracode-perf-diag")) return { handled: true, value: "1" };
        if (expression.includes("__poracodePerfDiagnostics")) {
          return { handled: true, value: { kind: "handle-missing" } };
        }
        return { handled: false };
      },
    });
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    try {
      await expect(
        cdp.enablePerfDiagnosticsAndReload({ timeoutMs: 500, evidenceDir, label: "diag-fail" }),
      ).rejects.toThrow("renderer diagnostics did not activate after reload");
      expect(existsSync(join(evidenceDir, "diag-fail.console.json"))).toBe(true);
      expect(existsSync(join(evidenceDir, "diag-fail.png"))).toBe(true);
    } finally {
      cdp.close();
    }
  });
});

describe("trusted typing fidelity", () => {
  it("matches exactly-once insertion at any caret position", () => {
    expect(editableTextInsertedExactlyOnce("", "v2q", "v2q")).toBe(true);
    expect(editableTextInsertedExactlyOnce("ab", "aXb", "X")).toBe(true);
    expect(editableTextInsertedExactlyOnce("ab", "Xab", "X")).toBe(true);
    expect(editableTextInsertedExactlyOnce("ab", "abX", "X")).toBe(true);
    expect(editableTextInsertedExactlyOnce("ab", "ab", "")).toBe(true);
    // The doubled dispatch (keyDown-with-text plus a separate `char` event)
    // inserted every declared character twice and must never pass.
    expect(editableTextInsertedExactlyOnce("", "vv22qq", "v2q")).toBe(false);
    expect(editableTextInsertedExactlyOnce("ab", "aXbX", "X")).toBe(false);
    expect(editableTextInsertedExactlyOnce("ab", "ab", "X")).toBe(false);
    expect(editableTextInsertedExactlyOnce("ab", "abc", "")).toBe(false);
  });

  it("dispatches one text-carrying press per declared character with no char event", async () => {
    const appUrl = "http://127.0.0.1:7/";
    const dispatched: Array<Record<string, unknown>> = [];
    let editableReads = 0;
    const { port } = await startFakeCdp(appUrl, {
      script: (request) => {
        if (request.method === "Input.dispatchKeyEvent") {
          dispatched.push({ ...(request.params ?? {}) });
          return { handled: true };
        }
        const expression = request.params?.expression ?? "";
        if (expression.includes("el.focus()")) return { handled: true, value: "focused" };
        if (expression.includes("isContentEditable")) {
          editableReads += 1;
          return { handled: true, value: editableReads === 1 ? "" : "v2q" };
        }
        return { handled: false };
      },
    });
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    try {
      const evidence = await cdp.trustedType('[contenteditable="true"]', "v2q");
      expect(dispatched.map((event) => event.type)).toEqual([
        "keyDown",
        "keyUp",
        "keyDown",
        "keyUp",
        "keyDown",
        "keyUp",
      ]);
      const textCarrying = dispatched.filter(
        (event) => typeof event.text === "string" && event.text.length > 0,
      );
      expect(textCarrying.map((event) => event.text)).toEqual(["v", "2", "q"]);
      expect(dispatched.some((event) => event.type === "char")).toBe(false);
      // A physical press reports the key's own code/VK, not the character's
      // code point (lowercase v is VK 86 on KeyV, not 118 on VK_F7).
      expect(
        textCarrying.map((event) => ({
          code: event.code,
          vk: event.windowsVirtualKeyCode,
          nativeVk: event.nativeVirtualKeyCode,
          modifiers: event.modifiers ?? 0,
        })),
      ).toEqual([
        { code: "KeyV", vk: 86, nativeVk: 86, modifiers: 0 },
        { code: "Digit2", vk: 50, nativeVk: 50, modifiers: 0 },
        { code: "KeyQ", vk: 81, nativeVk: 81, modifiers: 0 },
      ]);
      expect(evidence).toMatchObject({
        declaredChars: 3,
        beforeText: "",
        afterText: "v2q",
        insertedChars: 3,
        insertedExactlyOnce: true,
        insertionAssertion: "verified",
      });
    } finally {
      cdp.close();
    }
  });

  it("maps printable US characters to their physical key, not their code point", () => {
    expect(usPhysicalKey("p")).toMatchObject({
      key: "p",
      code: "KeyP",
      text: "p",
      unmodifiedText: "p",
      windowsVirtualKeyCode: 80,
      nativeVirtualKeyCode: 80,
      modifiers: 0,
    });
    expect(usPhysicalKey("x")).toMatchObject({ code: "KeyX", windowsVirtualKeyCode: 88 });
    expect(usPhysicalKey("u")).toMatchObject({ code: "KeyU", windowsVirtualKeyCode: 85 });
    // xterm's legacy switch reads 112..123 as F1..F12 and 36/45 as Home/Insert;
    // these characters must never carry their code point as the VK.
    expect(usPhysicalKey("p")?.windowsVirtualKeyCode).not.toBe(112);
    expect(usPhysicalKey("$")).toMatchObject({
      key: "$",
      code: "Digit4",
      text: "$",
      unmodifiedText: "4",
      windowsVirtualKeyCode: 52,
      modifiers: 8,
    });
    expect(usPhysicalKey("-")).toMatchObject({ code: "Minus", windowsVirtualKeyCode: 189 });
    expect(usPhysicalKey(" ")).toMatchObject({
      key: " ",
      code: "Space",
      text: " ",
      windowsVirtualKeyCode: 32,
    });
    expect(usPhysicalKey("F")).toMatchObject({
      key: "F",
      code: "KeyF",
      text: "F",
      unmodifiedText: "f",
      windowsVirtualKeyCode: 70,
      modifiers: 8,
    });
    expect(usPhysicalKey("=")).toMatchObject({ code: "Equal", windowsVirtualKeyCode: 187 });
    expect(usPhysicalKey(";")).toMatchObject({ code: "Semicolon", windowsVirtualKeyCode: 186 });
    expect(usPhysicalKey(")")).toMatchObject({
      code: "Digit0",
      unmodifiedText: "0",
      windowsVirtualKeyCode: 48,
      modifiers: 8,
    });
    expect(usPhysicalKey("~")).toMatchObject({
      code: "Backquote",
      unmodifiedText: "`",
      windowsVirtualKeyCode: 192,
      modifiers: 8,
    });
    expect(usPhysicalKey("\n")).toBeNull();
    expect(usPhysicalKey("é")).toBeNull();
  });

  it("dispatches physical code and legacy key codes for every declared character", async () => {
    const appUrl = "http://127.0.0.1:9/";
    const dispatched: Array<Record<string, unknown>> = [];
    let editableReads = 0;
    const { port } = await startFakeCdp(appUrl, {
      script: (request) => {
        if (request.method === "Input.dispatchKeyEvent") {
          dispatched.push({ ...(request.params ?? {}) });
          return { handled: true };
        }
        const expression = request.params?.expression ?? "";
        if (expression.includes("el.focus()")) return { handled: true, value: "focused" };
        if (expression.includes("isContentEditable")) {
          editableReads += 1;
          return { handled: true, value: editableReads === 1 ? "" : "px$F-" };
        }
        return { handled: false };
      },
    });
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    try {
      const evidence = await cdp.trustedType('[contenteditable="true"]', "px$F-");
      const keyDowns = dispatched.filter((event) => event.type === "keyDown");
      expect(keyDowns).toHaveLength(5);
      expect(
        keyDowns.map((event) => ({
          key: event.key,
          code: event.code,
          text: event.text,
          unmodifiedText: event.unmodifiedText,
          vk: event.windowsVirtualKeyCode,
          nativeVk: event.nativeVirtualKeyCode,
          modifiers: event.modifiers ?? 0,
        })),
      ).toEqual([
        {
          key: "p",
          code: "KeyP",
          text: "p",
          unmodifiedText: "p",
          vk: 80,
          nativeVk: 80,
          modifiers: 0,
        },
        {
          key: "x",
          code: "KeyX",
          text: "x",
          unmodifiedText: "x",
          vk: 88,
          nativeVk: 88,
          modifiers: 0,
        },
        {
          key: "$",
          code: "Digit4",
          text: "$",
          unmodifiedText: "4",
          vk: 52,
          nativeVk: 52,
          modifiers: 8,
        },
        {
          key: "F",
          code: "KeyF",
          text: "F",
          unmodifiedText: "f",
          vk: 70,
          nativeVk: 70,
          modifiers: 8,
        },
        {
          key: "-",
          code: "Minus",
          text: "-",
          unmodifiedText: "-",
          vk: 189,
          nativeVk: 189,
          modifiers: 0,
        },
      ]);
      expect(evidence.insertedExactlyOnce).toBe(true);
    } finally {
      cdp.close();
    }
  });

  it("refuses to type characters that have no US physical key", async () => {
    const appUrl = "http://127.0.0.1:10/";
    const dispatched: Array<Record<string, unknown>> = [];
    const { port } = await startFakeCdp(appUrl, {
      script: (request) => {
        if (request.method === "Input.dispatchKeyEvent") {
          dispatched.push({ ...(request.params ?? {}) });
          return { handled: true };
        }
        const expression = request.params?.expression ?? "";
        if (expression.includes("el.focus()")) return { handled: true, value: "focused" };
        if (expression.includes("isContentEditable")) {
          return { handled: true, value: "a\nb" };
        }
        return { handled: false };
      },
    });
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    try {
      await expect(cdp.trustedType('[contenteditable="true"]', "\n")).rejects.toThrow(
        "trusted typing has no US physical key",
      );
      expect(dispatched).toHaveLength(0);
    } finally {
      cdp.close();
    }
  });

  it("fails with the exact observed text when the insertion is doubled", async () => {
    const appUrl = "http://127.0.0.1:8/";
    let editableReads = 0;
    const { port } = await startFakeCdp(appUrl, {
      script: (request) => {
        if (request.method === "Input.dispatchKeyEvent") return { handled: true };
        const expression = request.params?.expression ?? "";
        if (expression.includes("el.focus()")) return { handled: true, value: "focused" };
        if (expression.includes("isContentEditable")) {
          editableReads += 1;
          return { handled: true, value: editableReads === 1 ? "" : "vv22qq" };
        }
        return { handled: false };
      },
    });
    const cdp = await ManagedCdpClient.connect({ cdpPort: port, appUrl, timeoutMs: 5_000 });
    try {
      const message = await cdp.trustedType('[contenteditable="true"]', "v2q").then(
        () => "",
        (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)),
      );
      expect(message).toContain("did not insert the declared workload exactly once");
      expect(message).toContain('after="vv22qq"');
    } finally {
      cdp.close();
    }
  });
});
