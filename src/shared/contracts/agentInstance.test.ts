import { describe, expect, it } from "vitest";
import {
  ACP_GENERIC_KIND_PREFIX,
  acpGenericKind,
  agentKindsSharingBinary,
  agentInstanceConfigSchema,
  baseAgentKind,
  claudeProfileKind,
  extractAcpGenericInstanceId,
  extractClaudeProfileInstanceId,
  extractHomeProfileInstanceId,
  homeProfileKind,
  isAcpGenericKind,
  isClaudeProfileKind,
  isHomeProfileDriver,
  isHomeProfileKind,
  parseAcpGenericInstanceConfig,
  parseClaudeProfileInstanceConfig,
  parseHomeProfileInstanceConfig,
} from "./agentInstance";

/**
 * `parseAcpGenericInstanceConfig` parses user-supplied JSON from settings, so
 * its failure modes need to be predictable — bad config should throw a Zod
 * error rather than crashing later inside the supervisor at spawn time.
 */
describe("parseAcpGenericInstanceConfig", () => {
  it("applies schema defaults when optional fields are omitted", () => {
    const cfg = parseAcpGenericInstanceConfig({ binary: "my-acp" });
    expect(cfg.binary).toBe("my-acp");
    expect(cfg.cwd).toBe("project");
    expect(cfg.authMode).toBe("none");
    expect(cfg.args).toBeUndefined();
  });

  it("accepts a fully-specified config", () => {
    const cfg = parseAcpGenericInstanceConfig({
      binary: "/usr/local/bin/codex-acp",
      args: ["--stdio"],
      cwd: "fixed",
      fixedCwd: "/tmp/work",
      authMode: "envVar",
      authEnvVar: "OPENAI_API_KEY",
      capabilities: { models: ["gpt-5"], modes: ["agent"] },
    });
    expect(cfg.binary).toBe("/usr/local/bin/codex-acp");
    expect(cfg.cwd).toBe("fixed");
    expect(cfg.authEnvVar).toBe("OPENAI_API_KEY");
    expect(cfg.capabilities?.models).toEqual(["gpt-5"]);
  });

  it("throws when binary is missing", () => {
    expect(() => parseAcpGenericInstanceConfig({})).toThrow(Error);
  });

  it("throws when binary is empty", () => {
    expect(() => parseAcpGenericInstanceConfig({ binary: "" })).toThrow(Error);
  });

  it("rejects an unknown cwd discriminant", () => {
    expect(() => parseAcpGenericInstanceConfig({ binary: "x", cwd: "anywhere" })).toThrow(Error);
  });

  it("rejects an unknown authMode", () => {
    expect(() => parseAcpGenericInstanceConfig({ binary: "x", authMode: "oauth" })).toThrow(Error);
  });

  it("treats null/undefined as empty defaults instead of crashing", () => {
    // The supervisor passes the raw `instance.config` field (typed `unknown`),
    // so the parser must tolerate `undefined` and fall through to defaults
    // rather than throwing a low-level TypeError. Empty config still requires
    // `binary` though — the second call should throw with a Zod message.
    expect(() => parseAcpGenericInstanceConfig(undefined)).toThrow(Error);
    expect(() => parseAcpGenericInstanceConfig(null)).toThrow(Error);
  });
});

describe("ACP generic kind helpers", () => {
  it("round-trips instance ids through the shared kind namespace", () => {
    const kind = acpGenericKind("example-agent");

    expect(kind).toBe(`${ACP_GENERIC_KIND_PREFIX}example-agent`);
    expect(isAcpGenericKind(kind)).toBe(true);
    expect(extractAcpGenericInstanceId(kind)).toBe("example-agent");
    expect(baseAgentKind(kind)).toBe("acp-generic");
  });

  it("rejects unrelated provider kinds", () => {
    expect(isAcpGenericKind("codex")).toBe(false);
    expect(extractAcpGenericInstanceId("codex")).toBeUndefined();
  });
});

