import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOpenCodeAdapter } from ".";
import { buildOpenCodeArgs } from "./argv";
import {
  attachOpenCodeProviderIds,
  humanizeOpenCodeModelId,
  mapOpenCodeSlashCommands,
  parseOpenCodeProvidersList,
  humanizeOpenCodeSubProviderId,
  parseOpenCodeVerboseModels,
} from "./detection";
import { opencodeIntentFor } from "./plugin/intentMap";
import { detectOpenCodeTerminalStatus, opencodeOscHint, opencodeOscTitleHint } from "./terminal";

describe("buildOpenCodeArgs", () => {
  it("emits no flags for a fresh launch with no model and no prompt", () => {
    expect(buildOpenCodeArgs({ model: "" }, "")).toEqual([]);
  });

  it("forwards model in provider/model form via --model", () => {
    expect(buildOpenCodeArgs({ model: "opencode/claude-haiku-4-5" }, "")).toEqual([
      "--model",
      "opencode/claude-haiku-4-5",
    ]);
  });

  it("encodes initial prompt via --prompt instead of positional", () => {
    expect(buildOpenCodeArgs({ model: "" }, "hello world")).toEqual(["--prompt", "hello world"]);
  });

  it("uses --session for resume", () => {
    expect(buildOpenCodeArgs({ model: "" }, "", "ses_abc123")).toEqual(["--session", "ses_abc123"]);
  });

  it("composes session, model, and prompt in order", () => {
    expect(
      buildOpenCodeArgs({ model: "opencode/gpt-5.4-mini" }, "continue please", "ses_abc"),
    ).toEqual([
      "--session",
      "ses_abc",
      "--model",
      "opencode/gpt-5.4-mini",
      "--prompt",
      "continue please",
    ]);
  });

  it("ignores whitespace-only prompts", () => {
    expect(buildOpenCodeArgs({ model: "" }, "   ")).toEqual([]);
  });

  it("does not forward effort/variant — opencode CLI does not accept --variant", () => {
    expect(buildOpenCodeArgs({ model: "opencode/claude-sonnet-4-6", effort: "high" }, "")).toEqual([
      "--model",
      "opencode/claude-sonnet-4-6",
    ]);
  });

  it("does not forward an empty effort either", () => {
    expect(buildOpenCodeArgs({ model: "opencode/big-pickle", effort: "" }, "")).toEqual([
      "--model",
      "opencode/big-pickle",
    ]);
  });

  it("forwards plan mode via --agent plan", () => {
    expect(buildOpenCodeArgs({ model: "opencode/big-pickle", mode: "plan" }, "")).toEqual([
      "--model",
      "opencode/big-pickle",
      "--agent",
      "plan",
    ]);
  });

  it("does not pass --agent for the default (agent) mode", () => {
    expect(buildOpenCodeArgs({ model: "opencode/big-pickle", mode: "agent" }, "")).toEqual([
      "--model",
      "opencode/big-pickle",
    ]);
  });
});

describe("parseOpenCodeVerboseModels", () => {
  it("extracts variant keys and context limit per model from --verbose output", () => {
    const sample = `opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "variants": {}
}
opencode/claude-haiku-4-5
{
  "id": "claude-haiku-4-5",
  "providerID": "opencode",
  "variants": {
    "high": { "thinking": { "type": "enabled" } },
    "max": { "thinking": { "type": "enabled" } }
  },
  "limit": { "context": 200000, "output": 8192 }
}
opencode/claude-opus-4-6
{
  "id": "claude-opus-4-6",
  "providerID": "opencode",
  "variants": {
    "low": { "effort": "low" },
    "medium": { "effort": "medium" },
    "high": { "effort": "high" },
    "max": { "effort": "max" }
  },
  "limit": { "context": 1000000, "output": 64000 }
}
opencode/deepseek-v4
{
  "id": "deepseek-v4",
  "providerID": "opencode",
  "variants": {},
  "limit": { "context": 131072, "output": 8192 }
}
`;
    expect(parseOpenCodeVerboseModels(sample)).toEqual([
      { id: "opencode/big-pickle", variants: [] },
      { id: "opencode/claude-haiku-4-5", variants: ["high", "max"], contextLimit: 200000 },
      {
        id: "opencode/claude-opus-4-6",
        variants: ["low", "medium", "high", "max"],
        contextLimit: 1000000,
      },
      { id: "opencode/deepseek-v4", variants: [], contextLimit: 131072 },
    ]);
  });

  it("returns empty list for unparseable JSON without throwing", () => {
    const sample = `opencode/broken
{ this is not json
`;
    expect(parseOpenCodeVerboseModels(sample)).toEqual([{ id: "opencode/broken", variants: [] }]);
  });

  it("returns no entries when stdout is empty", () => {
    expect(parseOpenCodeVerboseModels("")).toEqual([]);
  });
});

