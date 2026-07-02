#!/usr/bin/env node
/**
 * Command Code lifecycle hook forwarder for Poracode.
 *
 * Command Code invokes each configured hook as a shell command, passing the
 * event name as argv[2] (rendered by the installer as `<wrapper> <Event>`) and
 * the JSON payload on stdin. The payload also carries `hook_event_name`, so we
 * prefer that and fall back to argv.
 *
 * Reads `LIGHTCODE_HOOK_URL` / `LIGHTCODE_HOOK_SECRET` / `LIGHTCODE_THREAD_ID`
 * from env, maps the event to a universal Poracode intent, and POSTs the
 * envelope. When those vars are unset (the user runs `command-code` outside
 * Poracode) the forwarder no-ops. Emits NOTHING on stdout — Command Code, like
 * Claude Code, can relay hook stdout into the model's context.
 *
 * Generic plumbing lives in the shared `lightcode-hook-runtime.mjs` sibling.
 * NOTE: the intent map below mirrors `intentMap.ts` — keep both in sync.
 */

import {
  copyStringExtra,
  readPluginVersionFromManifest,
  runForwarder,
} from "./lightcode-hook-runtime.mjs";

const PLUGIN_VERSION = readPluginVersionFromManifest(import.meta.url);

function intentFor(eventName, payload) {
  const name = typeof payload?.hook_event_name === "string" ? payload.hook_event_name : eventName;
  switch (name) {
    case "PreToolUse":
    case "PostToolUse":
      return "session.turn_started";
    case "Stop":
      return "session.turn_finished";
    default:
      return undefined;
  }
}

function buildExtra(eventName, payload) {
  const extra = { agentNativeEvent: eventName };
  if (payload && typeof payload === "object") {
    copyStringExtra(extra, payload, "hook_event_name", "hookEventName");
    copyStringExtra(extra, payload, "tool_name", "tool");
    copyStringExtra(extra, payload, "permission_mode", "permissionMode");
    const toolInput = payload.tool_input;
    if (toolInput && typeof toolInput === "object" && typeof toolInput.command === "string") {
      const cmd = toolInput.command;
      extra.command = cmd.length > 500 ? `${cmd.slice(0, 500)}...` : cmd;
    }
  }
  return extra;
}

function pickSessionId(payload) {
  return typeof payload?.session_id === "string" ? payload.session_id : undefined;
}

await runForwarder({
  agentKind: "commandcode",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
});
