import { describe, expect, it } from "vitest";
import type { AgentAuthMethod } from "@/shared/contracts";
import {
  inheritBaseSpawnEnv,
  mergeSpawnEnv,
  withBaseSpawnEnv,
  withCommandBaseSpawnEnv,
} from "./base";
import { antigravityDetectionSpec } from "./antigravity/detection";
import { commandCodeDetectionSpec } from "./commandcode/detection";
import { factoryDetectionSpec } from "./factory/detection";
import { museDetectionSpec } from "./muse/detection";
import { createAgentRegistry } from "./registry";

/**
 * `baseSpawnEnv` is the single declaration point for env that must ride EVERY
 * Poracode-made spawn of a CLI — in practice, opt-outs for CLIs that otherwise
 * fire a detached background self-updater. On Windows such an updater escapes
 * its parent's pseudoconsole, allocates a fresh console, and (with Windows
 * Terminal as the default terminal app) pops a stray window mid-session.
 *
 * The value of the design is that a NEW launch point can't silently miss it, so
 * these tests pin both halves of that guarantee:
 *   1. every provider that declares it on its detection spec also exposes it on
 *      its adapter (the lanes split across the two), and
 *   2. the shared merge helpers behave as the launch points assume.
 */

const SPECS_WITH_BASE_ENV = [
  ["antigravity", antigravityDetectionSpec],
  ["commandcode", commandCodeDetectionSpec],
  ["factory", factoryDetectionSpec],
  ["muse", museDetectionSpec],
] as const;

describe("baseSpawnEnv declaration", () => {
  it.each(SPECS_WITH_BASE_ENV)("%s declares a non-empty baseSpawnEnv", (_kind, spec) => {
    expect(spec.baseSpawnEnv).toBeDefined();
    expect(Object.keys(spec.baseSpawnEnv ?? {}).length).toBeGreaterThan(0);
  });

  it.each(SPECS_WITH_BASE_ENV)(
    "%s's adapter exposes the same map as its detection spec",
    (kind, spec) => {
      const adapter = createAgentRegistry().find((candidate) => candidate.kind === kind);
      expect(adapter).toBeDefined();
      // Derived via `inheritBaseSpawnEnv`, so the two can never drift. A
      // provider that re-declares the literal on the adapter would pass this
      // today and silently diverge on the next edit.
      expect(adapter?.baseSpawnEnv).toBe(spec.baseSpawnEnv);
    },
  );

  it("never leaks into the explicit update command", () => {
    // Suppressing the CLI's updater must not disable the user-driven
    // "update agent" action, which is the sanctioned way to update.
    const builtIns = SPECS_WITH_BASE_ENV.map(
      ([kind, spec]) => [kind, spec.update?.builtIn] as const,
    ).filter(([, builtIn]) => builtIn !== undefined);
    expect(builtIns.length).toBeGreaterThan(0);
    for (const [, builtIn] of builtIns) {
      expect(builtIn).not.toHaveProperty("env");
    }
  });
});

describe("inheritBaseSpawnEnv", () => {
  it("omits the key entirely when the spec declares nothing", () => {
    // Must be an absent key, not `undefined` — `exactOptionalPropertyTypes`.
    expect(inheritBaseSpawnEnv({})).not.toHaveProperty("baseSpawnEnv");
  });

  it("passes the spec's map through by reference", () => {
    const baseSpawnEnv = { A: "1" };
    expect(inheritBaseSpawnEnv({ baseSpawnEnv }).baseSpawnEnv).toBe(baseSpawnEnv);
  });
});

describe("mergeSpawnEnv", () => {
  it("returns undefined when nothing is contributed", () => {
    expect(mergeSpawnEnv(undefined, undefined)).toBeUndefined();
    expect(mergeSpawnEnv()).toBeUndefined();
  });

  it("lets later (more specific) layers win", () => {
    expect(mergeSpawnEnv({ A: "base", B: "base" }, { A: "lane" })).toEqual({
      A: "lane",
      B: "base",
    });
  });

  it("does not mutate its inputs", () => {
    const base = { A: "base" };
    mergeSpawnEnv(base, { A: "lane" });
    expect(base).toEqual({ A: "base" });
  });
});

describe("withBaseSpawnEnv", () => {
  const terminal = { type: "terminal", id: "login", name: "Login" } as const;

  it("applies the base env to terminal auth methods", () => {
    const [method] = withBaseSpawnEnv([terminal], { A: "1" });
    expect(method).toMatchObject({ id: "login", env: { A: "1" } });
  });

  it("keeps a method's own env winning on conflict", () => {
    const [method] = withBaseSpawnEnv([{ ...terminal, env: { A: "method" } }], { A: "base" });
    expect(method).toMatchObject({ env: { A: "method" } });
  });

  it("leaves non-terminal auth methods untouched", () => {
    const envVar: AgentAuthMethod = { type: "env_var", id: "key", name: "API key", vars: [] };
    expect(withBaseSpawnEnv([envVar], { A: "1" })).toEqual([envVar]);
  });

  it("is a no-op without a base env", () => {
    expect(withBaseSpawnEnv([terminal], undefined)).toEqual([terminal]);
  });
});

describe("withCommandBaseSpawnEnv", () => {
  const command: import("./base").CommandSpec = { command: "agy", args: ["--version"] };

  it("applies the base env to a command without its own env", () => {
    expect(withCommandBaseSpawnEnv(command, { A: "1" })).toEqual({
      command: "agy",
      args: ["--version"],
      env: { A: "1" },
    });
  });

  it("lets the command's own env win on conflict", () => {
    expect(
      withCommandBaseSpawnEnv({ ...command, env: { A: "command" } }, { A: "base", B: "base" }),
    ).toMatchObject({ env: { A: "command", B: "base" } });
  });

  it("returns the same object when nothing is contributed", () => {
    expect(withCommandBaseSpawnEnv(command, undefined)).toBe(command);
  });

  it("preserves lane-specific extras on the command", () => {
    // Callers pass supersets of CommandSpec (a one-shot's `stdin`, an
    // `isolateCwd` flag) and read those fields back off the result.
    const oneShot = { ...command, stdin: "prompt", isolateCwd: true };
    expect(withCommandBaseSpawnEnv(oneShot, { A: "1" })).toEqual({
      ...oneShot,
      env: { A: "1" },
    });
  });
});
