#!/usr/bin/env node
/**
 * Grok CLI lifecycle hook forwarder for Poracode.
 *
 * The Grok TUI auto-loads global hooks from `~/.grok/hooks/*.json` on every
 * session start (always trusted, no per-project prompt). The user-global
 * `lightcode-status.json` written at install time points each event's command
 * at this script via the staged `lightcode-hook.{sh,cmd,ps1}` wrapper (native)
 * or an absolute node path (WSL).
 *
 * Hook stdin carries the Grok event envelope: `{ hookEventName, sessionId,
 * cwd, workspaceRoot, toolName?, toolInput?, ... }`. We never deny tool calls
 * — passive instrumentation only.
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

function normalizeEventName(eventName, payload) {
  const fromPayload =
    typeof payload?.hookEventName === "string" ? payload.hookEventName : undefined;
  return fromPayload ?? eventName;
}

function notificationNeedsApproval(payload) {
  const notificationType =
    `${payload?.notificationType ?? payload?.notification_type ?? payload?.type ?? ""}`.toLowerCase();
  const message = `${payload?.message ?? ""}`.toLowerCase();
  return (
    notificationType.includes("permission") ||
    notificationType.includes("approval") ||
    message.includes("permission") ||
    message.includes("approval")
  );
}

function intentFor(eventName, payload) {
  const name = normalizeEventName(eventName, payload).toLowerCase();
  switch (name) {
    case "sessionstart":
    case "session_start":
      return "session.started";
    case "userpromptsubmit":
    case "user_prompt_submit":
      return "session.turn_started";
    case "stop":
      return "session.turn_finished";
    case "notification":
      return notificationNeedsApproval(payload) ? "session.needs_approval" : undefined;
    default:
      return undefined;
  }
}

function buildExtra(eventName, payload) {
  const extra = { agentNativeEvent: eventName };
  if (payload && typeof payload === "object") {
    copyStringExtra(extra, payload, "hookEventName", "hookEventName");
    copyStringExtra(extra, payload, "toolName", "tool");
    copyStringExtra(extra, payload, "notificationType", "notificationType");
    copyStringExtra(extra, payload, "notification_type", "notificationType");
    copyStringExtra(extra, payload, "type", "notificationType");
    copyStringExtra(extra, payload, "message", "message");
    copyStringExtra(extra, payload, "source", "source");
    if (typeof payload.timestamp === "string") {
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
  agentKind: "grok",
  pluginVersion: PLUGIN_VERSION,
  intentFor,
  buildExtra,
  pickSessionId,
  debugLabel: "grok",
});
