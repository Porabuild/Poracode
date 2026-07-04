#!/usr/bin/env node
/**
 * Gemini CLI lifecycle hook forwarder for Poracode.
 *
 * Gemini hooks communicate via JSON stdin/stdout. This script writes only a
 * final JSON object to stdout, and sends diagnostics to stderr when
 * LIGHTCODE_HOOK_DEBUG is enabled.
 *
 * Generic plumbing lives in the shared `lightcode-hook-runtime.mjs` sibling.
 */

import {
  copyStringExtra,
  readPluginVersionFromManifest,
  runForwarder,
} from "./lightcode-hook-runtime.mjs";

const PLUGIN_VERSION = readPluginVersionFromManifest(import.meta.url);

function notificationNeedsApproval(payload) {
  const notificationType = `${payload?.notification_type ?? payload?.type ?? ""}`.toLowerCase();
  const message = `${payload?.message ?? ""}`.toLowerCase();
  return (
    notificationType === "toolpermission" ||
    notificationType.includes("permission") ||
    message.includes("permission") ||
    message.includes("approval")
  );
}

function intentFor(eventName, payload) {
  const name = typeof payload?.hook_event_name === "string" ? payload.hook_event_name : eventName;
  switch (name) {
    case "SessionStart":
      return "session.started";
    case "BeforeAgent":
      return "session.turn_started";
    case "AfterAgent":
      return "session.turn_finished";
    case "Notification":
      return notificationNeedsApproval(payload) ? "session.needs_approval" : undefined;
    default:
      return undefined;
  }
}

function buildExtra(eventName, payload) {
  const extra = { agentNativeEvent: eventName };
  if (payload && typeof payload === "object") {
    copyStringExtra(extra, payload, "hook_event_name", "hookEventName");
    copyStringExtra(extra, payload, "source", "source");
    copyStringExtra(extra, payload, "tool_name", "tool");
    copyStringExtra(extra, payload, "original_request_name", "originalRequestName");
    copyStringExtra(extra, payload, "notification_type", "notificationType");
    copyStringExtra(extra, payload, "message", "message");
    if (payload.details && typeof payload.details === "object") {
      extra.details = payload.details;
    }
    if (typeof payload.stop_hook_active === "boolean") {
      extra.stopHookActive = payload.stop_hook_active;
    }
  }
  return extra;
}

function pickSessionId(payload) {
  return typeof payload?.session_id === "string" ? payload.session_id : undefined;
}

function stdoutResponseFor() {
  return '{"suppressOutput":true}\n';
}

await runForwarder({
  agentKind: "gemini",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
  stdoutResponseFor,
  debugLabel: "gemini",
});