describe("Claude profile instance helpers", () => {
  it("parses a Claude profile config directory", () => {
    expect(
      parseClaudeProfileInstanceConfig({
        configDir: "~/.poracode/claude-profiles/work",
      }),
    ).toEqual({ configDir: "~/.poracode/claude-profiles/work" });
  });

  it("rejects an empty Claude profile config directory", () => {
    expect(() => parseClaudeProfileInstanceConfig({ configDir: "" })).toThrow(Error);
  });

  it("maps profile ids to synthetic Claude provider kinds", () => {
    expect(claudeProfileKind("work")).toBe("claude:work");
    expect(isClaudeProfileKind("claude:work")).toBe(true);
    expect(isClaudeProfileKind("claude")).toBe(false);
    expect(extractClaudeProfileInstanceId("claude:work")).toBe("work");
    expect(extractClaudeProfileInstanceId("codex")).toBeUndefined();
  });
});

describe("home profile instance helpers", () => {
  it("parses a provider home directory", () => {
    expect(
      parseHomeProfileInstanceConfig({
        homeDir: "~/.poracode/codex-profiles/work",
      }),
    ).toEqual({ homeDir: "~/.poracode/codex-profiles/work" });
  });

  it("rejects an empty provider home directory", () => {
    expect(() => parseHomeProfileInstanceConfig({ homeDir: "" })).toThrow(Error);
  });

  it("recognizes only providers with first-class home isolation", () => {
    expect(isHomeProfileDriver("codex")).toBe(true);
    expect(isHomeProfileDriver("copilot")).toBe(true);
    expect(isHomeProfileDriver("gemini")).toBe(true);
    expect(isHomeProfileDriver("grok")).toBe(true);
    expect(isHomeProfileDriver("claude")).toBe(false);
    expect(isHomeProfileDriver("opencode")).toBe(false);
  });

  it("round-trips profile ids through each provider namespace", () => {
    expect(homeProfileKind("codex", "work")).toBe("codex:work");
    expect(homeProfileKind("copilot", "personal")).toBe("copilot:personal");
    expect(homeProfileKind("gemini", "enterprise")).toBe("gemini:enterprise");
    expect(homeProfileKind("grok", "team")).toBe("grok:team");
    expect(isHomeProfileKind("codex:work")).toBe(true);
    expect(extractHomeProfileInstanceId("codex:work")).toBe("work");
  });

  it("rejects base and unsupported provider kinds", () => {
    expect(isHomeProfileKind("codex")).toBe(false);
    expect(isHomeProfileKind("codex:")).toBe(false);
    expect(isHomeProfileKind("claude:work")).toBe(false);
    expect(isHomeProfileKind("opencode:work")).toBe(false);
    expect(extractHomeProfileInstanceId("codex")).toBeUndefined();
  });
});

describe("agentKindsSharingBinary", () => {
  const registeredKinds = [
    "claude",
    "claude:work",
    "codex",
    "codex:work",
    "codex:personal",
    "acp-generic:custom",
  ];

  it("groups a base provider with every profile sharing its CLI", () => {
    expect(agentKindsSharingBinary("codex", registeredKinds)).toEqual([
      "codex",
      "codex:work",
      "codex:personal",
    ]);
    expect(agentKindsSharingBinary("codex:work", registeredKinds)).toEqual([
      "codex",
      "codex:work",
      "codex:personal",
    ]);
    expect(agentKindsSharingBinary("claude:work", registeredKinds)).toEqual([
      "claude",
      "claude:work",
    ]);
  });

  it("does not group unrelated colon-scoped adapters", () => {
    expect(agentKindsSharingBinary("acp-generic:custom", registeredKinds)).toEqual([
      "acp-generic:custom",
    ]);
  });
});

describe("agentInstanceConfigSchema", () => {
  it("validates a registered instance shape", () => {
    const result = agentInstanceConfigSchema.parse({
      id: "my-acp",
      driver: "acp-generic",
      displayName: "My Tool",
      enabled: true,
      environment: { API_KEY: { value: "secret", sensitive: true } },
      config: { binary: "x" },
    });
    expect(result.id).toBe("my-acp");
    expect(result.driver).toBe("acp-generic");
    expect(result.environment?.API_KEY?.sensitive).toBe(true);
  });

  it("rejects ids with invalid characters", () => {
    expect(() =>
      agentInstanceConfigSchema.parse({ id: "spaces in id", driver: "acp-generic" }),
    ).toThrow(Error);
  });

  it("accepts arbitrary driver kinds (open brand)", () => {
    // ProviderDriverKind is intentionally an open slug — third-party drivers
    // can plug in beyond the built-in set without contract changes.
    const result = agentInstanceConfigSchema.parse({
      id: "future-driver",
      driver: "some-future-driver",
    });
    expect(result.driver).toBe("some-future-driver");
  });
});
