import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "LIGHTCODE_COMPUTER_USE_MCP_URL",
  "LIGHTCODE_COMPUTER_USE_MCP_TOKEN",
  "LIGHTCODE_CHROME_MCP_URL",
  "LIGHTCODE_CHROME_MCP_TOKEN",
] as const;

const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("sanitizedProcessEnv", () => {
  it("keeps launch-only MCP credentials out of ambient child environments", async () => {
    for (const key of ENV_KEYS) process.env[key] = `${key}-secret`;

    const { sanitizedProcessEnv } = await import("./spawnDiagnostics");

    for (const key of ENV_KEYS) {
      expect(sanitizedProcessEnv).not.toHaveProperty(key);
      expect(process.env[key]).toBe(`${key}-secret`);
    }
  });
});
