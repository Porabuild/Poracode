import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEEPSEEK_GENERATION_POLICY } from "./oneShotPolicy";

type Execution = { name: string; arguments: unknown };
type Guard = (exec: Execution) => string | undefined;
type Created = (event: {
  agent: {
    ctx: { tools: { restrict: (filter: { allow: string[] }) => void; guard: (fn: Guard) => void } };
    session: { header: { cwd: string } };
  };
}) => void;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(readOnlyWorkspace: boolean) {
  const root = mkdtempSync(join(tmpdir(), "poracode-deepseek-generation-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const outside = join(root, "workspace-other");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(workspace, "allowed.txt"), "inside");
  writeFileSync(join(outside, "secret.txt"), "outside");
  symlinkSync(
    outside,
    join(workspace, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const uri = `data:text/javascript;base64,${Buffer.from(DEEPSEEK_GENERATION_POLICY).toString("base64")}`;
  const plugin = (await import(/* @vite-ignore */ uri)) as {
    apply: (
      ctx: {
        on: (event: string, fn: Created) => void;
        provide: (name: string, value: unknown) => void;
      },
      config: { readOnlyWorkspace: boolean },
    ) => void;
  };
  const on = vi.fn<(event: string, fn: Created) => void>();
  const provide = vi.fn<(name: string, value: unknown) => void>();
  const restrict = vi.fn<(filter: { allow: string[] }) => void>();
  const guard = vi.fn<(fn: Guard) => void>();
  plugin.apply({ on, provide }, { readOnlyWorkspace });
  expect(on.mock.calls[0]?.[0]).toBe("agent/created");
  expect(provide).toHaveBeenCalledWith("poracodeGenerationPolicy", { ready: true });
  on.mock.calls[0]![1]({
    agent: { ctx: { tools: { restrict, guard } }, session: { header: { cwd: workspace } } },
  });
  return { restrict, check: guard.mock.calls[0]![0], outside };
}

describe("DeepSeek generation tool policy", () => {
  it("exposes workspace read/search tools and denies writes, execution, delegation, and path escapes", async () => {
    const { restrict, check, outside } = await fixture(true);
    expect(restrict).toHaveBeenCalledWith({ allow: ["read", "glob", "grep"] });
    expect(check({ name: "read", arguments: { file_path: "allowed.txt" } })).toBeUndefined();
    expect(check({ name: "glob", arguments: { pattern: "*" } })).toBeUndefined();
    expect(check({ name: "grep", arguments: { path: ".", pattern: "inside" } })).toBeUndefined();
    for (const execution of [
      { name: "write", arguments: { file_path: "allowed.txt" } },
      { name: "bash", arguments: { command: "pwd" } },
      { name: "subagent", arguments: {} },
      { name: "custom-local-tool", arguments: {} },
      { name: "read", arguments: { file_path: join(outside, "secret.txt") } },
      { name: "read", arguments: { file_path: "../workspace-other/secret.txt" } },
      { name: "read", arguments: { file_path: "escape/secret.txt" } },
      { name: "read", arguments: { file_path: { invalid: true } } },
    ]) {
      expect(check(execution)).toContain("Generation only permits");
    }
  });

  it("leaves ordinary prompt-only generation with no callable tools", async () => {
    const { restrict, check } = await fixture(false);
    expect(restrict).toHaveBeenCalledWith({ allow: [] });
    expect(check({ name: "read", arguments: { file_path: "allowed.txt" } })).toContain(
      "Generation only permits",
    );
  });
});
