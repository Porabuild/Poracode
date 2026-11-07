import { afterEach, describe, expect, it, vi } from "vitest";

interface BuildEntryConfig {
  readonly entry?: Record<string, string>;
  readonly minify?: boolean | { readonly compress?: { readonly dropConsole?: boolean } };
}

async function loadProductionConfig(): Promise<readonly BuildEntryConfig[]> {
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  const module = (await import("../../tsdown.config")) as { default: unknown };
  return module.default as readonly BuildEntryConfig[];
}

function dropsConsole(config: BuildEntryConfig): boolean {
  return typeof config.minify === "object" && config.minify.compress?.dropConsole === true;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production host bundles keep their logs", () => {
  // These processes mirror console output into a host log file (the desktop
  // backend host and `poracode serve` write `<host root>/logs/server.log`), so
  // a build that strips console calls leaves that file permanently empty.
  for (const entryName of ["backendHost", "server", "relay"]) {
    it(`does not drop console calls from ${entryName}`, async () => {
      const configs = await loadProductionConfig();
      const config = configs.find((candidate) => candidate.entry?.[entryName] !== undefined);
      expect(config, `no build entry named ${entryName}`).toBeDefined();
      expect(config!.minify).not.toBe(false);
      expect(dropsConsole(config!)).toBe(false);
    });
  }

  it("still drops console calls from the Electron main bundle", async () => {
    const configs = await loadProductionConfig();
    const main = configs.find((candidate) => candidate.entry?.main !== undefined);
    expect(main).toBeDefined();
    expect(dropsConsole(main!)).toBe(true);
  });
});
