import { describe, expect, it, vi } from "vitest";

// Logout command tests only assert argv wrapping; skip WSL PATH probes that
// hang when the full suite spawns many wsl.exe processes in parallel.
vi.mock("../binaryResolver", () => ({
  resolveAgentBinaryPath: () => undefined,
}));

vi.mock("../base/processRuntime", async (importActual) => {
  const actual = await importActual<typeof import("../base/processRuntime")>();
  return {
    ...actual,
    resolveWslShellPath: () => "/bin/bash",
  };
});
import {
  buildCursorTerminalAuthMethod,
  isCursorSemverSupportedForHooks,
  parseCursorAboutOutput,
  parseCursorLogoutHelpOutput,
  parseCursorVersionLine,
  parseCursorWhoamiOutput,
} from "./detection";
import {
  buildCursorAcpModelPickerCapabilities,
  buildCursorModelPickerCapabilities,
  buildCursorProbeSpec,
  createCursorAdapter,
  createCursorProfileAdapter,
  detectCursorTerminalStatus,
  rewriteCursorLoadSessionError,
  sortCursorModels,
} from "./index";
import { buildCursorArgs } from "./argv";
import { CursorSdkSession } from "./sdkSession";

function decodePowerShellEncodedCommand(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf16le");
}

function parseWindowsSpec(spec: { args: string[] }): { cmd: string; cmdArgs: string[] } {
  if (spec.args[0] === "-NoLogo") {
    const script = decodePowerShellEncodedCommand(spec.args[3]!);
    const cmd = script.match(/\$cmd = '((?:[^']|'')*)'/)?.[1]?.replaceAll("''", "'") ?? "";
    const argsStr = script.match(/\$args = @\((.*)\)/)?.[1] ?? "";
    const cmdArgs = argsStr
      ? argsStr.split(", ").map((a) => a.replace(/^'|'$/g, "").replaceAll("''", "'"))
      : [];
    return { cmd, cmdArgs };
  }
  return { cmd: spec.args[3]!, cmdArgs: spec.args.slice(4) };
}

describe("createCursorAdapter capabilities", () => {
  it("exposes non-empty approvalPolicies for the YOLO toggle", () => {
    const adapter = createCursorAdapter();
    expect(adapter.capabilities.approvalPolicies.length).toBeGreaterThan(0);
    expect(adapter.capabilities.approvalPolicies.some((p) => p.id === "never")).toBe(true);
    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(adapter.createStructuredSession).toBeTypeOf("function");
  });

  it("creates a profile adapter whose key applies to every process lane", () => {
    const adapter = createCursorProfileAdapter({
      id: "work",
      driver: "cursor",
      displayName: "Work",
      environment: { CURSOR_API_KEY: { value: "profile-key", sensitive: true } },
    });

    expect(adapter.kind).toBe("cursor:work");
    expect(adapter.label).toBe("Cursor Work");
    expect(adapter.baseSpawnEnv).toEqual({ CURSOR_API_KEY: "profile-key" });
  });

  it("defaults new Cursor profile GUI sessions to the SDK runtime", async () => {
    const adapter = createCursorProfileAdapter({
      id: "work",
      driver: "cursor",
      environment: { CURSOR_API_KEY: { value: "profile-key", sensitive: true } },
    });

    const session = await adapter.createStructuredSession?.({
      threadId: "thread-1",
      projectLocation: { kind: "posix", path: "/repo" },
      config: { model: "composer-2.5" },
      presentationMode: "gui",
      ...(adapter.baseSpawnEnv ? { baseSpawnEnv: adapter.baseSpawnEnv } : {}),
    });

    expect(session).toBeInstanceOf(CursorSdkSession);
  });

  it("rejects a profile without its own API key", () => {
    expect(() =>
      createCursorProfileAdapter({ id: "work", driver: "cursor", displayName: "Work" }),
    ).toThrow("Cursor profiles require a CURSOR_API_KEY");
  });

  it("does not pass SDK-local session ids to cursor-agent context extraction", () => {
    const adapter = createCursorAdapter();
    const location = { kind: "posix" as const, path: "/repo" };
    expect(
      adapter.buildContextExtractionCommand?.(
        {
          providerSessionId: "sdk:agent-123",
          discoveredAt: "2026-07-27T00:00:00.000Z",
        },
        location,
      ),
    ).toBeUndefined();
    expect(
      adapter.buildContextExtractionCommand?.(
        {
          providerSessionId: "cli-chat-123",
          discoveredAt: "2026-07-27T00:00:00.000Z",
        },
        location,
      )?.args,
    ).toContain("--resume=cli-chat-123");
  });
});

