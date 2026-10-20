/** Ephemeral Cordis plugin, loaded only by Poracode's headless generation invocation. */
export const DEEPSEEK_GENERATION_POLICY = String.raw`
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const name = "poracode-generation-policy";
export const inject = ["tools", "agents"];

export function apply(ctx, config) {
  const allowed = new Set(config.readOnlyWorkspace ? ["read", "glob", "grep"] : []);
  const denied = "Generation only permits reading and searching its workspace.";
  ctx.on("agent/created", ({ agent }) => {
    const tools = agent.ctx.tools;
    const root = realpathSync(agent.session.header.cwd);
    tools.restrict({ allow: [...allowed] });
    // A monotonic guard also rejects scope-local tools, which native tool
    // restrictions deliberately leave visible, and direct unadvertised calls.
    tools.guard((exec) => {
      if (!allowed.has(exec.name)) return denied;
      const args = exec.arguments;
      const path = args?.[exec.name === "read" ? "file_path" : "path"] ?? ".";
      if (typeof path !== "string") return denied;
      try {
        const target = realpathSync(resolve(root, path));
        const within = relative(root, target);
        if (within === ".." || within.startsWith(".." + sep) || isAbsolute(within)) return denied;
      } catch {
        return denied;
      }
    });
  });
  ctx.provide("poracodeGenerationPolicy", { ready: true });
}
`;
