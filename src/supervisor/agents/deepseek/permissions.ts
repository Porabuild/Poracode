import { rm } from "node:fs/promises";
import { join, posix } from "node:path";
import { writeFileAtomicAsync } from "@/shared/atomicFileAsync";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { isHomeScopeLocation } from "@/shared/homeScope";
import type { Awaitable } from "../base";
import { stageLaunchFiles } from "../base/launchFiles";
import { removeWslPath, writeWslTextFile } from "../plugin/wslStaging";

// ACP rc.2 exposes model controls only. Pin the native session policy on both
// creation and resume; deployment defaults alone lose to persisted session events.
// One pooled process hosts several Poracode threads, so the policy is keyed by
// the native session id: each thread writes `session-<id>.json` next to the
// plugin and the plugin applies only the file belonging to the session it is
// serving. A missing file fails the step closed at `agent/pre-step`.
export const DEEPSEEK_SESSION_POLICY = String.raw`
import { readFileSync } from "node:fs";
export const name = "poracode-session-policy";
export const inject = ["agents", "sandboxPolicy", "approval", "permissionPresets"];
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function apply(ctx, config) {
  const directory = new URL(config.sessionPolicyDir, import.meta.url);
  // One pooled process hosts several Poracode threads; each writes the policy
  // of its own session, keyed by the native session id.
  const readPolicy = (session) => {
    const id = session.header.id;
    if (typeof id !== "string" || !SESSION_ID.test(id))
      throw new Error("Poracode session policy: invalid session id");
    try {
      return JSON.parse(readFileSync(new URL("session-" + id + ".json", directory), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
  };
  const applyPolicy = (session, required) => {
    if (session.header.origin === "subagent" || session.header.parentSession !== undefined) return;
    const policy = readPolicy(session);
    if (policy === undefined) {
      if (required) throw new Error("Poracode session policy: no policy for session " + session.header.id);
      return;
    }
    const { sandboxMode, autoReview } = policy;
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
  // A new session's id reaches Poracode only when session/new returns, so its
  // policy can land after creation; nothing runs before the first prompt.
  ctx.on("agent/created", ({ agent }) => {
    applyPolicy(agent.session, false);
  });
  // Input is claimed outside session-event publication, before prompt assembly.
  ctx.on("agent/inbox/claimed", ({ agent }) => {
    applyPolicy(agent.session, false);
  });
  // The awaited hook fails the step closed when the policy is missing or unreadable.
  ctx.on("agent/pre-step", ({ agent }, next) => {
    applyPolicy(agent.session, true);
    return next();
  });
  ctx.provide("poracodeSessionPolicy", { ready: true });
}
`;

const DEEPSEEK_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function normalizeDeepSeekConfig(config: ThreadConfig): ThreadConfig {
  return !config.approvalPolicy || config.approvalPolicy === "never"
    ? { ...config, approvalPolicy: "auto-review" }
    : config;
}

/** The `{sandboxMode, autoReview}` policy one session's `session-<id>.json` carries. */
export function deepSeekSessionPolicy(location: ProjectLocation, config: ThreadConfig): string {
  const bypass = isHomeScopeLocation(location) || config.approvalPolicy === "bypassPermissions";
  const autoReview = !bypass && normalizeDeepSeekConfig(config).approvalPolicy === "auto-review";
  return JSON.stringify({
    sandboxMode: bypass || autoReview ? "danger-full-access" : "workspace-write",
    autoReview,
  });
}

export interface StagedDeepSeekPolicyFiles {
  directory: string;
  patchPath: string;
  cleanup(): Awaitable<void>;
}

/**
 * Stage the plugin (`policy.mjs`) and its `--patch` document (`permissions.json`)
 * in a private per-launch directory. The patch points the plugin at the same
 * directory (`sessionPolicyDir: "./"`); per-session policies are written there
 * later by {@link createDeepSeekSessionPolicyWriter}.
 */
export async function stageDeepSeekPolicyFiles(
  location: ProjectLocation,
): Promise<StagedDeepSeekPolicyFiles> {
  const staged = await stageLaunchFiles(location, "deepseek-session", {
    "policy.mjs": DEEPSEEK_SESSION_POLICY,
    "permissions.json": JSON.stringify([
      { id: "acp", inject: ["acpAppStartup", "poracodeSessionPolicy"] },
      {
        insert: [
          { id: "auto-review", name: "@deepseek-ai/dsh-experimental-auto-review" },
          {
            id: "poracode-session-policy",
            name: "./policy.mjs",
            config: { sessionPolicyDir: "./" },
          },
        ],
      },
    ]),
  });
  const pathJoin = location.kind === "wsl" ? posix.join : join;
  return {
    directory: staged.directory,
    patchPath: pathJoin(staged.directory, "permissions.json"),
    cleanup: staged.cleanup,
  };
}

