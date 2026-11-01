import path from "node:path";
import { mkdir } from "node:fs/promises";
import { Schema } from "effect";
import type { Config } from "@opencode/tui/config";

/**
 * `defaults` fill settings the user has not chosen, without being written to
 * the config file: a launch outside any project lists every project's
 * sessions (`tabs.scope: "global"`) instead of the Home project's alone.
 */
export function createTuiConfigStore(
  home: string,
  defaults: { tabsScope?: "global" | "cwd" } = {},
) {
  const configPath = path.join(home, "config", "poracode-tui.json");
  const decodeConfig = async (value: unknown) => {
    const { Config } = await import("@opencode/tui/config");
    return Schema.decodeUnknownSync(Config.Info)(value);
  };
  const read = async () => {
    const file = Bun.file(configPath);
    if (!(await file.exists())) return decodeConfig({});
    return decodeConfig(await file.json());
  };
  const withDefaults = (config: Awaited<ReturnType<typeof read>>) =>
    defaults.tabsScope && config.tabs?.scope === undefined
      ? { ...config, tabs: { ...config.tabs, scope: defaults.tabsScope } }
      : config;
  return {
    path: configPath,
    get: async () => withDefaults(await read()),
    async update(update: Parameters<Config.Interface["update"]>[0]) {
      const next = structuredClone(await read());
      update(next);
      await mkdir(path.dirname(configPath), { recursive: true });
      await Bun.write(configPath, JSON.stringify(next, null, 2) + "\n");
      return withDefaults(next);
    },
  } satisfies Config.Interface;
}
