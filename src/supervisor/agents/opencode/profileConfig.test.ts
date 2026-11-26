import { describe, expect, it } from "vitest";
import { parseOpenCodeProfileRuntime } from "./profileConfig";

const nativeLocation = { kind: "posix", path: "/repo" } as const;

describe("OpenCode profile runtime", () => {
  it("always registers the private provider and keeps a raw upstream id verbatim", async () => {
    const runtime = parseOpenCodeProfileRuntime({
      id: "work",
      driver: "opencode",
      displayName: "Work",
      config: {
        connection: "local",
        endpoint: "http://127.0.0.1:11434/v1",
        model: "openai/gpt-oss:20b",
      },
    });
    expect(runtime.model).toBe("poracode-profile/openai/gpt-oss:20b");
    const env = await runtime.env(nativeLocation);
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}");
    expect(config.model).toBe("poracode-profile/openai/gpt-oss:20b");
    expect(config.providers["poracode-profile"].models["openai/gpt-oss:20b"]).toBeDefined();
    expect(config.providers.openai).toBeUndefined();
  });

  it("keeps an arbitrary slash-containing id under the isolated provider", async () => {
    const runtime = parseOpenCodeProfileRuntime({
      id: "lab",
      driver: "opencode",
      displayName: "Lab",
      config: {
        connection: "local",
        endpoint: "http://192.168.1.20:8000/v1",
        model: "acme/rocket-7b:q4",
      },
    });
    const env = await runtime.env(nativeLocation);
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}");
    expect(config.model).toBe("poracode-profile/acme/rocket-7b:q4");
    expect(config.providers["poracode-profile"].models["acme/rocket-7b:q4"]).toBeDefined();
  });

  it("sends the exact context alias and advertises its Ollama window", async () => {
    const alias = "poracode-ctx-65536-0123456789ab-0123456789abcdef";
    const runtime = parseOpenCodeProfileRuntime({
      id: "work",
      driver: "opencode",
      displayName: "Work",
      config: {
        connection: "local",
        endpoint: "http://127.0.0.1:11434/v1",
        model: alias,
        baseModel: "inkling-2-mini:latest",
        contextLength: 65536,
      },
    });
    expect(runtime.model).toBe(`poracode-profile/${alias}`);
    const env = await runtime.env(nativeLocation);
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}");
    expect(config.model).toBe(`poracode-profile/${alias}`);
    expect(config.providers["poracode-profile"].models[alias]).toEqual({
      name: "Work",
      limit: { context: 65536 },
    });
  });

  it("accepts a custom exact context count and keeps an old preset reading unchanged", async () => {
    for (const context of [65536, 88000]) {
      const alias = `poracode-ctx-${context}-0123456789ab-0123456789abcdef`;
      const runtime = parseOpenCodeProfileRuntime({
        id: `work-${context}`,
        driver: "opencode",
        displayName: "Work",
        config: {
          connection: "local",
          endpoint: "http://127.0.0.1:11434/v1",
          model: alias,
          baseModel: "inkling-2-mini:latest",
          contextLength: context,
        },
      });
      const env = await runtime.env(nativeLocation);
      const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}");
      expect(config.providers["poracode-profile"].models[alias].limit.context).toBe(context);
    }
  });

  it("uses a user-owned config dir and collision-safe per-profile database name", async () => {
    const first = parseOpenCodeProfileRuntime({
      id: "a.b",
      driver: "opencode",
      displayName: "A dot",
      config: { connection: "local", endpoint: "http://127.0.0.1:11434/v1", model: "m" },
    });
    const second = parseOpenCodeProfileRuntime({
      id: "a:b",
      driver: "opencode",
      displayName: "A colon",
      config: { connection: "local", endpoint: "http://127.0.0.1:11434/v1", model: "m" },
    });
    const firstEnv = await first.env(nativeLocation);
    const secondEnv = await second.env(nativeLocation);
    expect(firstEnv.OPENCODE_CONFIG_DIR).toContain(".poracode/opencode-profiles/");
    expect(firstEnv.OPENCODE_CONFIG_DIR).not.toContain("/tmp/");
    expect(firstEnv.OPENCODE_CONFIG_DIR).not.toBe(secondEnv.OPENCODE_CONFIG_DIR);
    expect(firstEnv.OPENCODE_DB).toContain("opencode-profile-");
    expect(firstEnv.OPENCODE_DB).toContain("a.b.db");
    expect(secondEnv.OPENCODE_DB).toContain("a%3Ab.db");
    expect(firstEnv.OPENCODE_DB).not.toBe(secondEnv.OPENCODE_DB);
    expect(first.key).not.toBe(second.key);
  });

  it("namespaces the config dir and DB by the authoritative host data root", async () => {
    const previous = process.env.PORACODE_DATA_DIR;
    try {
      const instance = {
        id: "work",
        driver: "opencode",
        displayName: "Work",
        config: {
          connection: "local" as const,
          endpoint: "http://127.0.0.1:11434/v1",
          model: "m",
        },
      };
      process.env.PORACODE_DATA_DIR = "/hosts/desktop/.poracode";
      const desktopEnv = await parseOpenCodeProfileRuntime(instance).env(nativeLocation);
      process.env.PORACODE_DATA_DIR = "/hosts/isolated/.poracode";
      const isolatedEnv = await parseOpenCodeProfileRuntime(instance).env(nativeLocation);
      expect(desktopEnv.OPENCODE_CONFIG_DIR).not.toBe(isolatedEnv.OPENCODE_CONFIG_DIR);
      expect(desktopEnv.OPENCODE_DB).not.toBe(isolatedEnv.OPENCODE_DB);
    } finally {
      if (previous === undefined) delete process.env.PORACODE_DATA_DIR;
      else process.env.PORACODE_DATA_DIR = previous;
    }
  });

  it("rejects a profile without a model or with a URL carrying credentials", () => {
    expect(() =>
      parseOpenCodeProfileRuntime({
        id: "bad",
        driver: "opencode",
        config: {
          connection: "local",
          endpoint: "http://user:pass@127.0.0.1:11434/v1",
          model: "m",
        },
      }),
    ).toThrow(/URL|Too small|invalid/i);
    expect(() =>
      parseOpenCodeProfileRuntime({
        id: "bad",
        driver: "opencode",
        config: { connection: "local", endpoint: "http://127.0.0.1:11434/v1", model: "   " },
      }),
    ).toThrow(/URL|Too small|invalid/i);
  });
});
