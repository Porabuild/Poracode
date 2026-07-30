import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { McpServer, ProjectLocation, ThreadConfig } from "@/shared/contracts";
import type { OscNotification, OscTitle } from "@/shared/osc";
import { createKnownSessionRef } from "../base";
import { grokDetectionSpec } from "./detection";
import { createGrokAdapter, createGrokProfileAdapter } from "./index";

describe("createGrokProfileAdapter", () => {
  const location: ProjectLocation = { kind: "posix", path: "/repo" };

  it("routes terminal, ACP, logout, one-shot, sessions, and skills through GROK_HOME", async () => {
    const adapter = createGrokProfileAdapter({
      id: "work",
      driver: "grok",
      displayName: "Work",
      config: { homeDir: "/profiles/grok" },
      environment: {
        XAI_API_KEY: { value: "profile-key", sensitive: true },
        GROK_HOME: { value: "/ignored" },
      },
    });

    expect(adapter.kind).toBe("grok:work");
    expect(adapter.label).toBe("Grok Build Work");
    expect(adapter.skillSupport?.roots[0]?.globalBasePath).toBe("/profiles/grok");
    expect(adapter.buildLaunchArgv(location, { model: "grok-4.5" }, "hello").env).toMatchObject({
      GROK_HOME: "/profiles/grok",
      GROK_API_KEY: "",
      XAI_API_KEY: "profile-key",
    });
    expect(
      adapter.buildOneShotCommand?.("grok-4.5", undefined, "title", location)?.env,
    ).toMatchObject({ GROK_HOME: "/profiles/grok" });

    const nativeAuth = await adapter.buildAcpAuthCommand?.({ envKind: "posix" });
    expect(nativeAuth?.env).toMatchObject({
      GROK_HOME: "/profiles/grok",
      GROK_API_KEY: "",
      XAI_API_KEY: "profile-key",
    });

    const auth = await adapter.buildAcpAuthCommand?.({ envKind: "wsl", wslDistro: "Ubuntu" });
    const logout = await adapter.buildAcpLogoutCommand?.({ envKind: "wsl", wslDistro: "Ubuntu" });
    const authScript = auth?.args.join(" ") ?? "";
    expect(authScript).toContain("export GROK_HOME='/profiles/grok'");
    expect(authScript).toContain("export GROK_API_KEY=''");
    expect(authScript).toContain("export XAI_API_KEY='profile-key'");
    expect(logout?.args.join(" ")).toContain("GROK_HOME='/profiles/grok'");
    expect(
      createGrokAdapter().buildOneShotCommand?.("grok-4.5", undefined, "title", location)?.env,
    ).toBeUndefined();
  });

  it("resolves a relative profile home against the target user home", () => {
    const adapter = createGrokProfileAdapter({
      id: "relative",
      driver: "grok",
      config: { homeDir: "profiles/grok" },
    });

    expect(adapter.buildLaunchArgv(location, { model: "grok-4.5" }, "hello").env?.GROK_HOME).toBe(
      join(homedir(), "profiles/grok"),
    );
  });
});

function oscTitle(text: string, code: 0 | 1 | 2 = 0): OscTitle {
  return { code, text };
}

function oscNotify(body: string, code: 9 | 99 | 777 = 9): OscNotification {
  return { code, title: "", body, payload: undefined };
}

// Observed live from grok PTY captures (0.1.218, re-verified on 0.2.93 —
// idle title is still plain "grok"):
//   OSC 0 "grok"                       (idle, frequent)
//   OSC 0 "⠴ - Waiting - grok"         (working, braille frames ⠴ / ⠦)
//   OSC 9 "4;0;0"                      (iTerm2 progress: clear → idle)
// No OSC 777 / 99 / 133 / 633 / 1337 emitted in the same run.
describe("createGrokAdapter handleOscTitle", () => {
  const adapter = createGrokAdapter();

  it("maps Grok's '⠴/⠦ - Waiting - grok' braille spinner to working", () => {
    for (const glyph of ["⠴", "⠦"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} - Waiting - grok`))).toEqual({
        status: "working",
        attention: "working",
        corroborated: true,
      });
    }
  });

  it("accepts any braille glyph in the U+2800–U+28FF range", () => {
    for (const glyph of ["⠀", "⠁", "⣾", "⣿"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} task`))?.status).toBe("working");
    }
  });

  it("returns null for Grok's idle title (plain 'grok')", () => {
    expect(adapter.handleOscTitle?.(oscTitle("grok"))).toBeNull();
  });

  it("returns null when the braille glyph is not at the start of the title", () => {
    expect(adapter.handleOscTitle?.(oscTitle("grok ⠴"))).toBeNull();
  });
});

describe("createGrokAdapter handleOscNotification (iTerm2 OSC 9;4 progress)", () => {
  const adapter = createGrokAdapter();

  it("maps state 0 (remove progress) to idle — Grok's observed turn-end signal", () => {
    for (const body of ["4;0", "4;0;", "4;0;0"]) {
      expect(adapter.handleOscNotification?.(oscNotify(body))).toEqual({
        status: "idle",
        attention: "none",
        corroborated: true,
      });
    }
  });

  it("maps state 1 / 3 to working", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;1;42"))?.status).toBe("working");
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0"))?.status).toBe("working");
  });

  it("ignores OSC 9 bodies outside the 9;4 progress sub-protocol", () => {
    expect(adapter.handleOscNotification?.(oscNotify("Hello from some other agent"))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify(""))).toBeNull();
  });

  it("ignores OSC 777 / OSC 99 — Grok only emits iTerm2 OSC 9", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;0", 777))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0", 99))).toBeNull();
  });
});

