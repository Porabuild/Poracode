#!/usr/bin/env node
/**
 * Qoder CLI lifecycle hook forwarder for Poracode.
 *
 * Invoked by Qoder on each subscribed hook event with:
 *   argv[2] = hook event name (e.g. "UserPromptSubmit")
 *   stdin   = JSON payload from Qoder
 *
 * Reads `PORACODE_HOOK_URL`, `PORACODE_HOOK_SECRET`, etc. from env, builds
 * the universal Poracode envelope, and POSTs it. Emits NOTHING on stdout —
 * Qoder relays hook stdout into the model's context for some events.
 *
 * Generic plumbing lives in the shared `poracode-hook-runtime.mjs` sibling.
 */

import {
  copyStringExtra,
  readPluginVersionFromManifest,
  runForwarder,
} from "./poracode-hook-runtime.mjs";

const PLUGIN_VERSION = readPluginVersionFromManifest(import.meta.url);

function intentFor(eventName, payload) {
  switch (eventName) {
    case "SessionStart":
      return "session.started";
    case "UserPromptSubmit":
      return "session.turn_started";
    case "PermissionRequest":
      return "session.needs_approval";
    // Tool finished (approve path) — exit `needs_approval`, still mid-turn.
    case "PostToolUse":
      return "session.turn_started";
    // Tool execution failed; Qoder recovers and `Stop` will close the turn.
    case "PostToolUseFailure":
      return "session.turn_started";
    case "ElicitationResult": {
      const a = payload?.action;
      if (a === "cancel" || a === "decline") {
        return "session.turn_finished";
      }
      return undefined;
    }
    case "Notification":
      // Only `idle_prompt` (assistant idle waiting on the human) maps to
      // `needs_reply`; permission / auth / elicitation notifications don't.
      return payload?.notification_type === "idle_prompt" ? "session.needs_reply" : undefined;
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
    copyStringExtra(extra, payload, "matcher", "matcher");
    copyStringExtra(extra, payload, "tool_name", "tool");
    copyStringExtra(extra, payload, "notification_type", "notificationType");
    copyStringExtra(extra, payload, "message", "message");
  }
  return extra;
}

function pickSessionId(payload) {
  return typeof payload?.session_id === "string" ? payload.session_id : undefined;
}

await runForwarder({
  agentKind: "qoder",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
});
