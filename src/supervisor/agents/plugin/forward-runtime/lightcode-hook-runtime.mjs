/**
 * Shared runtime for provider hook forwarders (claude/codex/gemini/copilot/cursor).
 *
 * Each provider's `forward.mjs` imports this file as a sibling and calls
 * `runForwarder({ agentKind, intentFor, buildExtra, pickSessionId, ... })`.
 * The runtime owns: manifest read for `pluginVersion`, env-var debug flag,
 * bounded stdin read, retry POST, envelope construction, debug
 * logging, and the always-emit-stdout-on-error contract some CLIs require.
 *
 * Standalone ESM: must run under user CLI Node (claude / codex / cursor /
 * etc) without a bundler. Cross-platform — no shell, no native deps.
 *
 * Shipped via `prepare-agent-plugins.mjs` into each provider's plugin dir at
 * staging time, so `import "./lightcode-hook-runtime.mjs"` resolves as a
 * sibling of `forward.mjs` inside `~/.poracode/agent-plugins/<kind>/`.
 */

import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = 1;
const MAX_STDIN_CHARS = 2 * 1024 * 1024;
const POST_TIMEOUT_MS = 2_000;

export function readPluginVersionFromManifest(importMetaUrl) {
  try {
    const dir = dirname(fileURLToPath(importMetaUrl));
    const raw = readFileSync(join(dir, "plugin.json"), "utf8");
    const manifest = JSON.parse(raw);
    if (typeof manifest.version === "string" && manifest.version.length > 0) {
      return manifest.version;
    }
  } catch {
    // missing manifest or bad JSON — emit events with the safe fallback
  }
  return "0.0.0";
}

export function hookDebugEnabled() {
  const v = process.env.LIGHTCODE_HOOK_DEBUG;
  return v === "1" || v === "true" || Boolean(v && v !== "0" && v !== "false");
}

export function summarizePayload(payload) {
  if (payload === undefined) return "(empty stdin or unparseable JSON)";
  try {
    const s = JSON.stringify(payload);
    return s.length <= 2000 ? s : `${s.slice(0, 2000)}... (${s.length} chars total)`;
  } catch {
    return String(payload);
  }
}

export async function readJsonFromStream(stream, maxChars = MAX_STDIN_CHARS) {
  let data = "";
  let truncated = false;
  if (typeof stream.setEncoding === "function") stream.setEncoding("utf8");
  for await (const chunk of stream) {
    const text = String(chunk);
    const remaining = maxChars - data.length;
    if (remaining > 0) {
      data += text.length <= remaining ? text : text.slice(0, remaining);
    }
    if (text.length > remaining) truncated = true;
  }
  if (!data.trim() || truncated) return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export async function readStdin() {
  return readJsonFromStream(process.stdin);
}

/**
 * POST `body` to `url` once, returning `{ ok, status }`. Uses the bare
 * `node:http(s)` modules to avoid the per-process undici (fetch) cold-init
 * cost, which lands ~20–30 ms on every spawn. The supervisor's hook ingress
 * runs on `127.0.0.1`, so the loopback path is fast (~3–8 ms) once the
 * connection is open.
 */
function postOnce(url, headers, body) {
  return new Promise((resolveResult) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      resolveResult({ ok: false, error });
      return;
    }
    const transport = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const req = transport(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers: { ...headers, "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolveResult({ ok: true, status });
          } else if (status === 426) {
            resolveResult({ ok: true, status });
          } else {
            resolveResult({ ok: false, status, error: new Error(`HTTP ${status}`) });
          }
        });
      },
    );
    req.setTimeout(POST_TIMEOUT_MS, () => {
      req.destroy(new Error("hook POST timeout"));
    });
    req.on("error", (error) => resolveResult({ ok: false, error }));
    req.write(body);
    req.end();
  });
}

export async function postWithRetry(url, headers, body, attempts = 2) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    const result = await postOnce(url, headers, body);
    if (result.ok) return;
    lastError = result.error ?? new Error(`HTTP ${result.status ?? 0}`);
    if (i + 1 < attempts) await sleep(50);
  }
  if (lastError && hookDebugEnabled()) {
    process.stderr.write(`[lightcode-status] forward failed: ${String(lastError)}\n`);
  }
}

/** Convenience helper for `buildExtra` impls — copies a string field with truncation. */
export function copyStringExtra(extra, payload, sourceKey, targetKey, max = 500) {
  const v = payload?.[sourceKey];
  if (typeof v !== "string" || v.length === 0) return;
  extra[targetKey] = v.length > max ? `${v.slice(0, max)}...` : v;
}

