import path from "node:path";
import { mkdir } from "node:fs/promises";
import { Schema } from "effect";
import type { Config } from "@opencode/tui/config";

export function createTuiConfigStore(home: string) {
  const configPath = path.join(home, "config", "poracode-tui.json");
  const decodeConfig = async (value: unknown) => {
    const { Config } = await import("@opencode/tui/config");
    return Schema.decodeUnknownSync(Config.Info)(value);
  };
  const get = async () => {
    const file = Bun.file(configPath);
    if (!(await file.exists())) return decodeConfig({});
    return decodeConfig(await file.json());
  };
  return {
    path: configPath,
    get,
    async update(update: Parameters<Config.Interface["update"]>[0]) {
      const next = structuredClone(await get());
      update(next);
      await mkdir(path.dirname(configPath), { recursive: true });
      await Bun.write(configPath, JSON.stringify(next, null, 2) + "\n");
      return next;
    },
  } satisfies Config.Interface;
}
