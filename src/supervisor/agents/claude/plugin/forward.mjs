#!/usr/bin/env node
/**
 * Claude Code lifecycle hook forwarder for Poracode.
 *
 * Invoked by Claude on each subscribed hook event with:
 *   argv[2] = hook event name (e.g. "UserPromptSubmit")
 *   stdin   = JSON payload from Claude
 *
 * Reads `LIGHTCODE_HOOK_URL`, `LIGHTCODE_HOOK_SECRET`, etc. from env, builds
 * the universal Poracode envelope, and POSTs it. Emits NOTHING on stdout —
 * Claude relays hook stdout into the model's context for some events.
 *
 * Generic plumbing lives in the shared `lightcode-hook-runtime.mjs` sibling.
 */

import { readPluginVersionFromManifest, runForwarder } from "./lightcode-hook-runtime.mjs";

const PLUGIN_VERSION = readPluginVersionFromManifest(import.meta.url);

function intentFor(eventName, payload) {
  switch (eventName) {
    case "SessionStart":
      return "session.started";
    case "UserPromptSubmit":
      return "session.turn_started";
    case "PermissionRequest":
      return "session.needs_approval";
    // Auto-mode classifier denied a tool. Claude usually recovers and
    // continues the turn, so we stay in `working` rather than idle.
    case "PermissionDenied":
      return "session.turn_started";
    // Tool finished (approve path) — exit `needs_approval`, still mid-turn.
    case "PostToolUse":
      return "session.turn_started";
    // Tool execution failed. Two sub-cases per Claude docs:
    //   - `is_interrupt: true` → user interrupt; `Stop` will NOT follow, so
    //     this is the actual turn end → idle.
    //   - otherwise → genuine failure; Claude recovers and `Stop` will fire,
    //     so stay `working` and let `Stop` close the turn.
    case "PostToolUseFailure":
      return payload?.is_interrupt === true ? "session.turn_finished" : "session.turn_started";
    case "ElicitationResult": {
      const a = payload?.action;
      if (a === "cancel" || a === "decline") {
        return "session.turn_finished";
      }
      return undefined;
    }
    case "Notification":
      return payload?.matcher === "idle_prompt" ? "session.needs_reply" : undefined;
    case "TaskCreated":
      return "session.turn_started";
    case "TaskCompleted":
      return "session.turn_finished";
    case "Stop":
      return "session.turn_finished";
    case "StopFailure":
      return "session.turn_errored";
    default:
      return undefined;
  }
}

function buildExtra(eventName, payload) {
  const extra = { agentNativeEvent: eventName };
  if (payload && typeof payload === "object") {
    if (payload.matcher) extra.matcher = payload.matcher;
    if (payload.tool_name) extra.tool = payload.tool_name;
    if (payload.message) extra.message = payload.message;
  }
  return extra;
}

function pickSessionId(payload) {
  return typeof payload?.session_id === "string" ? payload.session_id : undefined;
}

await runForwarder({
  agentKind: "claude",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
});