describe("parseOpenCodeProvidersList", () => {
  it("extracts connected upstream providers and auth type", () => {
    expect(
      parseOpenCodeProvidersList(`┌  Credentials ~/.local/share/opencode/auth.json
│
●  OpenCode Zen api
│
●  GitHub Copilot oauth
│
●  OpenAI oauth
│
└  3 credentials`),
    ).toEqual([
      { label: "OpenCode Zen", detail: "API" },
      { label: "Copilot", detail: "OAuth" },
      { label: "OpenAI", detail: "OAuth" },
    ]);
  });
});

describe("attachOpenCodeProviderIds", () => {
  it("zips auth.json ids onto providers by index", () => {
    expect(
      attachOpenCodeProviderIds(
        [
          { label: "OpenCode Zen", detail: "API" },
          { label: "Copilot", detail: "OAuth" },
          { label: "OpenAI", detail: "OAuth" },
        ],
        ["opencode", "github-copilot", "openai"],
      ),
    ).toEqual([
      { label: "OpenCode Zen", detail: "API", id: "opencode" },
      { label: "Copilot", detail: "OAuth", id: "github-copilot" },
      { label: "OpenAI", detail: "OAuth", id: "openai" },
    ]);
  });

  it("leaves ids off when counts differ (avoids logging out the wrong provider)", () => {
    expect(
      attachOpenCodeProviderIds([{ label: "OpenCode Zen", detail: "API" }], ["opencode", "openai"]),
    ).toEqual([{ label: "OpenCode Zen", detail: "API" }]);
  });

  it("returns a fresh array for an empty provider list", () => {
    expect(attachOpenCodeProviderIds([], ["opencode"])).toEqual([]);
  });
});

describe("mapOpenCodeSlashCommands", () => {
  it("normalizes OpenCode command-list entries to slash commands", () => {
    expect(
      mapOpenCodeSlashCommands([
        {
          name: "review",
          description: "Review the current diff",
          hints: ["<scope>", " --fix"],
          template: "",
        },
        { name: "   ", template: "" },
      ]),
    ).toEqual([
      {
        id: "review",
        label: "review — Review the current diff",
        description: "Review the current diff",
        argumentHint: "<scope> --fix",
      },
    ]);
  });
});

describe("OpenCode prompt formatting", () => {
  it("places attachments on their own line with \\n\\n separator", () => {
    const adapter = createOpenCodeAdapter();
    const attachmentPath = join(homedir(), ".poracode", "attachments", "draft", "image.png");
    const prompt = adapter.formatPromptSegments?.([
      { kind: "text", content: "can you see this image?" },
      { kind: "attachment", path: attachmentPath },
    ]);

    expect(prompt).toBe("can you see this image?\n\n@~/.poracode/attachments/draft/image.png ");
  });

  it("wraps multiline prompts in bracketed paste in buildDirectInput", () => {
    const adapter = createOpenCodeAdapter();
    const result = adapter.buildDirectInput?.("line one\nline two");

    expect(result).toEqual(["\x1b[200~line one\nline two\x1b[201~", "@wait:60", "\r"]);
  });

  it("does not wrap single-line prompts in bracketed paste", () => {
    const adapter = createOpenCodeAdapter();
    const result = adapter.buildDirectInput?.("just one line");

    expect(result).toEqual(["just one line", "@wait:60", "\r"]);
  });
});

