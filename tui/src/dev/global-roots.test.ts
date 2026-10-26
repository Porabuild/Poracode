import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("PORACODE_TUI_HOME isolates the global OpenCode roots", () => {
  const home = mkdtempSync(path.join(tmpdir(), "poracode-tui-roots-"));
  const script = `
    import { Effect } from "effect"
    import { Global } from "@opencode/util/global"
    import { LayerNode } from "@opencode/util/effect/layer-node"
    const roots = await Effect.runPromise(
      Effect.gen(function* () {
        const global = yield* Global.Service
        return { data: global.data, cache: global.cache, config: global.config, state: global.state, tmp: global.tmp }
      }).pipe(Effect.provide(LayerNode.compile(Global.node))),
    )
    console.log(JSON.stringify(roots))
  `;
  try {
    const result = Bun.spawnSync([process.execPath, "-e", script], {
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: {
        ...process.env,
        PORACODE_TUI_HOME: home,
        OPENCODE_CONFIG_DIR: path.join(home, "override"),
        XDG_DATA_HOME: path.join(home, "xdg-data"),
        XDG_CACHE_HOME: path.join(home, "xdg-cache"),
        XDG_CONFIG_HOME: path.join(home, "xdg-config"),
        XDG_STATE_HOME: path.join(home, "xdg-state"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    const roots = JSON.parse(Buffer.from(result.stdout).toString("utf8")) as Record<string, string>;
    expect(roots).toEqual({
      data: path.join(home, "data"),
      cache: path.join(home, "cache"),
      config: path.join(home, "config"),
      state: path.join(home, "state"),
      tmp: path.join(home, "tmp"),
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
