#!/usr/bin/env node
/**
 * Codex CLI lifecycle hook forwarder for Poracode.
 *
 * Invoked by Codex with:
 *   argv[2] = hook event name (e.g. "SessionStart", "Stop")
 *   stdin   = JSON payload (includes hook_event_name)
 *
 * Stop: Codex requires JSON on stdout when exit code is 0 — always emit `{}`.
 *
 * Generic plumbing lives in the shared `poracode-hook-runtime.mjs` sibling.
 */

import { readPluginVersionFromManifest, runForwarder } from "./poracode-hook-runtime.mjs";

const PLUGIN_VERSION = readPluginVersionFromManifest(import.meta.url);

function intentFor(eventName, payload, ctx) {
  const name = typeof payload?.hook_event_name === "string" ? payload.hook_event_name : eventName;
  switch (name) {
    case "SessionStart":
      return "session.started";
    case "UserPromptSubmit":
      return "session.turn_started";
    case "PermissionRequest":
      return "session.needs_approval";
    case "Stop":
      return "session.turn_finished";
    case "PreToolUse":
    case "PostToolUse":
      // Tool-use events are observability-only — surface them as turn_started
      // when debug is on so the supervisor sees them, otherwise skip.
      return ctx?.debug ? "session.turn_started" : undefined;
    default:
      return undefined;
  }
}

function buildExtra(eventName, payload) {
  const extra = { agentNativeEvent: eventName };
  if (payload && typeof payload === "object") {
    if (typeof payload.session_id === "string") extra.sessionId = payload.session_id;
    if (typeof payload.turn_id === "string") extra.turnId = payload.turn_id;
    if (typeof payload.tool_name === "string") extra.tool = payload.tool_name;
    if (typeof payload.permission_mode === "string") {
      extra.permissionMode = payload.permission_mode;
    }
    if (payload.tool_input && typeof payload.tool_input === "object") {
      const cmd = payload.tool_input.command;
      if (typeof cmd === "string") {
        extra.toolCommand = cmd.length > 200 ? `${cmd.slice(0, 200)}...` : cmd;
      }
    }
    if (typeof payload.last_assistant_message === "string") {
      const m = payload.last_assistant_message;
      extra.lastAssistantMessage = m.length > 500 ? `${m.slice(0, 500)}...` : m;
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

function stdoutResponseFor(eventName) {
  return eventName === "Stop" ? "{}" : undefined;
}

await runForwarder({
  agentKind: "codex",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
  stdoutResponseFor,
  debugLabel: "codex",
});