/**
 * Run a provider forwarder. Reads argv[2] as the event name, JSON stdin as
 * payload, builds the universal envelope, and POSTs it. Returns silently when
 * the env vars are absent (i.e. the agent is running outside Poracode) or
 * when the provider can't map the event to an intent.
 *
 * Options:
 *   - `agentKind`           default for the `agentKind` envelope field, used
 *                           when `LIGHTCODE_AGENT_KIND` env var is unset.
 *   - `pluginVersion`       provider's plugin.json version (string).
 *   - `intentFor(name, payload, ctx)` map a native event to a Poracode
 *                           intent. `ctx.debug` available for per-event debug
 *                           tweaks (see codex). Return `undefined` to skip.
 *   - `buildExtra(name, payload)` provider-specific `extra` object.
 *   - `pickSessionId(payload)` extract the agent session id, or undefined.
 *   - `stdoutResponseFor(eventName)?` if returns a non-empty string, the
 *                           runtime writes it to stdout — even on uncaught
 *                           errors. Used by codex (Stop="{}") and gemini
 *                           ('{"suppressOutput":true}\n'); cursor passes a
 *                           variant that always returns a value.
 *   - `debugLabel`          tag for `[lightcode-hook] <label>` debug lines.
 *                           Defaults to `agentKind`.
 */
export async function runForwarder(options) {
  const {
    agentKind: defaultAgentKind,
    pluginVersion,
    intentFor,
    buildExtra,
    pickSessionId,
    stdoutResponseFor,
    debugLabel,
  } = options;

  const eventName = process.argv[2] ?? "";

  try {
    if (!eventName) return;

    const debug = hookDebugEnabled();
    const url = process.env.LIGHTCODE_HOOK_URL;
    // Some agent CLIs (e.g. command-code) strip env vars whose NAME matches a
    // secret denylist (/SECRET/, /TOKEN/, /AUTH/, …) before invoking the hook,
    // which drops LIGHTCODE_HOOK_SECRET. The supervisor also injects the same
    // value under the denylist-safe name LIGHTCODE_HOOK_NONCE; fall back to it.
    const secret = process.env.LIGHTCODE_HOOK_SECRET ?? process.env.LIGHTCODE_HOOK_NONCE;
    const threadId = process.env.LIGHTCODE_THREAD_ID;
    const agentKind = process.env.LIGHTCODE_AGENT_KIND ?? defaultAgentKind;
    const supervisorProtocol = Number(
      process.env.LIGHTCODE_HOOK_PROTOCOL_VERSION ?? PROTOCOL_VERSION,
    );
    const negotiatedProtocol = Math.min(PROTOCOL_VERSION, supervisorProtocol || PROTOCOL_VERSION);

    const payload = await readStdin();
    const intent = intentFor(eventName, payload, { debug });
    const sessionId = pickSessionId(payload);
    const label = debugLabel ?? agentKind;

    if (debug) {
      process.stderr.write(
        `[lightcode-hook] ${label} ${eventName} threadId=${threadId ?? "-"} sessionId=${
          sessionId ?? "-"
        } mappedIntent=${intent ?? "-"}\n`,
      );
      process.stderr.write(`[lightcode-hook] payload ${summarizePayload(payload)}\n`);
    }

    if (!url || !secret) {
      if (debug) {
        process.stderr.write(
          "[lightcode-hook] skip POST: missing LIGHTCODE_HOOK_URL or LIGHTCODE_HOOK_SECRET\n",
        );
      }
      return;
    }
    if (!intent) {
      if (debug) {
        process.stderr.write(
          `[lightcode-hook] skip POST: no mapped Poracode intent for ${eventName}\n`,
        );
      }
      return;
    }

    const envelope = {
      protocolVersion: negotiatedProtocol,
      agentKind,
      pluginVersion,
      ts: Date.now(),
      intent,
      extra: buildExtra(eventName, payload),
    };
    if (threadId) envelope.threadId = threadId;
    if (sessionId) envelope.sessionId = sessionId;

    await postWithRetry(
      url,
      {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      JSON.stringify(envelope),
    );

    if (debug) {
      process.stderr.write(`[lightcode-hook] posted intent=${intent} for ${eventName}\n`);
    }
  } catch (error) {
    if (hookDebugEnabled()) {
      process.stderr.write(`[lightcode-status] uncaught: ${String(error)}\n`);
    }
  } finally {
    if (stdoutResponseFor) {
      const out = stdoutResponseFor(eventName);
      if (typeof out === "string" && out.length > 0) process.stdout.write(out);
    }
  }
}