describe("rewriteCursorLoadSessionError", () => {
  it("returns the Cursor-specific 'resume not supported' copy", () => {
    const raw = new Error("Invalid params");
    const out = rewriteCursorLoadSessionError(raw, "ses-1");
    expect(out.message).toBe(
      "Cursor's ACP integration doesn't currently support resuming chat sessions. Start a new thread to continue.",
    );
    expect((out as { cause?: unknown }).cause).toBe(raw);
  });
});

describe("detectCursorTerminalStatus", () => {
  it("detects working from ctrl+c to stop", () => {
    expect(
      detectCursorTerminalStatus("○ Generating.\n→ Add a follow-up                ctrl+c to stop"),
    ).toEqual({ status: "working", attention: "working", corroborated: true });
  });

  it("detects working from Generating", () => {
    expect(detectCursorTerminalStatus("Generating...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects working from Reading", () => {
    expect(detectCursorTerminalStatus("Reading files...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects working from Thinking", () => {
    expect(detectCursorTerminalStatus("Thinking...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects attention from Run this command?", () => {
    expect(
      detectCursorTerminalStatus(
        "Run this command?\nNot in allowlist: git status\n  → Run (once) (y)",
      ),
    ).toEqual({ status: "needs_approval", attention: "needs_approval", corroborated: true });
  });

  it("detects attention from Suggested Plan", () => {
    expect(detectCursorTerminalStatus("Suggested Plan\n→ Accept (y)")).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("detects attention from Waiting for approval", () => {
    expect(detectCursorTerminalStatus("Waiting for approval...")).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("detects idle from Add a follow-up without working indicators", () => {
    expect(detectCursorTerminalStatus("→ Add a follow-up\n/ commands · @ files")).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("returns null for unrecognized output", () => {
    expect(detectCursorTerminalStatus("some random text")).toBeNull();
  });
});

describe("isReadyForInitialPrompt", () => {
  it("fires when idle prompt is present without working indicators", () => {
    const adapter = createCursorAdapter();
    expect(adapter.isReadyForInitialPrompt?.("→ Add a follow-up\n/ commands")).toBe(true);
  });

  it("does not fire during working state", () => {
    const adapter = createCursorAdapter();
    expect(
      adapter.isReadyForInitialPrompt?.(
        "Generating.\n→ Add a follow-up                ctrl+c to stop",
      ),
    ).toBe(false);
  });
});

describe("sortCursorModels", () => {
  it("auto first, then Composer, then others by version descending", () => {
    const models = [
      { id: "auto", label: "Auto" },
      { id: "gpt-5.4-fast", label: "GPT-5.4 Fast" },
      { id: "composer-2-fast", label: "Composer 2 Fast" },
      { id: "composer-2", label: "Composer 2" },
      { id: "composer-1.5", label: "Composer 1.5" },
      { id: "gpt-5.1-high", label: "GPT-5.1 High" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "Auto",
      "Composer 2 Fast",
      "Composer 2",
      "Composer 1.5",
      "GPT-5.4 Fast",
      "GPT-5.1 High",
    ]);
  });

  it("sorts effort: Extra High > High > Medium/base > Low > None", () => {
    const models = [
      { id: "a", label: "GPT-5.4 Mini" },
      { id: "b", label: "GPT-5.4 Mini Low" },
      { id: "c", label: "GPT-5.4 Mini High" },
      { id: "d", label: "GPT-5.4 Mini Extra High" },
      { id: "e", label: "GPT-5.4 Mini None" },
      { id: "f", label: "GPT-5.4 Mini Medium" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "GPT-5.4 Mini Extra High",
      "GPT-5.4 Mini High",
      "GPT-5.4 Mini Medium", // was "GPT-5.4 Mini" — bare label gets "Medium"
      "GPT-5.4 Mini Medium",
      "GPT-5.4 Mini Low",
      "GPT-5.4 Mini None",
    ]);
  });

  it("1M ranks above non-1M, fast first within same tier, bare labels get Medium", () => {
    const models = [
      { id: "a", label: "GPT-5.4 High Fast" },
      { id: "b", label: "GPT-5.4 1M High" },
      { id: "c", label: "GPT-5.4 Fast" },
      { id: "d", label: "GPT-5.4 1M" },
      { id: "e", label: "GPT-5.4 1M Extra High" },
      { id: "f", label: "GPT-5.4 Extra High Fast" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "GPT-5.4 1M Extra High",
      "GPT-5.4 1M High",
      "GPT-5.4 1M Medium", // was "GPT-5.4 1M"
      "GPT-5.4 Extra High Fast",
      "GPT-5.4 High Fast",
      "GPT-5.4 Medium Fast", // was "GPT-5.4 Fast"
    ]);
  });

  it("Thinking ranks above non-Thinking", () => {
    const models = [
      { id: "a", label: "Sonnet 4" },
      { id: "b", label: "Sonnet 4 1M" },
      { id: "c", label: "Sonnet 4 Thinking" },
      { id: "d", label: "Sonnet 4 1M Thinking" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "Sonnet 4 1M Thinking",
      "Sonnet 4 Thinking",
      "Sonnet 4 1M",
      "Sonnet 4",
    ]);
  });

  it("groups by provider: Opus together, Max above non-Max, Grok not interleaved", () => {
    const models = [
      { id: "a", label: "Opus 4.6 1M Thinking" },
      { id: "b", label: "Opus 4.6 1M" },
      { id: "c", label: "Sonnet 4.6 1M Thinking" },
      { id: "d", label: "Sonnet 4.6 1M" },
      { id: "e", label: "Opus 4.6 1M Max Thinking" },
      { id: "f", label: "Opus 4.6 1M Max" },
      { id: "g", label: "Opus 4.5 Thinking" },
      { id: "h", label: "Opus 4.5" },
      { id: "i", label: "Grok 4.20 Thinking" },
      { id: "j", label: "Grok 4.20" },
      { id: "k", label: "Sonnet 4.5 1M Thinking" },
      { id: "l", label: "Sonnet 4.5 1M" },
      { id: "m", label: "Sonnet 4 Thinking" },
      { id: "n", label: "Sonnet 4" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      // Opus provider (max ver 4.6) — all together
      "Opus 4.6 1M Max Thinking",
      "Opus 4.6 1M Max",
      "Opus 4.6 1M Thinking",
      "Opus 4.6 1M",
      "Opus 4.5 Thinking",
      "Opus 4.5",
      // Sonnet provider (max ver 4.6) — all together
      "Sonnet 4.6 1M Thinking",
      "Sonnet 4.6 1M",
      "Sonnet 4.5 1M Thinking",
      "Sonnet 4.5 1M",
      "Sonnet 4 Thinking",
      "Sonnet 4",
      // Grok provider (max ver 4.20) — not interleaved
      "Grok 4.20 Thinking",
      "Grok 4.20",
    ]);
  });

  it("sorts Codex Max with fast variants correctly", () => {
    const models = [
      { id: "a", label: "GPT-5.1 Codex Max Medium Fast" },
      { id: "b", label: "GPT-5.1 Codex Max High Fast" },
      { id: "c", label: "GPT-5.1 Codex Max Extra High Fast" },
      { id: "d", label: "GPT-5.1 Codex Max Low" },
      { id: "e", label: "GPT-5.1 Codex Max" },
      { id: "f", label: "GPT-5.1 Codex Max High" },
      { id: "g", label: "GPT-5.1 Codex Max Extra High" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "GPT-5.1 Codex Max Extra High Fast",
      "GPT-5.1 Codex Max Extra High",
      "GPT-5.1 Codex Max High Fast",
      "GPT-5.1 Codex Max High",
      "GPT-5.1 Codex Max Medium Fast",
      "GPT-5.1 Codex Max Medium", // was "GPT-5.1 Codex Max"
      "GPT-5.1 Codex Max Low",
    ]);
  });
});

describe("buildCursorModelPickerCapabilities", () => {
  it("collapses fast and 1M variants into base models plus capability controls", () => {
    const capabilities = buildCursorModelPickerCapabilities([
      { id: "auto", label: "Auto" },
      { id: "composer-2-fast", label: "Composer 2 Fast" },
      { id: "composer-2", label: "Composer 2" },
      { id: "gpt-5.5-high", label: "GPT-5.5 1M High" },
      { id: "gpt-5.5-high-fast", label: "GPT-5.5 High Fast" },
    ]);

    expect(capabilities.models).toEqual([
      { id: "auto", label: "Auto" },
      { id: "composer-2", label: "Composer 2" },
      { id: "gpt-5.5", label: "GPT-5.5" },
    ]);
    expect(capabilities.efforts).toEqual(["high"]);
    expect(capabilities.modelEfforts).toMatchObject({
      auto: [],
      "composer-2": [],
      "gpt-5.5": ["high"],
    });
    expect(capabilities.contextSizes).toEqual([
      { id: "272k", label: "272K" },
      { id: "1m", label: "1M" },
    ]);
    expect(capabilities.modelContextSizes).toMatchObject({
      "gpt-5.5": ["272k", "1m"],
    });
    expect(capabilities.fastModels).toEqual(["composer-2", "gpt-5.5"]);
    expect(capabilities.defaultHiddenModels).toEqual(["composer-2", "gpt-5.5"]);
  });

  it("does not expose a context selector for Cursor models without 1M variants", () => {
    const capabilities = buildCursorModelPickerCapabilities([
      { id: "gpt-5.2", label: "GPT-5.2" },
      { id: "kimi-k2.5", label: "Kimi K2.5" },
    ]);

    // `contextSizes` stays undefined so the composer's filter yields no picker
    // entries; the per-model map still gets populated for concrete defaults
    // (gpt-5.2 → 272k) so the model row can render a muted "272K" description.
    // Models that resolve to the abstract "default" id (kimi-k2.5) get no entry.
    expect(capabilities.contextSizes).toBeUndefined();
    expect(capabilities.modelContextSizes).toEqual({ "gpt-5.2": ["272k"] });
    expect(capabilities.defaultHiddenModels).toEqual(["gpt-5.2"]);
  });

  it("keeps Codex Max as part of the base model name", () => {
    const capabilities = buildCursorModelPickerCapabilities([
      { id: "gpt-5.1-codex-max-low", label: "Codex 5.1 Max Low" },
      { id: "gpt-5.1-codex-max-medium", label: "Codex 5.1 Max" },
      { id: "gpt-5.1-codex-max-high", label: "Codex 5.1 Max High" },
      { id: "gpt-5.1-codex-max-xhigh", label: "Codex 5.1 Max Extra High" },
    ]);

    expect(capabilities.models).toEqual([{ id: "gpt-5.1-codex-max", label: "Codex 5.1 Max" }]);
    expect(capabilities.modelEfforts).toMatchObject({
      "gpt-5.1-codex-max": ["low", "medium", "high", "xhigh"],
    });
  });

  it("extracts Cursor max and thinking variants into effort and option capabilities", () => {
    const capabilities = buildCursorModelPickerCapabilities([
      { id: "claude-opus-4-7-high", label: "Opus 4.7 1M High" },
      { id: "claude-opus-4-7-thinking-high", label: "Opus 4.7 1M High Thinking" },
      { id: "claude-opus-4-7-max", label: "Opus 4.7 1M Max" },
      { id: "claude-opus-4-7-thinking-max", label: "Opus 4.7 1M Max Thinking" },
    ]);

    expect(capabilities.models).toEqual([{ id: "claude-opus-4-7", label: "Opus 4.7" }]);
    expect(capabilities.modelEfforts).toMatchObject({
      "claude-opus-4-7": ["high", "max"],
    });
    expect(capabilities.contextSizes).toEqual([
      { id: "300k", label: "300K" },
      { id: "1m", label: "1M" },
    ]);
    expect(capabilities.modelContextSizes).toMatchObject({
      "claude-opus-4-7": ["300k", "1m"],
    });
    expect(capabilities.thinkingModels).toEqual(["claude-opus-4-7"]);
    expect(capabilities.defaultHiddenModels).toBeUndefined();
  });

  it("uses 200K/1M context choices for non-4.7 Claude families with 1M variants", () => {
    const capabilities = buildCursorModelPickerCapabilities([
      { id: "claude-4.6-sonnet-medium", label: "Sonnet 4.6 1M" },
      { id: "claude-4.6-sonnet-medium-thinking", label: "Sonnet 4.6 1M Thinking" },
    ]);

    expect(capabilities.contextSizes).toEqual([
      { id: "200k", label: "200K" },
      { id: "1m", label: "1M" },
    ]);
    expect(capabilities.modelContextSizes).toMatchObject({
      "claude-4.6-sonnet": ["200k", "1m"],
    });
    expect(capabilities.thinkingModels).toEqual(["claude-4.6-sonnet"]);
    expect(capabilities.defaultHiddenModels).toBeUndefined();
  });
});

describe("buildCursorAcpModelPickerCapabilities", () => {
  it("keeps exact ACP values and folds default parameters into labels", () => {
    const capabilities = buildCursorAcpModelPickerCapabilities([
      { id: "default[]", label: "Auto" },
      { id: "composer-2[fast=true]", label: "composer-2" },
      {
        id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
        label: "gpt-5.5",
      },
      {
        id: "gpt-5.1-codex-max[reasoning=medium,fast=false]",
        label: "gpt-5.1-codex-max",
      },
      {
        id: "claude-opus-4-7[thinking=true,context=300k,effort=xhigh]",
        label: "claude-opus-4-7",
      },
      {
        id: "claude-sonnet-4[thinking=false,context=200k]",
        label: "claude-sonnet-4",
      },
    ]);

    expect(capabilities.models).toEqual([
      { id: "default[]", label: "Auto" },
      { id: "composer-2[fast=true]", label: "Composer 2 · Fast" },
      {
        id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
        label: "GPT-5.5 · 272K · Medium",
      },
      {
        id: "gpt-5.1-codex-max[reasoning=medium,fast=false]",
        label: "Codex 5.1 Max · Medium",
      },
      {
        id: "claude-opus-4-7[thinking=true,context=300k,effort=xhigh]",
        label: "Opus 4.7 · 300K · Extra High",
      },
      {
        id: "claude-sonnet-4[thinking=false,context=200k]",
        label: "Sonnet 4 · 200K",
      },
    ]);
    expect(capabilities.efforts).toEqual([]);
    expect(capabilities.modelEfforts).toMatchObject({
      "gpt-5.5[context=272k,reasoning=medium,fast=false]": [],
    });
    expect(capabilities.defaultHiddenModels).toEqual([
      "composer-2[fast=true]",
      "gpt-5.5[context=272k,reasoning=medium,fast=false]",
      "gpt-5.1-codex-max[reasoning=medium,fast=false]",
      "claude-opus-4-7[thinking=true,context=300k,effort=xhigh]",
      "claude-sonnet-4[thinking=false,context=200k]",
    ]);
  });
});

describe("buildCursorArgs", () => {
  it("composes Cursor fast model ids at the CLI boundary", () => {
    expect(buildCursorArgs({ model: "composer-2", fast: true }, "", undefined)).toContain(
      "composer-2-fast",
    );
  });

  it("composes Cursor effort and fast model ids at the CLI boundary", () => {
    expect(
      buildCursorArgs({ model: "gpt-5.4", effort: "high", fast: true }, "", undefined),
    ).toContain("gpt-5.4-high-fast");
    expect(buildCursorArgs({ model: "gpt-5.5", effort: "xhigh" }, "", undefined)).toContain(
      "gpt-5.5-extra-high",
    );
    expect(
      buildCursorArgs({ model: "claude-opus-4-7", effort: "high", thinking: true }, "", undefined),
    ).toContain("claude-opus-4-7-thinking-high");
  });
});

describe("parseCursorVersionLine", () => {
  it("extracts semver from common cursor-agent --version output shapes", () => {
    expect(parseCursorVersionLine("1.7.0")).toEqual([1, 7, 0]);
    expect(parseCursorVersionLine("cursor-agent 1.7.2")).toEqual([1, 7, 2]);
    expect(parseCursorVersionLine("Cursor CLI v2.0.10\n")).toEqual([2, 0, 10]);
    expect(parseCursorVersionLine("[32m1.8.3[0m")).toEqual([1, 8, 3]);
  });

  it("returns null for unparseable output", () => {
    expect(parseCursorVersionLine("")).toBeNull();
    expect(parseCursorVersionLine("not a version")).toBeNull();
    expect(parseCursorVersionLine("v1.7")).toBeNull();
  });
});

describe("isCursorSemverSupportedForHooks", () => {
  it("requires >= 1.7.0", () => {
    expect(isCursorSemverSupportedForHooks([1, 7, 0])).toBe(true);
    expect(isCursorSemverSupportedForHooks([1, 7, 5])).toBe(true);
    expect(isCursorSemverSupportedForHooks([2, 0, 0])).toBe(true);
    expect(isCursorSemverSupportedForHooks([1, 6, 999])).toBe(false);
    expect(isCursorSemverSupportedForHooks([0, 99, 99])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCursorSemverSupportedForHooks(null)).toBe(false);
  });
});

describe("buildCursorProbeSpec", () => {
  it.skipIf(process.platform !== "win32")(
    "falls back to the wrapped command path when the installer entrypoint is unavailable",
    () => {
      const spec = buildCursorProbeSpec(
        "C:\\Users\\demo\\AppData\\Local\\cursor-agent\\cursor-agent.cmd",
        ["--list-models"],
        "C:\\Users\\demo\\project",
      );

      expect(spec.cwd).toBe("C:\\Users\\demo\\project");
      const { cmd, cmdArgs } = parseWindowsSpec(spec);
      expect(cmd).toBe("C:\\Users\\demo\\AppData\\Local\\cursor-agent\\cursor-agent.cmd");
      expect(cmdArgs).toEqual(["--list-models"]);
    },
  );
});

describe("Cursor logout support", () => {
  it("detects the dedicated logout command help", () => {
    expect(
      parseCursorLogoutHelpOutput(`Usage: agent logout [options]

Sign out and clear stored authentication

Options:
  -h, --help  Display help for command`),
    ).toBe(true);
  });

  it("detects the cursor-agent logout command help", () => {
    expect(
      parseCursorLogoutHelpOutput(`Usage: cursor-agent logout [options]

Sign out of Cursor

Options:
  -h, --help  Display help for command`),
    ).toBe(true);
  });

  it("does not treat root help as logout command support", () => {
    expect(
      parseCursorLogoutHelpOutput(`Usage: agent [options] [command]

Commands:
  logout                    Sign out and clear stored authentication`),
    ).toBe(false);
  });

  it("builds a Cursor logout command through the adapter", async () => {
    const adapter = createCursorAdapter();
    const command = await adapter.buildAcpLogoutCommand?.({ envKind: "wsl", wslDistro: "Ubuntu" });

    expect(command?.command).toMatch(/wsl(?:\.exe)?$/i);
    expect(command?.args.join("\n")).toContain("logout");
  });
});

describe("Cursor terminal auth", () => {
  it("disables Cursor's WSL browser opener so Poracode can open the URL natively", () => {
    expect(
      buildCursorTerminalAuthMethod({
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
      }),
    ).toEqual({
      type: "terminal",
      id: "cursor-agent-login",
      name: "Cursor login",
      args: ["login"],
      env: { NO_OPEN_BROWSER: "1" },
    });
  });

  it("uses the plain Cursor login command outside WSL", () => {
    expect(
      buildCursorTerminalAuthMethod({ kind: "windows", path: "C:\\Users\\demo\\project" }),
    ).toEqual({
      type: "terminal",
      id: "cursor-agent-login",
      name: "Cursor login",
      args: ["login"],
    });
  });
});

describe("parseCursor account output", () => {
  it("extracts auth and email from whoami output", () => {
    expect(parseCursorWhoamiOutput("✓ Logged in as user@example.com")).toEqual({
      authState: "authenticated",
      authenticatedAs: "user@example.com",
    });
  });

  // Sibling of the Codex regression — a confirmed "not logged in" whoami must
  // map to `missing` so the composer Sign-in dock can appear without waiting
  // for a runtime auth error.
  it("reports missing when whoami says the user is not logged in", () => {
    expect(parseCursorWhoamiOutput("Not logged in")).toEqual({ authState: "missing" });
  });

  it("extracts plan and email from about output", () => {
    expect(
      parseCursorAboutOutput(`About Cursor CLI

CLI Version         2026.04.17-787b533
Model               Kimi K2.5
Subscription Tier   Pro
User Email          user@example.com`),
    ).toEqual({
      authenticatedAs: "user@example.com",
      plan: "Pro",
    });
  });
});
