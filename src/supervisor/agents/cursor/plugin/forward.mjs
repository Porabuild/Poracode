#!/usr/bin/env node
/**
 * Cursor hooks communicate via JSON stdin/stdout. We always emit a
 * non-blocking response on stdout (`{}` for audit hooks, `{"continue":true}`
 * for beforeSubmitPrompt) so the agent loop never stalls.
 *
 * Generic plumbing lives in the shared `poracode-hook-runtime.mjs` sibling.
 * NOTE: the intent map below mirrors `intentMap.ts` — keep both in sync.
 */

import {
  copyStringExtra,
  readPluginVersionFromManifest,
  runForwarder,
} from "./poracode-hook-runtime.mjs";

const PLUGIN_VERSION = readPluginVersionFromManifest(import.meta.url);

function intentFor(eventName, payload) {
  const name = typeof payload?.hook_event_name === "string" ? payload.hook_event_name : eventName;
  switch (name) {
    case "sessionStart":
      return "session.started";
    case "beforeSubmitPrompt":
    case "preToolUse":
    case "postToolUse":
      return "session.turn_started";
    case "stop": {
      const status = `${payload?.status ?? ""}`.toLowerCase();
      if (status === "error" || status === "aborted") return "session.turn_errored";
      return "session.turn_finished";
    }
    default:
      return undefined;
  }
}

function buildExtra(eventName, payload) {
  const extra = { agentNativeEvent: eventName };
  if (payload && typeof payload === "object") {
    copyStringExtra(extra, payload, "hook_event_name", "hookEventName");
    copyStringExtra(extra, payload, "tool_name", "tool");
    copyStringExtra(extra, payload, "model", "model");
    copyStringExtra(extra, payload, "cursor_version", "cursorVersion");
    copyStringExtra(extra, payload, "status", "status");
    copyStringExtra(extra, payload, "agent_message", "agentMessage");
    if (typeof payload.loop_count === "number") {
      extra.loopCount = payload.loop_count;
    }
    if (typeof payload.duration_ms === "number") {
      extra.durationMs = payload.duration_ms;
    }
  }
  return extra;
}

function pickSessionId(payload) {
  return typeof payload?.conversation_id === "string" ? payload.conversation_id : undefined;
}

// Cursor demands a stdout response on EVERY event so the agent loop doesn't
// stall — even when we have nothing meaningful to say. `beforeSubmitPrompt`
// gets `{"continue":true}`; everything else gets `{}`.
function stdoutResponseFor(eventName) {
  return eventName === "beforeSubmitPrompt" ? '{"continue":true}\n' : "{}\n";
}

await runForwarder({
  agentKind: "cursor",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
  stdoutResponseFor,
});