export interface DeepSeekPolicyHomeLease {
  directory: string;
  patchPath: string;
  release(): Promise<void>;
}

export interface DeepSeekPolicyHome {
  acquire(location: ProjectLocation): Promise<DeepSeekPolicyHomeLease>;
}

/**
 * One refcounted policy directory per adapter. Every pooled `dsh` process
 * launches with the same `--patch` path, so native threads share the staged
 * plugin files while each writes only its own `session-<id>.json`. The first
 * acquire stages; concurrent acquirers await the same staging promise. When
 * the last lease releases, the entry is dropped synchronously — a later
 * acquire stages a fresh directory — and cleanup runs afterwards. A rejected
 * staging drops the entry so the next acquire retries.
 */
export function createDeepSeekPolicyHome(): DeepSeekPolicyHome {
  let entry: { staging: Promise<StagedDeepSeekPolicyFiles>; refs: number } | undefined;
  return {
    async acquire(location) {
      if (entry === undefined) {
        entry = { staging: stageDeepSeekPolicyFiles(location), refs: 0 };
      }
      const current = entry;
      current.refs += 1;
      let files: StagedDeepSeekPolicyFiles;
      try {
        files = await current.staging;
      } catch (error) {
        current.refs -= 1;
        if (entry === current) entry = undefined;
        throw error;
      }
      let released = false;
      return {
        directory: files.directory,
        patchPath: files.patchPath,
        release: async () => {
          if (released) return;
          released = true;
          current.refs -= 1;
          if (current.refs > 0) return;
          if (entry === current) entry = undefined;
          await files.cleanup();
        },
      };
    },
  };
}

/**
 * Writes the `session-<id>.json` policy file for one ACP session inside a
 * staged policy directory. Operations run in call order through one promise
 * chain — a failed operation never blocks the ones queued after it — and
 * `clear()` is terminal: once it runs, later `write()` calls resolve without
 * touching disk. That ordering keeps a turn's or openThread's write from
 * landing after the adapter's dispose cleared the file and released the
 * policy home. A writer tracks a single current session id: a write for a
 * different id first removes the previous file. Native writes go through
 * writeFileAtomicAsync; WSL writes go through the per-distro staging worker.
 */
export function createDeepSeekSessionPolicyWriter(
  location: ProjectLocation,
  directory: string,
): {
  write(sessionId: string, config: ThreadConfig): Promise<void>;
  clear(): Promise<void>;
} {
  const pathJoin = location.kind === "wsl" ? posix.join : join;
  const targetFor = (sessionId: string) => pathJoin(directory, `session-${sessionId}.json`);
  const remove = async (sessionId: string) => {
    const target = targetFor(sessionId);
    if (location.kind === "wsl") {
      await removeWslPath(location.distro, target);
    } else {
      await rm(target, { force: true });
    }
  };
  let currentId: string | undefined;
  let cleared = false;
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const run = chain.then(operation);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const performWrite = async (sessionId: string, config: ThreadConfig) => {
    if (!DEEPSEEK_SESSION_ID.test(sessionId)) {
      throw new Error("Invalid DeepSeek session id");
    }
    if (currentId !== undefined && currentId !== sessionId) {
      await remove(currentId);
    }
    const content = deepSeekSessionPolicy(location, config);
    const target = targetFor(sessionId);
    if (location.kind === "wsl") {
      await writeWslTextFile(location.distro, target, content, { mode: 0o600 });
    } else {
      await writeFileAtomicAsync(target, content, { encoding: "utf8", mode: 0o600 });
    }
    currentId = sessionId;
  };
  return {
    write(sessionId, config) {
      if (cleared) return Promise.resolve();
      return enqueue(() => performWrite(sessionId, config));
    },
    clear() {
      cleared = true;
      return enqueue(async () => {
        const sessionId = currentId;
        currentId = undefined;
        if (sessionId === undefined) return;
        try {
          await remove(sessionId);
        } catch {
          // Cleanup is best effort.
        }
      });
    },
  };
}
