import { join, posix } from "node:path";
import { writeFileSync } from "node:fs";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { isHomeScopeLocation } from "@/shared/homeScope";
import { stageLaunchFiles } from "../base/launchFiles";
import { writeWslTextFile } from "../plugin/wslStaging";

// ACP rc.2 exposes model controls only. Pin the native session policy on both
// creation and resume; deployment defaults alone lose to persisted session events.
export const DEEPSEEK_SESSION_POLICY = String.raw`
import { readFileSync } from "node:fs";
export const name = "poracode-session-policy";
export const inject = ["agents", "sandboxPolicy", "approval", "permissionPresets"];
export function apply(ctx, config) {
  const applyPolicy = (session) => {
    if (session.header.origin === "subagent" || session.header.parentSession !== undefined) return;
    const { sandboxMode, autoReview } = JSON.parse(readFileSync(new URL(config.policyPath, import.meta.url), "utf8"));
    if (autoReview) {
      ctx.permissionPresets.set(session, "auto");
      return;
    }
    if (ctx.permissionPresets.current(session) === "auto")
      ctx.permissionPresets.set(session, sandboxMode);
    if (ctx.sandboxPolicy.resolve({ session }).mode !== sandboxMode)
      session.append("sandbox/mode", { mode: sandboxMode });
    // Route every approval through ACP so Poracode's current policy decides.
    if (ctx.approval.effectivePolicy(session) !== "ask")
      session.append("approval/policy", { policy: "ask" });
  };
  ctx.on("agent/created", ({ agent }) => {
    applyPolicy(agent.session);
  });
  // Input is claimed outside session-event publication, before prompt assembly.
  ctx.on("agent/inbox/claimed", ({ agent }) => {
    applyPolicy(agent.session);
  });
  // The awaited hook also fails the step closed if the policy cannot be read.
  ctx.on("agent/pre-step", ({ agent }, next) => {
    applyPolicy(agent.session);
    return next();
  });
  ctx.provide("poracodeSessionPolicy", { ready: true });
}
`;

export function normalizeDeepSeekConfig(config: ThreadConfig): ThreadConfig {
  return !config.approvalPolicy || config.approvalPolicy === "never"
    ? { ...config, approvalPolicy: "auto-review" }
    : config;
}

export async function stageDeepSeekPermissions(
  location: ProjectLocation,
  initialConfig: ThreadConfig,
) {
  const policy = (config: ThreadConfig) => {
    const bypass = isHomeScopeLocation(location) || config.approvalPolicy === "bypassPermissions";
    const autoReview = !bypass && normalizeDeepSeekConfig(config).approvalPolicy === "auto-review";
    return JSON.stringify({
      sandboxMode: bypass || autoReview ? "danger-full-access" : "workspace-write",
      autoReview,
    });
  };
  const staged = await stageLaunchFiles(location, "deepseek-session", {
    "policy.mjs": DEEPSEEK_SESSION_POLICY,
    "selection.json": policy(initialConfig),
    "permissions.json": JSON.stringify([
      { id: "acp", inject: ["acpAppStartup", "poracodeSessionPolicy"] },
      {
        insert: [
          { id: "auto-review", name: "@deepseek-ai/dsh-experimental-auto-review" },
          {
            id: "poracode-session-policy",
            name: "./policy.mjs",
            config: { policyPath: "./selection.json" },
          },
        ],
      },
    ]),
  });
  const pathJoin = location.kind === "wsl" ? posix.join : join;
  const policyPath = pathJoin(staged.directory, "selection.json");
  return {
    ...staged,
    patchPath: pathJoin(staged.directory, "permissions.json"),
    async setConfig(config: ThreadConfig) {
      if (location.kind === "wsl")
        await writeWslTextFile(location.distro, policyPath, policy(config));
      else writeFileSync(policyPath, policy(config), "utf8");
    },
  };
}
