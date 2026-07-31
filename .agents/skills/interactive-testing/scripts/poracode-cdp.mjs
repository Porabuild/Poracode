#!/usr/bin/env node
/**
 * Shell-agnostic CDP helper for the interactive-testing skill.
 *
 * Everything runs through `node` (always on PATH) using raw CDP over the
 * built-in WebSocket — no `agent-browser` PATH/shell quirks, no fish/zsh
 * word-splitting traps. Pairs with the DEV bridge (`window.__poracodeDev`,
 * see src/renderer/devBridge.ts) for instant state/navigation.
 *
 * Connection settings come from --session / $PORACODE_DEBUG_SESSION, a single
 * active managed debug session for this repository, or an explicit complete
 * PORACODE_CDP_PORT + PORACODE_APP_URL pair. Missing values are never guessed.
 *
 *   node poracode-cdp.mjs wait [--timeout 90]        # block until the app CDP target is up
 *   node poracode-cdp.mjs launch --new [--root path] # detached isolated app; prints READY manifest
 *   node poracode-cdp.mjs info                       # print the exact resolved session + target
 *   node poracode-cdp.mjs sessions                   # list managed sessions for this checkout
 *   node poracode-cdp.mjs stop                       # request verified teardown of the managed session
 *   node poracode-cdp.mjs eval '<js>|-' [--await]    # Runtime.evaluate; - reads JS from stdin
 *   node poracode-cdp.mjs shot <selector|-> <out>    # element (CSS selector) or full-viewport (-) PNG
 *   node poracode-cdp.mjs click <selector>            # click an element through CDP input
 *   node poracode-cdp.mjs type <selector> <text>      # focus and insert text
 *   --windowKind <main|quickComposer|browserExtract>  # select a renderer surface
 *   node poracode-cdp.mjs nav <section>              # open Settings deep-linked (e.g. about, usage) [needs bridge]
 *   node poracode-cdp.mjs back                       # close Settings overlay [needs bridge]
 *   node poracode-cdp.mjs update '<json>'            # patch the app-update store [needs bridge]
 *   node poracode-cdp.mjs reset                      # reset driven state to baseline [needs bridge]
 *
 * Examples:
 *   node poracode-cdp.mjs wait
 *   node poracode-cdp.mjs nav about
 *   node poracode-cdp.mjs update '{"phase":"downloading","version":"1.2.3","downloadPercent":42,"downloadTransferred":30618419,"downloadTotal":113554636}'
 *   node poracode-cdp.mjs shot "#shot-about" ~/.poracode-smoke/shots/about.png
 *   node poracode-cdp.mjs reset
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { closeWebSocket, inspectCdpWindowTargets } from "./poracode-cdp-target.mjs";
import { launchDetachedSession } from "./poracode-cdp-launch.mjs";
import {
  listDebugSessions,
  readDebugSession,
  resolveDebugConnection,
} from "./poracode-debug-session.mjs";

const { flags, pos } = parse(process.argv.slice(2));
const cmd = pos[0];
const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolvePath(scriptDir, "../../../../");
const windowKind = String(flags.windowKind ?? "main");
const commandTimeoutMs = Number(flags.commandTimeoutMs ?? 8000);
let connection;
let port;
let appUrl;

try {
  if (cmd !== "sessions" && cmd !== "launch") {
    connection = await resolveDebugConnection({
      session: flags.session ?? process.env.PORACODE_DEBUG_SESSION,
      port: flags.port ?? process.env.PORACODE_CDP_PORT,
      appUrl: flags.appUrl ?? process.env.PORACODE_APP_URL,
      repoRoot,
      ...(cmd === "wait" ? { allowedPurposes: ["debug", "smoke"] } : {}),
    });
    port = connection.port;
    appUrl = connection.appUrl;
  }
  await main();
} catch (error) {
  console.error(`ERROR: ${error?.message ?? error}`);
  process.exitCode = 1;
}

async function main() {
  switch (cmd) {
    case "sessions": {
      const sessions = await listDebugSessions({ repoRoot });
      console.log(
        JSON.stringify(
          sessions.map(
            ({
              sessionFile,
              id,
              purpose,
              state,
              active,
              cdpPort,
              appUrl: sessionAppUrl,
              ownerPid,
            }) => ({
              sessionFile,
              id,
              purpose,
              state,
              active,
              cdpPort,
              appUrl: sessionAppUrl,
              ownerPid,
            }),
          ),
          null,
          2,
        ),
      );
      return;
    }
    case "launch": {
      await launchDetachedSession({ flags, repoRoot, scriptDir });
      return;
    }
    case "wait": {
      const timeoutS = Number(flags.timeout ?? 90);
      const target = await waitForTarget(timeoutS * 1000);
      console.log(target ? "READY" : "TIMEOUT");
      if (!target) process.exitCode = 1;
      return;
    }
    case "stop": {
      if (!connection.sessionFile || !connection.root) {
        throw new Error("stop requires a managed debug session, not an explicit port and URL");
      }
      await writeFile(
        join(connection.root, "stop-request.json"),
        `${JSON.stringify({ requestedAt: new Date().toISOString(), requesterPid: process.pid })}\n`,
      );
      const started = Date.now();
      while (Date.now() - started < 15_000) {
        const session = await readDebugSession(connection.sessionFile);
        if (session.state === "stopped") {
          console.log("stop:ok");
          return;
        }
        if (session.state === "failed") {
          throw new Error(`managed debug teardown failed: ${session.error ?? "unknown error"}`);
        }
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error(`timed out waiting for managed debug teardown: ${connection.sessionFile}`);
    }
    case "info": {
      const target = await waitForTarget(10000);
      if (!target) throw new Error(`no ready app CDP target at ${appUrl} on port ${port}`);
      console.log(
        JSON.stringify(
          {
            sessionFile: connection.sessionFile,
            sessionId: connection.sessionId,
            sessionToken: connection.sessionToken,
            repoRoot: connection.repoRoot,
            cdpPort: port,
            appUrl,
            windowKind,
            targetId: target.id,
            title: target.title,
            url: target.url,
          },
          null,
          2,
        ),
      );
      return;
    }
    case "eval": {
      const rawExpr = required(pos[1], "eval needs a <js> expression or - for stdin");
      const expr = rawExpr === "-" ? await readStdinExpression() : rawExpr;
      const client = await connect();
      try {
        const value = await evaluate(client, expr, flags.await === true);
        console.log(JSON.stringify(value));
      } finally {
        await client.close();
      }
      return;
    }
    case "shot": {
      const selector = required(pos[1], "shot needs a <selector|-> and <out> path");
      const out = absOut(required(pos[2], "shot needs an <out> path"));
      const client = await connect();
      try {
        await screenshot(client, selector, out);
        console.log(out);
      } finally {
        await client.close();
      }
      return;
    }
    case "click": {
      const selector = required(pos[1], "click needs a <selector>");
      const client = await connect();
      try {
        await click(client, selector);
        console.log(`click:${selector}`);
      } finally {
        await client.close();
      }
      return;
    }
    case "type": {
      const selector = required(pos[1], "type needs a <selector> and <text>");
      const value = required(pos[2], "type needs a <text>");
      const client = await connect();
      try {
        const focusResult = await evaluate(
          client,
          `(() => { const matches = document.querySelectorAll(${JSON.stringify(selector)});` +
            ` if (matches.length === 0) return "missing";` +
            ` if (matches.length > 1) return "ambiguous:" + matches.length;` +
            ` const el = matches[0]; if (!(el instanceof HTMLElement)) return "not-html";` +
            ` if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return "disabled";` +
            ` if ("readOnly" in el && el.readOnly) return "read-only";` +
            ` if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !el.isContentEditable) return "not-editable";` +
            ` el.scrollIntoView({ block: "center", inline: "center" }); el.focus();` +
            ` const style = getComputedStyle(el); const r = el.getBoundingClientRect();` +
            ` if (r.width <= 0 || r.height <= 0 || style.display === "none" || style.visibility !== "visible" || style.opacity === "0" || style.pointerEvents === "none") return "not-visible";` +
            ` const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);` +
            ` if (!hit || (hit !== el && !el.contains(hit))) return "occluded";` +
            ` return document.activeElement === el ? "focused" : "not-focusable"; })()`,
        );
        if (focusResult !== "focused") {
          throw new Error(`cannot type into ${selector}: ${focusResult}`);
        }
        await client.send("Input.insertText", { text: value });
        console.log(`type:${value.length}`);
      } finally {
        await client.close();
      }
      return;
    }
    case "nav": {
      const section = required(pos[1], "nav needs a <section> id (e.g. about)");
      await bridgeCall(`window.__poracodeDev.openSettings(${JSON.stringify(section)})`);
      console.log(`nav:${section}`);
      return;
    }
    case "back": {
      await bridgeCall(`window.__poracodeDev.closeSettings()`);
      console.log("back");
      return;
    }
    case "update": {
      const json = required(pos[1], "update needs a '<json>' patch");
      const patch = JSON.parse(json); // validate before injecting
      await bridgeCall(`window.__poracodeDev.setUpdate(${JSON.stringify(patch)})`);
      console.log("update:ok");
      return;
    }
    case "reset": {
      const client = await connect();
      let remaining;
      try {
        await assertDevBridge(client);
        await evaluate(client, `(window.__poracodeDev.reset(), "ok")`);
        await new Promise((done) => setTimeout(done, 50));
        await clearComposer(client);
        await new Promise((done) => setTimeout(done, 50));
        remaining = await evaluate(
          client,
          `(() => { const panel = window.__poracodeDev.stores.panel.getState();` +
            ` return {` +
            ` composerText: [...document.querySelectorAll('[data-composer-input-anchor] [contenteditable="true"]')].map((el) => el.textContent ?? "").join("").trim(),` +
            ` panelsOpen: Boolean(panel.settingsOpen || panel.projectSettingsId || panel.gitReviewContext || panel.gitOverlayOpen || panel.prReviewContext || panel.filesPanelContext || panel.subAgentPanelOpen || panel.browserPanelOpen || panel.usagePanelOpen || panel.notesPanelOpen || panel.browserOverlayOpen || panel.threadSearchOpen || panel.createProjectModalOpen || panel.cloneProjectModalOpen)` +
            ` }; })()`,
        );
      } finally {
        await client.close();
      }
      if (remaining.composerText || remaining.panelsOpen) {
        throw new Error(`reset did not reach baseline: ${JSON.stringify(remaining)}`);
      }
      console.log("reset:ok");
      return;
    }
    default:
      console.error(
        "Usage: node poracode-cdp.mjs <launch|sessions|wait|info|stop|eval|shot|click|type|nav|back|update|reset> ...\n" +
          "See the header of this file for examples.",
      );
      process.exitCode = 2;
  }
}

async function readStdinExpression() {
  let expression = "";
  for await (const chunk of process.stdin) expression += String(chunk);
  if (!expression.trim()) throw new Error("eval received an empty expression on stdin");
  return expression;
}

async function clearComposer(client) {
  const state = await evaluate(
    client,
    `(() => { const matches = document.querySelectorAll('[data-composer-input-anchor] [contenteditable="true"]');` +
      ` if (matches.length === 0) return { count: 0, text: "" };` +
      ` if (matches.length > 1) return { count: matches.length, text: "" };` +
      ` const el = matches[0]; const text = (el.textContent ?? "").trim();` +
      ` if (text) { el.focus(); getSelection()?.selectAllChildren(el); document.execCommand("delete"); }` +
      ` return { count: 1, text }; })()`,
  );
  if (state.count > 1) throw new Error(`reset found ${state.count} composer inputs`);
}

/** Eval a dev-bridge call, asserting the bridge exists (clearer error than a TypeError). */
async function bridgeCall(expr) {
  const client = await connect();
  try {
    await assertDevBridge(client);
    return await evaluate(client, `(${expr}, "ok")`);
  } finally {
    await client.close();
  }
}

