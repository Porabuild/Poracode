#!/usr/bin/env node
/**
 * GitHub Copilot CLI lifecycle hook forwarder for Poracode.
 *
 * Copilot hooks communicate via JSON stdin and (for `preToolUse`) JSON stdout.
 * We never override permission decisions — we always exit silently with no
 * stdout, which leaves the CLI's default policy intact.
 *
 * The CLI loads hooks from `${COPILOT_HOME ?? ~/.copilot}/hooks/*.json`, so
 * the user-global `lightcode-status.json` points its `bash` / `powershell`
 * field at this script (via the staged `lightcode-hook.{sh,cmd,ps1}` wrapper or
 * an absolute node path on WSL).
 *
 * Generic plumbing (manifest read, env-var POST, retry, debug) lives in the
 * shared `lightcode-hook-runtime.mjs` sibling. NOTE: the intent map below
 * mirrors `intentMap.ts` — keep both in sync.
 */

import {
  copyStringExtra,
  readPluginVersionFromManifest,
  runForwarder,
} from "./lightcode-hook-runtime.mjs";

const PLUGIN_VERSION = readPluginVersionFromManifest(import.meta.url);

function intentFor(eventName) {
  switch (eventName) {
    case "sessionStart":
      return "session.started";
    case "userPromptSubmitted":
    case "preToolUse":
    case "postToolUse":
      return "session.turn_started";
    case "errorOccurred":
      return "session.turn_errored";
    case "sessionEnd":
      return "session.turn_finished";
    default:
      return undefined;
  }
}

function buildExtra(eventName, payload) {
  const extra = { agentNativeEvent: eventName };
  if (payload && typeof payload === "object") {
    copyStringExtra(extra, payload, "toolName", "tool");
    copyStringExtra(extra, payload, "source", "source");
    copyStringExtra(extra, payload, "reason", "reason");
    copyStringExtra(extra, payload, "resultType", "resultType");
    copyStringExtra(extra, payload, "prompt", "promptPreview", 200);
    if (typeof payload.timestamp === "number") {
      extra.agentTimestamp = payload.timestamp;
    }
  }
  return extra;
}

function pickSessionId(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  for (const key of ["sessionId", "session_id"]) {
    const v = payload[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

await runForwarder({
  agentKind: "copilot",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
});
