#!/usr/bin/env node
/**
 * Shell-agnostic CDP helper for the interactive-testing skill.
 *
 * Everything runs through `node` (always on PATH) using raw CDP over the
 * built-in WebSocket — no `agent-browser` PATH/shell quirks, no fish/zsh
 * word-splitting traps. Pairs with the DEV bridge (`window.__poracodeDev`,
 * see src/renderer/devBridge.ts) for instant state/navigation.
 *
 * Port defaults to $PORACODE_CDP_PORT or 9222; the app target URL defaults to
 * $PORACODE_APP_URL or http://127.0.0.1:3100/. Isolated smoke runs allocate
 * per-run ports — export both values from the runner's ports.json first.
 *
 *   node poracode-cdp.mjs wait [--timeout 90]        # block until the app CDP target is up
 *   node poracode-cdp.mjs eval '<js>' [--await]      # Runtime.evaluate, prints JSON result
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
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";

const { flags, pos } = parse(process.argv.slice(2));
const cmd = pos[0];
const port = Number(flags.port ?? process.env.PORACODE_CDP_PORT ?? 9222);
const appUrl = String(flags.appUrl ?? process.env.PORACODE_APP_URL ?? "http://127.0.0.1:3100/");
const windowKind = flags.windowKind ? String(flags.windowKind) : null;
const commandTimeoutMs = Number(flags.commandTimeoutMs ?? 8000);

try {
  await main();
} catch (error) {
  console.error(`ERROR: ${error?.message ?? error}`);
  process.exit(1);
}

async function main() {
  switch (cmd) {
    case "wait": {
      const timeoutS = Number(flags.timeout ?? 90);
      const target = await waitForTarget(timeoutS * 1000);
      console.log(target ? "READY" : "TIMEOUT");
      if (!target) process.exit(1);
      return;
    }
    case "eval": {
      const expr = required(pos[1], "eval needs a <js> expression");
      const client = await connect();
      try {
        const value = await evaluate(client, expr, flags.await === true);
        console.log(JSON.stringify(value));
      } finally {
        client.close();
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
        client.close();
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
        client.close();
      }
      return;
    }
    case "type": {
      const selector = required(pos[1], "type needs a <selector> and <text>");
      const value = required(pos[2], "type needs a <text>");
      const client = await connect();
      try {
        const focused = await evaluate(
          client,
          `(() => { const el = document.querySelector(${JSON.stringify(selector)});` +
            ` if (!el) return false; el.focus(); return true; })()`,
        );
        if (!focused) throw new Error(`selector not found: ${selector}`);
        await client.send("Input.insertText", { text: value });
        console.log(`type:${value.length}`);
      } finally {
        client.close();
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
      await bridgeCall(`window.__poracodeDev.reset()`);
      console.log("reset:ok");
      return;
    }
    default:
      console.error(
        "Usage: node poracode-cdp.mjs <wait|eval|shot|click|type|nav|back|update|reset> ...\n" +
          "See the header of this file for examples.",
      );
      process.exit(2);
  }
}

/** Eval a dev-bridge call, asserting the bridge exists (clearer error than a TypeError). */
async function bridgeCall(expr) {
  const client = await connect();
  try {
    const present = await evaluate(client, "typeof window.__poracodeDev");
    if (present !== "object") {
      throw new Error(
        "window.__poracodeDev is missing — is the app a DEV build with installDevBridge() wired in main.tsx?",
      );
    }
    return await evaluate(client, `(${expr}, "ok")`);
  } finally {
    client.close();
  }
}

async function connect() {
  const target = await waitForTarget(10000);
  if (!target) throw new Error(`no app CDP target at ${appUrl} on port ${port}`);
  return connectTarget(target);
}

async function connectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  await new Promise((done, reject) => {
    ws.onopen = done;
    ws.onerror = () => reject(new Error("WebSocket error connecting to CDP target"));
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
    close: () => ws.close(),
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
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});` +
      ` if (!el) return null; const r = el.getBoundingClientRect();` +
      ` return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  if (!point) throw new Error(`selector not found: ${selector}`);
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
  // A window's kind never changes, so remember each probed target across poll
  // iterations instead of re-opening a WebSocket to it every second.
  const probedKindsByTargetId = new Map();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const candidates = targets.filter((t) => t.type === "page" && t.url === appUrl);
        if (!windowKind && candidates[0]) return candidates[0];
        for (const target of candidates) {
          let kind = probedKindsByTargetId.get(target.id);
          if (kind === undefined) {
            const client = await connectTarget(target);
            try {
              kind = await evaluate(client, "document.documentElement.dataset.windowKind");
              probedKindsByTargetId.set(target.id, kind ?? null);
            } finally {
              client.close();
            }
          }
          if (kind === windowKind) return target;
        }
      }
    } catch {
      // CDP endpoint not up yet — keep polling.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
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