async function assertDevBridge(client) {
  const present = await evaluate(client, "typeof window.__poracodeDev");
  if (present !== "object") {
    throw new Error(
      "window.__poracodeDev is missing — is the app a DEV build with installDevBridge() wired in main.tsx?",
    );
  }
}

async function connect() {
  const target = await waitForTarget(connection.sessionFile ? 10000 : 1500);
  if (!target) throw new Error(`no app CDP target at ${appUrl} on port ${port}`);
  return connectTarget(target);
}

async function connectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  await new Promise((done, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out opening CDP WebSocket for target ${target.id}`)),
      Math.min(commandTimeoutMs, 3000),
    );
    ws.onopen = () => {
      clearTimeout(timeout);
      done();
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error connecting to CDP target ${target.id}`));
    };
  });
  ws.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (!payload.id) return;
    const item = pending.get(payload.id);
    if (!item) return;
    pending.delete(payload.id);
    if (payload.error) item.reject(new Error(`${item.method}: ${JSON.stringify(payload.error)}`));
    else item.resolve(payload.result);
  });
  return {
    send(method, params = {}) {
      id += 1;
      const requestId = id;
      ws.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((done, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`CDP timeout (${commandTimeoutMs}ms): ${method}`));
        }, commandTimeoutMs);
        pending.set(requestId, {
          method,
          resolve: (v) => (clearTimeout(timeout), done(v)),
          reject: (e) => (clearTimeout(timeout), reject(e)),
        });
      });
    },
    close: () => closeWebSocket(ws),
  };
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function screenshot(client, selector, out) {
  // captureBeyondViewport only for element clips (they may extend below the
  // fold). For full-viewport shots it must stay off: the compositor surface
  // can be larger than the visible window (e.g. after a viewport override),
  // and capturing beyond the viewport pads the PNG with dead space.
  const params = { format: "png", fromSurface: true };
  if (selector !== "-") {
    params.captureBeyondViewport = true;
    const rect = await evaluate(
      client,
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});` +
        ` if (!el) return null; const r = el.getBoundingClientRect();` +
        ` return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
    );
    if (!rect) throw new Error(`selector not found: ${selector}`);
    params.clip = {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.ceil(rect.width)),
      height: Math.max(1, Math.ceil(rect.height)),
      scale: 1,
    };
  }
  const res = await client.send("Page.captureScreenshot", params);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(res.data, "base64"));
}