describe("humanizeOpenCodeModelId", () => {
  it("strips the sub-provider prefix from provider/model IDs", () => {
    expect(humanizeOpenCodeModelId("opencode/big-pickle")).toBe("Big Pickle");
    expect(humanizeOpenCodeModelId("github-copilot/gpt-5.4-mini")).toBe("GPT 5.4 Mini");
  });

  it("normalizes common model title tokens", () => {
    expect(humanizeOpenCodeModelId("anthropic/claude-haiku-4-5")).toBe("Claude Haiku 4.5");
    expect(humanizeOpenCodeModelId("openrouter/gpt-oss-120b")).toBe("GPT OSS 120B");
    expect(humanizeOpenCodeModelId("openai/o3-mini")).toBe("o3 Mini");
  });
});

describe("humanizeOpenCodeSubProviderId", () => {
  it("normalizes sub-provider labels", () => {
    expect(humanizeOpenCodeSubProviderId("opencode")).toBe("OpenCode");
    expect(humanizeOpenCodeSubProviderId("github-copilot")).toBe("Copilot");
    expect(humanizeOpenCodeSubProviderId("openrouter")).toBe("OpenRouter");
  });
});

describe("opencodeOscTitleHint", () => {
  it("flips to working when title is prefixed by a braille spinner glyph", () => {
    expect(opencodeOscTitleHint({ code: 2, text: "⠋ working… (project)" })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("ignores titles without a braille prefix", () => {
    expect(opencodeOscTitleHint({ code: 2, text: "OpenCode (project)" })).toBeNull();
  });
});

describe("opencodeOscHint", () => {
  it("treats OSC 9;4;0 (remove progress) as idle", () => {
    expect(opencodeOscHint({ code: 9, body: "4;0", title: "", payload: undefined })).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("treats OSC 9;4;1 / 9;4;3 (set / indeterminate) as working", () => {
    expect(opencodeOscHint({ code: 9, body: "4;1;42", title: "", payload: undefined })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(opencodeOscHint({ code: 9, body: "4;3;0", title: "", payload: undefined })).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("ignores progress sub-protocol bodies on non-9 OSC codes", () => {
    // 777 / 99 carriers don't trigger the iTerm2 4;<state> path even if their
    // body looks like a progress payload, because progress is OSC-9 specific.
    expect(opencodeOscHint({ code: 777, body: "4;1", title: "", payload: undefined })).toBeNull();
  });

  it("falls back to needs_approval on permission keywords in non-progress notifications", () => {
    expect(
      opencodeOscHint({
        code: 9,
        body: "permission requested",
        title: "OpenCode",
        payload: undefined,
      }),
    ).toEqual({ status: "needs_approval", attention: "needs_approval", corroborated: true });
  });
});

describe("detectOpenCodeTerminalStatus", () => {
  it("detects working from 'esc to interrupt' line", () => {
    expect(detectOpenCodeTerminalStatus("Working... (esc to interrupt)")?.status).toBe("working");
  });

  it("detects needs_approval from a [y/n] prompt", () => {
    expect(detectOpenCodeTerminalStatus("Allow this tool? [y/n]")?.status).toBe("needs_approval");
  });

  it("falls back to idle on a 'Type a message' footer", () => {
    expect(detectOpenCodeTerminalStatus("Type a message")).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects idle from the keybind footer painted only in input state", () => {
    // The TUI renders the keybind hints right next to each other without a
    // space, e.g. `…tab agentsctrl+p commands`. Either substring is enough.
    const text = "                                  tab agentsctrl+p commands";
    expect(detectOpenCodeTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("returns null when no pattern matches", () => {
    expect(detectOpenCodeTerminalStatus("nothing of note here")).toBeNull();
  });

  it("prefers a tail approval prompt over an earlier working line", () => {
    const text = "Working... (esc to interrupt)\nfinished step\nAllow tool? [y/n]";
    expect(detectOpenCodeTerminalStatus(text)?.status).toBe("needs_approval");
  });
});

describe("opencodeIntentFor", () => {
  it("maps OpenCode lifecycle hooks to Poracode intents", () => {
    expect(opencodeIntentFor("session.created")).toBe("session.started");
    expect(opencodeIntentFor("tool.execute.before")).toBe("session.turn_started");
    expect(opencodeIntentFor("permission.asked")).toBe("session.needs_approval");
    expect(opencodeIntentFor("permission.updated")).toBe("session.needs_approval");
    expect(opencodeIntentFor("session.idle")).toBe("session.turn_finished");
    expect(opencodeIntentFor("session.error")).toBe("session.turn_errored");
  });

  it("returns undefined for unmapped events", () => {
    expect(opencodeIntentFor("tool.execute.after")).toBeUndefined();
    expect(opencodeIntentFor("session.updated")).toBeUndefined();
  });
});

describe("createOpenCodeAdapter", () => {
  it("declares the in-process plugin metadata and identity", () => {
    const adapter = createOpenCodeAdapter();
    expect(adapter.kind).toBe("opencode");
    expect(adapter.label).toBe("OpenCode");
    expect(adapter.pluginId).toBe("poracode-status@opencode");
    expect(adapter.minProtocolVersion).toBe(1);
    expect(adapter.capabilities.crossagentMcpRouting).toBe("provider-session");
  });

  it("returns no extra args/env from pluginLaunchExtras (in-process plugin)", async () => {
    const adapter = createOpenCodeAdapter();
    const extras = await adapter.pluginLaunchExtras?.({ envKind: "posix" });
    expect(extras).toEqual({});
    expect(extras?.args).toBeUndefined();
    expect(extras?.env).toBeUndefined();
  });

  it("only allows hook-active terminal fallback for needs_approval", () => {
    const adapter = createOpenCodeAdapter();
    expect(
      adapter.shouldApplyTerminalStatusWhileHookActive?.({
        status: "needs_approval",
        attention: "needs_approval",
      }),
    ).toBe(true);
    expect(
      adapter.shouldApplyTerminalStatusWhileHookActive?.({
        status: "working",
        attention: "working",
      }),
    ).toBe(false);
    expect(
      adapter.shouldApplyTerminalStatusWhileHookActive?.({ status: "idle", attention: "none" }),
    ).toBe(false);
  });

  it("builds a `run --format json` one-shot command piped via stdin", () => {
    const adapter = createOpenCodeAdapter();
    const cmd = adapter.buildOneShotCommand?.("opencode/claude-haiku-4-5", undefined, "say hi");
    expect(cmd).toEqual({
      command: "opencode",
      args: ["run", "--format", "json", "--model", "opencode/claude-haiku-4-5", "say hi"],
      stdin: "",
    });
  });

  it("returns undefined for buildOneShotCommand when no prompt is supplied", () => {
    const adapter = createOpenCodeAdapter();
    expect(
      adapter.buildOneShotCommand?.("opencode/claude-haiku-4-5", undefined, undefined),
    ).toBeUndefined();
  });

  it("skips SDK session setup when resuming an existing session", async () => {
    // On resume the providerSessionId is already known — no need to ask
    // `opencode serve` to allocate a new one. Returning undefined keeps the
    // existing flow (just `opencode --session <id>`).
    const adapter = createOpenCodeAdapter();
    await expect(
      adapter.createStructuredSession?.({
        threadId: "thread-1",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        config: { model: "opencode/big-pickle" },
        sessionRef: {
          providerSessionId: "ses_existing",
          discoveredAt: new Date().toISOString(),
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("buildLaunchArgv returns no --session and no sessionRef when launchOptions is empty", () => {
    // Defensive path: if SDK allocation never ran (failed, skipped, structured
    // session disabled), the TUI is launched without `--session` and OpenCode
    // creates a fresh session itself — same as before Shape A.
    const adapter = createOpenCodeAdapter();
    const argv = adapter.buildLaunchArgv(
      { kind: "windows", path: "C:\\repo" },
      { model: "" },
      "",
      undefined,
      undefined,
    );
    expect(argv.args).not.toContain("--session");
    expect(argv.sessionRef).toBeUndefined();
    expect(argv.preferShell).toBe(true);
  });

  it("isReadyForInitialPrompt fires on the keybind footer", () => {
    // The hook-fast-path uses this to gate flushing the deferred initial
    // prompt. The footer painted only in input-ready state is enough.
    const adapter = createOpenCodeAdapter();
    expect(adapter.isReadyForInitialPrompt?.("...tab agentsctrl+p commands")).toBe(true);
    expect(adapter.isReadyForInitialPrompt?.("...esc to interrupt")).toBe(false);
  });

  it("buildLaunchArgv promotes launchOptions.resumeThreadId to --session and sessionRef", () => {
    // This is the post-SDK path: the structured session captured a freshly
    // allocated session id and stashed it in launchOptions before disposing.
    const adapter = createOpenCodeAdapter();
    const argv = adapter.buildLaunchArgv(
      { kind: "windows", path: "C:\\repo" },
      { model: "opencode/big-pickle" },
      "hello",
      undefined,
      { resumeThreadId: "ses_sdk_allocated" },
    );
    expect(argv.args).toEqual([
      "--session",
      "ses_sdk_allocated",
      "--model",
      "opencode/big-pickle",
      "--prompt",
      "hello",
    ]);
    expect(argv.sessionRef?.providerSessionId).toBe("ses_sdk_allocated");
    expect(argv.preferShell).toBe(true);
  });

  it("injects custom MCPs through a per-launch OpenCode config overlay", () => {
    const adapter = createOpenCodeAdapter();
    const argv = adapter.buildLaunchArgv(
      { kind: "windows", path: "C:\\repo" },
      { model: "" },
      "",
      undefined,
      {
        mcpServers: [
          {
            id: "vercel-id",
            name: "vercel",
            timeoutMs: 30_000,
            transport: {
              type: "http",
              url: "https://mcp.vercel.test",
              headers: { Authorization: "Bearer secret" },
            },
          },
        ],
      },
    );

    expect(argv.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
    expect(argv.env?.OPENCODE_CONFIG_CONTENT).not.toContain("Bearer secret");
    expect(argv.env?.OPENCODE_CONFIG_CONTENT).toContain("{env:PORACODE_MCP_OPENCODE_");
    expect(Object.values(argv.env ?? {})).toContain("Bearer secret");
  });

  it("enables trusted session routing when a terminal launch hosts Crossagents", () => {
    const adapter = createOpenCodeAdapter();
    const argv = adapter.buildLaunchArgv(
      { kind: "windows", path: "C:\\repo" },
      { model: "" },
      "",
      undefined,
      {
        mcpServers: [
          {
            id: "crossagents",
            name: "crossagents",
            timeoutMs: 300_000,
            transport: {
              type: "http",
              url: "http://127.0.0.1:43123/mcp",
              headers: { Authorization: "Bearer shared" },
            },
          },
        ],
      },
    );

    expect(argv.env?.PORACODE_OPENCODE_SESSION_ROUTING).toBe("1");
  });

  it("does not override OpenCode config when no custom MCP is selected", () => {
    const adapter = createOpenCodeAdapter();
    const argv = adapter.buildResumeArgv(
      { kind: "windows", path: "C:\\repo" },
      { model: "" },
      "",
      { providerSessionId: "ses_existing", discoveredAt: new Date().toISOString() },
      { mcpServers: [] },
    );

    expect(argv.env).toBeUndefined();
  });

  it("buildResumeArgv opts into shell resolution for the terminal TUI", () => {
    const adapter = createOpenCodeAdapter();
    const argv = adapter.buildResumeArgv(
      { kind: "windows", path: "C:\\repo" },
      { model: "opencode/big-pickle" },
      "continue",
      { providerSessionId: "ses_existing", discoveredAt: new Date().toISOString() },
    );

    expect(argv.args).toEqual([
      "--session",
      "ses_existing",
      "--model",
      "opencode/big-pickle",
      "--prompt",
      "continue",
    ]);
    expect(argv.preferShell).toBe(true);
  });
});