describe("createGrokAdapter OSC plumbing", () => {
  it("keeps OSC parsing active alongside the L1 hook plugin", () => {
    const adapter = createGrokAdapter();
    expect(adapter.oscHintsDeferToHookPlugin).toBeUndefined();
  });
});

describe("grokDetectionSpec", () => {
  it("uses device auth for WSL login to avoid localhost callback nonce mismatches", () => {
    expect(typeof grokDetectionSpec.loginCommand).toBe("function");
    const loginCommand =
      typeof grokDetectionSpec.loginCommand === "function"
        ? grokDetectionSpec.loginCommand({
            location: {
              kind: "wsl",
              distro: "Ubuntu",
              linuxPath: "/home/demo/project",
              uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
            },
            executablePath: "grok",
          })
        : grokDetectionSpec.loginCommand;

    expect(loginCommand).toBe("grok login --device-auth");
  });

  it("keeps normal OAuth login for native Windows", () => {
    const loginCommand =
      typeof grokDetectionSpec.loginCommand === "function"
        ? grokDetectionSpec.loginCommand({
            location: { kind: "windows", path: "C:\\repo" },
            executablePath: "grok",
          })
        : grokDetectionSpec.loginCommand;

    expect(loginCommand).toBe("grok login");
  });
});

describe("createGrokAdapter buildLaunchArgv / buildResumeArgv session flags", () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SESSION_ID = "11111111-2222-4333-8444-555555555555";
  const config = { model: "grok-4.5", mode: "agent" } as ThreadConfig;
  let grokHome: string;
  let projectDir: string;
  let location: ProjectLocation;
  let previousGrokHome: string | undefined;

  beforeEach(() => {
    grokHome = mkdtempSync(join(tmpdir(), "grok-home-"));
    projectDir = join(tmpdir(), "grok-proj");
    previousGrokHome = process.env["GROK_HOME"];
    process.env["GROK_HOME"] = grokHome;
    location = { kind: "windows", path: projectDir } as ProjectLocation;
  });

  afterEach(() => {
    if (previousGrokHome === undefined) delete process.env["GROK_HOME"];
    else process.env["GROK_HOME"] = previousGrokHome;
    rmSync(grokHome, { recursive: true, force: true });
  });

  it("pre-assigns a fresh UUID with -s and returns it as the session ref", () => {
    const adapter = createGrokAdapter();
    const result = adapter.buildLaunchArgv(location, config, "", undefined, {});
    expect(result.args[0]).toBe("-s");
    expect(result.args[1]).toMatch(UUID_RE);
    expect(result.sessionRef?.providerSessionId).toBe(result.args[1]);
  });

  it("resumes a known id with -r when the session dir has materialized", () => {
    mkdirSync(join(grokHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
      recursive: true,
    });
    const adapter = createGrokAdapter();
    const result = adapter.buildLaunchArgv(
      location,
      config,
      "",
      createKnownSessionRef(SESSION_ID),
      {},
    );
    expect(result.args.slice(0, 2)).toEqual(["-r", SESSION_ID]);
    expect(result.sessionRef?.providerSessionId).toBe(SESSION_ID);
  });

  it("re-assigns a known id with -s when the session never materialized", () => {
    const adapter = createGrokAdapter();
    const result = adapter.buildLaunchArgv(
      location,
      config,
      "",
      createKnownSessionRef(SESSION_ID),
      {},
    );
    expect(result.args.slice(0, 2)).toEqual(["-s", SESSION_ID]);
    expect(result.sessionRef?.providerSessionId).toBe(SESSION_ID);
  });

  it("buildResumeArgv applies the same materialization fallback", () => {
    const adapter = createGrokAdapter();
    const fresh = adapter.buildResumeArgv(location, config, "", createKnownSessionRef(SESSION_ID));
    expect(fresh.args.slice(0, 2)).toEqual(["-s", SESSION_ID]);

    mkdirSync(join(grokHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
      recursive: true,
    });
    const materialized = adapter.buildResumeArgv(
      location,
      config,
      "",
      createKnownSessionRef(SESSION_ID),
    );
    expect(materialized.args.slice(0, 2)).toEqual(["-r", SESSION_ID]);
  });

  it("does not project custom MCP servers into Grok's global config", () => {
    const server = {
      id: "vercel",
      name: "Vercel",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "http", url: "https://mcp.vercel.com", headers: {} },
    } satisfies McpServer;
    const adapter = createGrokAdapter();
    adapter.buildLaunchArgv(location, config, "", undefined, {
      mcpServers: [server],
    });
    adapter.buildResumeArgv(location, config, "", createKnownSessionRef(SESSION_ID), {
      mcpServers: [server],
    });

    expect(existsSync(join(grokHome, "config.toml"))).toBe(false);
    expect(existsSync(join(grokHome, ".poracode-managed-mcp.json"))).toBe(false);
  });
});

describe("createGrokAdapter L1 hook plugin support", () => {
  it("declares poracode-status@grok with protocol version 1", () => {
    const adapter = createGrokAdapter();
    expect(adapter.pluginId).toBe("poracode-status@grok");
    expect(adapter.minProtocolVersion).toBe(1);
    expect(typeof adapter.pluginVersion).toBe("string");
    expect(adapter.pluginVersion?.length ?? 0).toBeGreaterThan(0);
  });

  it("returns no extra args/env from pluginLaunchExtras (auto-loaded global hooks)", async () => {
    const adapter = createGrokAdapter();
    const extras = await adapter.pluginLaunchExtras?.({ envKind: "posix" });
    expect(extras).toEqual({});
    expect(extras?.args).toBeUndefined();
    expect(extras?.env).toBeUndefined();
  });
});