async function click(client, selector) {
  const point = await evaluate(
    client,
    `(() => { const matches = document.querySelectorAll(${JSON.stringify(selector)});` +
      ` if (matches.length === 0) return { error: "missing" };` +
      ` if (matches.length > 1) return { error: "ambiguous:" + matches.length };` +
      ` const el = matches[0]; if (!(el instanceof HTMLElement)) return { error: "not-html" };` +
      ` if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return { error: "disabled" };` +
      ` if (el.closest("[inert]")) return { error: "inert" };` +
      ` el.scrollIntoView({ block: "center", inline: "center" });` +
      ` const r = el.getBoundingClientRect(); const style = getComputedStyle(el);` +
      ` if (r.width <= 0 || r.height <= 0 || style.display === "none" || style.visibility !== "visible" || style.opacity === "0" || style.pointerEvents === "none") return { error: "not-visible" };` +
      ` const x = r.x + r.width / 2; const y = r.y + r.height / 2;` +
      ` if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { error: "outside-viewport" };` +
      ` const hit = document.elementFromPoint(x, y);` +
      ` if (!hit || (hit !== el && !el.contains(hit))) return { error: "occluded" };` +
      ` return { x, y }; })()`,
  );
  if (point?.error) throw new Error(`cannot click ${selector}: ${point.error}`);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

async function waitForTarget(timeoutMs) {
  const start = Date.now();
  let lastTargets = null;
  let lastCandidateStates = [];
  let mismatchSince = null;
  let unhealthySince = null;
  let lastConnectionError = null;
  while (Date.now() - start < timeoutMs) {
    let inspection;
    try {
      inspection = await inspectCdpWindowTargets({ port, appUrl, windowKind });
    } catch (error) {
      if (error?.code === "PORACODE_NOT_CDP") throw error;
      lastConnectionError = error;
      await new Promise((done) => setTimeout(done, 250));
      continue;
    }

    lastTargets = inspection.targets;
    lastConnectionError = null;
    const { pageTargets, candidates, ready } = inspection;
    if (candidates.length === 0) {
      lastCandidateStates = [];
      unhealthySince = null;
      const stableMismatch = pageTargets.some(
        (target) => !target.url.startsWith("about:") && !target.url.startsWith("devtools:"),
      );
      if (stableMismatch) {
        mismatchSince ??= Date.now();
        if (Date.now() - mismatchSince >= 500) throw targetMismatchError(pageTargets);
      } else {
        mismatchSince = null;
      }
    } else {
      mismatchSince = null;
      lastCandidateStates = inspection.candidateStates;
      if (ready.length === 1) return ready[0];
      if (ready.length > 1) {
        throw new Error(
          `multiple ready ${windowKind} targets match debug session ${connection.sessionId ?? "explicit"} on CDP port ${port}: ${ready.map((target) => target.id).join(", ")}`,
        );
      }

      const viteError = lastCandidateStates.find((state) => state.viteError)?.viteError;
      if (viteError) throw new Error(`renderer Vite error: ${viteError}`);
      if (lastCandidateStates.some((state) => state.crashScreen)) {
        throw new Error("renderer crash screen is mounted");
      }

      const clearlyBroken = lastCandidateStates.some(
        (state) =>
          state.readyState === "complete" &&
          state.loadEventEnd > 0 &&
          state.title.length > 0 &&
          state.windowKind === null &&
          state.rootChildren === 0 &&
          state.bodyTextLength === 0,
      );
      if (clearlyBroken) {
        unhealthySince ??= Date.now();
        if (Date.now() - unhealthySince >= 3000) {
          throw new Error(
            readinessError("renderer stayed blank after document load", lastCandidateStates),
          );
        }
      } else {
        unhealthySince = null;
      }
    }
    await new Promise((done) => setTimeout(done, 250));
  }

  if (lastTargets) {
    const pageTargets = lastTargets.filter((t) => t.type === "page");
    if (pageTargets.length > 0 && lastCandidateStates.length === 0)
      throw targetMismatchError(pageTargets);
    if (lastCandidateStates.length > 0) {
      throw new Error(readinessError("renderer did not become ready", lastCandidateStates));
    }
  }
  if (lastConnectionError) {
    throw new Error(
      `CDP endpoint on port ${port} did not become reachable within ${timeoutMs}ms: ${lastConnectionError.message ?? lastConnectionError}`,
    );
  }
  return null;
}

function targetMismatchError(pageTargets) {
  const error = new Error(
    `no app CDP target matching ${appUrl} on port ${port}. ` +
      `Available page targets: ${pageTargets.map((target) => `${target.id}:${target.url}`).join(", ")}. ` +
      "Use the session.json from the launch output; do not substitute a Vite or stale CDP port.",
  );
  error.code = "PORACODE_TARGET_MISMATCH";
  return error;
}

function readinessError(reason, candidateStates) {
  return (
    `${reason} for ${windowKind} at ${appUrl} on CDP port ${port}. ` +
    `Candidate health: ${JSON.stringify(candidateStates)}`
  );
}

function absOut(p) {
  const expanded = p.startsWith("~/") ? resolvePath(homedir(), p.slice(2)) : p;
  return isAbsolute(expanded) ? expanded : resolvePath(process.cwd(), expanded);
}

function required(value, message) {
  if (value === undefined) throw new Error(message);
  return value;
}

function parse(argv) {
  const parsedFlags = {};
  const parsedPos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) parsedFlags[key] = true;
      else {
        parsedFlags[key] = next;
        i += 1;
      }
    } else {
      parsedPos.push(a);
    }
  }
  return { flags: parsedFlags, pos: parsedPos };
}
