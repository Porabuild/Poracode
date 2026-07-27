import { describe, expect, it } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createCommandCodeAdapter } from ".";
import { buildCommandCodeArgs } from "./argv";
import {
  buildCommandCodeModelPickerCapabilities,
  COMMANDCODE_DEFAULT_MODEL_ID,
  commandCodeDetectionSpec,
  defaultCommandCodeCapabilities,
  parseCommandCodeModels,
} from "./detection";
import { authJsonHasApiKey, detectCommandCodeInvalidSessionRef } from "./session";
import {
  commandCodeTranscriptId,
  isUuid,
  sanitizeCommandCodeCwd,
  sanitizeCommandCodeMcpCwd,
} from "./sessionFiles";
import { detectCommandCodeTerminalStatus } from "./terminal";

describe("buildCommandCodeArgs", () => {
  const config: ThreadConfig = { model: "claude-opus-4-8" };

  it("pins default mode and always appends --yolo to unlock bypass in the picker", () => {
    // `--yolo` is always appended as an unlock; pinning `--permission-mode
    // default` keeps it from becoming the initial mode. Verified against the
    // v1.4.1 bundle: initial = permissionMode || (yolo ? "bypass":"default").
    expect(buildCommandCodeArgs(config, "hello")).toEqual([
      "--trust",
      "--skip-onboarding",
      "--model",
      "claude-opus-4-8",
      "--permission-mode",
      "default",
      "--yolo",
      "hello",
    ]);
  });

  it("resumes a specific session with --resume <id>", () => {
    expect(buildCommandCodeArgs(config, "next", "af75c40e-44dd-4369-a187-571745a01df2")).toEqual([
      "--trust",
      "--skip-onboarding",
      "--resume",
      "af75c40e-44dd-4369-a187-571745a01df2",
      "--model",
      "claude-opus-4-8",
      "--permission-mode",
      "default",
      "--yolo",
      "next",
    ]);
  });

  it("falls back to --continue when the resume id is the empty string", () => {
    expect(buildCommandCodeArgs(config, "next", "")).toEqual([
      "--trust",
      "--skip-onboarding",
      "--continue",
      "--model",
      "claude-opus-4-8",
      "--permission-mode",
      "default",
      "--yolo",
      "next",
    ]);
  });

  it("adds no resume flag for a fresh launch", () => {
    const args = buildCommandCodeArgs(config, "next");
    expect(args).not.toContain("--resume");
    expect(args).not.toContain("--continue");
  });

  it("omits the prompt positional when empty", () => {
    expect(buildCommandCodeArgs(config, "   ")).toEqual([
      "--trust",
      "--skip-onboarding",
      "--model",
      "claude-opus-4-8",
      "--permission-mode",
      "default",
      "--yolo",
    ]);
  });

  it("passes the selected model effort to v1", () => {
    const args = buildCommandCodeArgs({ ...config, effort: "xhigh" }, "");
    expect(args).toContain("--effort");
    expect(args[args.indexOf("--effort") + 1]).toBe("xhigh");
  });

  it("opens directly in bypass for a yolo/never pick (omits the start mode)", () => {
    // No `--permission-mode`, so the trailing `--yolo` selects bypass as the
    // initial mode (the user explicitly chose Bypass Permissions).
    for (const approvalPolicy of ["yolo", "never"] as const) {
      const args = buildCommandCodeArgs({ ...config, approvalPolicy }, "");
      expect(args).toContain("--yolo");
      expect(args.join(" ")).not.toContain("--permission-mode");
    }
  });

  it("starts in auto-accept for auto_edit, with bypass still unlocked", () => {
    const args = buildCommandCodeArgs({ ...config, approvalPolicy: "auto_edit" }, "");
    expect(args.join(" ")).toContain("--permission-mode auto-accept");
    expect(args).toContain("--yolo");
  });

  it("starts in v1 dont-ask mode while keeping bypass available", () => {
    const args = buildCommandCodeArgs({ ...config, approvalPolicy: "dont-ask" }, "");
    expect(args.join(" ")).toContain("--permission-mode dont-ask");
    expect(args).toContain("--yolo");
  });

  it("starts in plan mode with bypass unlocked for after planning", () => {
    // Plan pins the start mode even when Bypass is picked; `--yolo` then just
    // unlocks bypass in the picker for when the user leaves plan mode.
    const args = buildCommandCodeArgs({ ...config, mode: "plan", approvalPolicy: "yolo" }, "");
    expect(args.join(" ")).toContain("--permission-mode plan");
    expect(args).toContain("--yolo");
  });

  it("pins plan for a plan + non-bypass pick, with bypass still unlocked", () => {
    const args = buildCommandCodeArgs({ ...config, mode: "plan", approvalPolicy: "default" }, "");
    expect(args.join(" ")).toContain("--permission-mode plan");
    expect(args).toContain("--yolo");
  });
});

describe("createCommandCodeAdapter", () => {
  const project: ProjectLocation = { kind: "windows", path: "C:\\demo" };

  it("declares the command-code binary, default-first models, and bypass default", () => {
    const adapter = createCommandCodeAdapter();

    expect(adapter.kind).toBe("commandcode");
    expect(adapter.binary).toBe("command-code");
    expect(adapter.capabilities.models[0]?.id).toBe(COMMANDCODE_DEFAULT_MODEL_ID);
    expect(adapter.capabilities.approvalPolicies.map((p) => p.id)).toEqual([
      "default",
      "auto_edit",
      "dont-ask",
      "yolo",
    ]);
    expect(adapter.capabilities.defaultApprovalPolicy).toBe("yolo");
    expect(adapter.capabilities.defaultEffort).toBe("high");
    expect(adapter.capabilities.models).toHaveLength(48);
    expect(defaultCommandCodeCapabilities.presentationModes).toEqual(["terminal"]);
    expect(adapter.defaultOneShotModel).toBe(COMMANDCODE_DEFAULT_MODEL_ID);
  });

  it("builds a bypass-permissions one-shot subagent command with --yolo", () => {
    const adapter = createCommandCodeAdapter();
    const cmd = adapter.buildSubagentOneShotCommand?.({
      model: "claude-opus-4-8",
      effort: "xhigh",
      prompt: "do the work",
      location: project,
    });
    expect(cmd?.command).toBe("command-code");
    expect(cmd?.args).toContain("--trust");
    expect(cmd?.args).toContain("--yolo");
    expect(cmd?.args).toEqual([
      "--trust",
      "--skip-onboarding",
      "--no-session",
      "--yolo",
      "--model",
      "claude-opus-4-8",
      "--effort",
      "xhigh",
      "-p",
      "do the work",
    ]);
  });

  it("exposes the update spec on the adapter so the npm latest-version probe works", () => {
    // Regression guard: the registry card's "latest version" probe reads
    // `adapter.update`, not the detection status. Without this field a
    // not-installed Command Code card shows no version.
    const adapter = createCommandCodeAdapter();
    expect(adapter.update?.npm).toBe("command-code");
  });

  it("launches without a sessionRef so the runtime discovers the real id", () => {
    // The synthetic ref is gone: returning no ref is what lets the runtime's
    // discoverSessionRef path run and capture command-code's real session id.
    const adapter = createCommandCodeAdapter();
    const launch = adapter.buildLaunchArgv(project, { model: "gpt-5.5" }, "hi");

    expect(launch.binary).toBe("command-code");
    expect(launch.args).toEqual([
      "--trust",
      "--skip-onboarding",
      "--model",
      "gpt-5.5",
      "--permission-mode",
      "default",
      "--yolo",
      "hi",
    ]);
    expect(launch.sessionRef).toBeUndefined();
    expect(adapter.discoverSessionRef).toBeTypeOf("function");
    expect(adapter.watchSessionRef).toBeTypeOf("function");
  });

  it("resumes a discovered session id with --resume", () => {
    const adapter = createCommandCodeAdapter();
    const resume = adapter.buildResumeArgv(project, { model: "gpt-5.5" }, "next", {
      providerSessionId: "af75c40e-44dd-4369-a187-571745a01df2",
      discoveredAt: "2026-05-20T00:00:00.000Z",
    });

    expect(resume.args).toContain("--resume");
    expect(resume.args).toContain("af75c40e-44dd-4369-a187-571745a01df2");
    expect(resume.args).not.toContain("--continue");
  });

  it("falls back to --continue for a non-uuid (legacy/synthetic) ref", () => {
    // A non-UUID ref can't be a real command-code session id, so resume can't
    // target one — it uses --continue and never passes the bogus id. A stale
    // *uuid* ref instead goes through --resume and the runtime recovers it.
    const adapter = createCommandCodeAdapter();
    const resume = adapter.buildResumeArgv(project, { model: "gpt-5.5" }, "next", {
      providerSessionId: "synthetic-id",
      discoveredAt: "2026-05-20T00:00:00.000Z",
    });

    expect(resume.args).toContain("--continue");
    expect(resume.args).not.toContain("--resume");
    expect(resume.args).not.toContain("synthetic-id");
  });

  it("builds a print-mode one-shot command", () => {
    const adapter = createCommandCodeAdapter();
    expect(adapter.buildOneShotCommand?.("gpt-5.4-mini", "high", "summarize")).toEqual({
      command: "command-code",
      args: [
        "--trust",
        "--skip-onboarding",
        "--no-session",
        "--model",
        "gpt-5.4-mini",
        "--effort",
        "high",
        "-p",
        "summarize",
      ],
      stdin: "",
      // Suppress the CLI's background self-updater on one-shot utility runs.
      env: { COMMANDCODE_SKIP_UPDATES: "1" },
    });
  });
});

describe("detectCommandCodeTerminalStatus", () => {
  it("treats the empty composer as idle", () => {
    // Real idle screen: `❯ Ask your question...` placeholder + shortcuts hint.
    const text = [
      "────────────",
      "❯ Ask your question...",
      "────────────",
      "  » permission bypass on [shift+tab]",
      "  ? for shortcuts",
    ].join("\n");
    expect(detectCommandCodeTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("detects approval prompts as needs_approval", () => {
    const result = detectCommandCodeTerminalStatus("Allow edit to src/app.ts? [y/n]");
    expect(result?.status).toBe("needs_approval");
    expect(result?.attention).toBe("needs_approval");
  });

  it("detects the working spinner row via the `esc to interrupt` invariant", () => {
    // The verb label is randomized ("Cogitating"/"Processing"/"Conjuring"/…),
    // so detection anchors on `esc to interrupt`, not the label.
    expect(
      detectCommandCodeTerminalStatus(" · Conjuring  esc to interrupt • 1s • ↑ 0"),
    ).toMatchObject({
      status: "working",
      attention: "working",
    });
  });

  it("returns null without recognizable indicators", () => {
    expect(detectCommandCodeTerminalStatus("random output")).toBeNull();
  });
});

describe("commandCodeDetectionSpec auth", () => {
  it("declares npm + built-in update so outdated detection and fallback work", () => {
    expect(commandCodeDetectionSpec.update).toEqual({
      builtIn: { binary: "command-code", args: ["update"] },
      npm: "command-code",
    });
    expect(commandCodeDetectionSpec.loginCommand).toBe("command-code login");
  });

  // Suppresses the CLI's background self-updater. The one-shot and terminal-login
  // surfaces are asserted by their own tests above; this covers the detection
  // probe + PTY-launch surfaces.
  it("sets COMMANDCODE_SKIP_UPDATES on the version probe and PTY launch env", () => {
    // `--version` probe (also flows to capabilitiesProbe via DetectProbeCtx.probeEnv).
    expect(commandCodeDetectionSpec.probeEnv).toEqual({ COMMANDCODE_SKIP_UPDATES: "1" });

    // Interactive / login PTY launch (spawnEnv); wsl keeps the OAuth BROWSER shim.
    const adapter = createCommandCodeAdapter();
    expect(adapter.spawnEnv?.native).toEqual({ COMMANDCODE_SKIP_UPDATES: "1" });
    expect(adapter.spawnEnv?.wsl).toEqual({
      BROWSER: "/bin/true",
      COMMANDCODE_SKIP_UPDATES: "1",
    });
  });

  it("advertises a terminal login method when installed (drives the Login button)", async () => {
    const project: ProjectLocation = { kind: "windows", path: "C:\\demo" };
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.({
      location: project,
      executablePath: "C:\\bin\\command-code.cmd",
    });
    expect(result?.authMethods).toEqual([
      {
        id: "commandcode-terminal-login",
        name: "Login",
        type: "terminal",
        env: { COMMANDCODE_SKIP_UPDATES: "1" },
      },
    ]);
  });

  it("offers no auth method when the binary is not installed", async () => {
    const project: ProjectLocation = { kind: "windows", path: "C:\\demo" };
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.({
      location: project,
      executablePath: undefined,
    });
    expect(result).toBeUndefined();
  });

  it("declares environment and credential-file auth probes", () => {
    expect(commandCodeDetectionSpec.authProbes).toHaveLength(2);
  });

  it("treats auth.json as signed in only when it carries a non-empty apiKey", () => {
    // present apiKey => authenticated ("Re-login" / "Signed in");
    // absent / empty / unparseable => missing ("Login").
    expect(authJsonHasApiKey(JSON.stringify({ apiKey: "k", userName: "x" }))).toBe(true);
    expect(authJsonHasApiKey(JSON.stringify({ apiKey: "" }))).toBe(false);
    expect(authJsonHasApiKey(JSON.stringify({ apiKey: " " }))).toBe(false);
    expect(authJsonHasApiKey("{}")).toBe(false);
    expect(authJsonHasApiKey(undefined)).toBe(false);
    expect(authJsonHasApiKey("not json")).toBe(false);
  });
});

// A faithful slice of real `command-code --list-models` stdout: the header, a
// couple of vendor sections (including a namespace we don't curate: nvidia),
// the `(default)` / `(recommended)` markers, and the trailing usage/docs footer
// the parser must ignore.
const LIST_MODELS_FIXTURE = `Available models  ·  30 models

Open Source

deepseek/deepseek-v4-pro           hybrid-attention long-context reasoning
deepseek/deepseek-v4-flash         fast hybrid-attention reasoning (default)
moonshotai/kimi-k2.7-code          improved long-horizon coding with vision
nvidia/nemotron-3-ultra-550b-a55b  open reasoning model for long-horizon autonomous agents

Anthropic

claude-sonnet-4-6                  best combo of speed & intelligence (recommended)
claude-fable-5                     most capable for demanding reasoning & long-horizon agents

OpenAI

gpt-5.5                            latest frontier model for general complex work

Pass the full id, or just the short name after the last "/":
cmd --model moonshotai/kimi-k2.5
cmd --model kimi-k2.5

Docs:  https://commandcode.ai/docs/reference/cli/models
`;

describe("parseCommandCodeModels", () => {
  it("extracts ids + taglines and skips headers, footer and the docs line", () => {
    const parsed = parseCommandCodeModels(LIST_MODELS_FIXTURE);
    expect(parsed.map((m) => m.id)).toEqual([
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-flash",
      "moonshotai/kimi-k2.7-code",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "claude-sonnet-4-6",
      "claude-fable-5",
      "gpt-5.5",
    ]);
    // The `Docs:  https://…` footer has a 2-space gap like a model row, so the
    // id guard (no colon) is what keeps it out.
    expect(parsed.some((m) => m.id.startsWith("Docs"))).toBe(false);
  });

  it("flags the (default) model and strips the marker from its tagline", () => {
    const parsed = parseCommandCodeModels(LIST_MODELS_FIXTURE);
    const def = parsed.find((m) => m.isDefault);
    expect(def?.id).toBe("deepseek/deepseek-v4-flash");
    expect(def?.description).toBe("fast hybrid-attention reasoning");
    expect(parsed.find((m) => m.id === "claude-sonnet-4-6")?.description).toBe(
      "best combo of speed & intelligence",
    );
  });

  it("returns an empty list for unparseable output", () => {
    expect(parseCommandCodeModels("")).toEqual([]);
    expect(parseCommandCodeModels("totally unrelated text\nno models here")).toEqual([]);
  });
});

describe("buildCommandCodeModelPickerCapabilities", () => {
  it("labels models, hoists the default first, and groups by sub-provider", () => {
    const caps = buildCommandCodeModelPickerCapabilities(
      parseCommandCodeModels(LIST_MODELS_FIXTURE),
    );

    // Default is surfaced first so a fresh thread mirrors the CLI default.
    expect(caps.models[0]?.id).toBe("deepseek/deepseek-v4-flash");

    const byId = new Map(caps.models.map((m) => [m.id, m]));
    // Curated label override wins; humanize is only the fallback.
    expect(byId.get("moonshotai/kimi-k2.7-code")?.label).toBe("Kimi K2.7 Code");
    expect(byId.get("gpt-5.5")?.label).toBe("GPT-5.5");
    // The CLI tagline rides along as the (search/tooltip) description.
    expect(byId.get("moonshotai/kimi-k2.7-code")?.description).toBe(
      "improved long-horizon coding with vision",
    );

    // Un-namespaced ids map explicitly; slash-namespaced ids derive from prefix.
    expect(caps.modelSubProvider?.["claude-fable-5"]).toBe("anthropic");
    expect(caps.modelSubProvider?.["gpt-5.5"]).toBe("openai");
    expect(caps.modelSubProvider?.["nvidia/nemotron-3-ultra-550b-a55b"]).toBe("nvidia");
    expect(caps.modelEfforts["deepseek/deepseek-v4-flash"]).toEqual(["high", "max"]);
    expect(caps.modelEfforts["gpt-5.5"]).toEqual(["low", "medium", "high", "xhigh"]);

    // Curated label for a known sub-provider; humanized fallback for nvidia.
    const subById = new Map((caps.subProviders ?? []).map((s) => [s.id, s.label]));
    expect(subById.get("deepseek")).toBe("DeepSeek");
    expect(subById.get("nvidia")).toBe("NVIDIA");
  });

  it("falls back to a humanized label for an uncurated id", () => {
    const caps = buildCommandCodeModelPickerCapabilities([{ id: "acme/new-shiny-model" }]);
    expect(caps.models[0]?.label).toBe("New Shiny Model");
    expect(caps.modelSubProvider?.["acme/new-shiny-model"]).toBe("acme");
    expect((caps.subProviders ?? []).find((s) => s.id === "acme")?.label).toBe("Acme");
  });
});

describe("commandCodeDetectionSpec capabilitiesProbe", () => {
  it("returns only the terminal auth method when the binary is absent", async () => {
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/tmp" },
      executablePath: undefined,
    });
    expect(result).toBeUndefined();
  });
});

describe("detectCommandCodeInvalidSessionRef", () => {
  it("detects empty-continue messages", () => {
    expect(detectCommandCodeInvalidSessionRef("No previous conversation found")).toBe(true);
    expect(detectCommandCodeInvalidSessionRef("Nothing to continue")).toBe(true);
    expect(detectCommandCodeInvalidSessionRef("No conversations found to resume.")).toBe(true);
  });

  it("detects a missing --resume <id> target and a corrupt transcript", () => {
    expect(
      detectCommandCodeInvalidSessionRef(
        'No session "deadbeef-0000-4000-8000-000000000000" found to resume.',
      ),
    ).toBe(true);
    expect(
      detectCommandCodeInvalidSessionRef(
        "Session could not be loaded. 1 lines could not be parsed.",
      ),
    ).toBe(true);
  });

  it("ignores unrelated output", () => {
    expect(detectCommandCodeInvalidSessionRef("Command Code ready")).toBe(false);
  });
});

describe("commandCodeTranscriptId", () => {
  const uuid = "af75c40e-44dd-4369-a187-571745a01df2";

  it("accepts a real <uuid>.jsonl transcript", () => {
    expect(commandCodeTranscriptId(`${uuid}.jsonl`)).toBe(uuid);
  });

  it("rejects every sidecar and audit file (the corruption guard)", () => {
    // Passing any of these basenames to `--resume` is what yields
    // "Session could not be loaded. N lines could not be parsed."
    expect(commandCodeTranscriptId(`hooks-audit-${uuid}.jsonl`)).toBeUndefined();
    expect(commandCodeTranscriptId(`hooks-audit-hooks-audit-${uuid}.jsonl`)).toBeUndefined();
    expect(commandCodeTranscriptId(`hooks-audit-${uuid}.checkpoints.jsonl`)).toBeUndefined();
    expect(commandCodeTranscriptId(`${uuid}.checkpoints.jsonl`)).toBeUndefined();
    expect(commandCodeTranscriptId(`${uuid}.prompts.jsonl`)).toBeUndefined();
    expect(commandCodeTranscriptId(`${uuid}.meta.json`)).toBeUndefined();
    expect(commandCodeTranscriptId(`${uuid}.share.json`)).toBeUndefined();
    expect(commandCodeTranscriptId("settings.json")).toBeUndefined();
    expect(commandCodeTranscriptId("not-a-uuid.jsonl")).toBeUndefined();
  });

  it("validates the uuid shape", () => {
    expect(isUuid(uuid)).toBe(true);
    expect(isUuid("hooks-audit-" + uuid)).toBe(false);
    expect(isUuid("synthetic-id")).toBe(false);
  });
});

describe("sanitizeCommandCodeCwd", () => {
  // These fixture paths don't exist on the test machine, so realpath throws and
  // the raw path is sanitized — deterministic, and matching the verified
  // on-disk layout produced by @sindresorhus/slugify.
  it("maps a project cwd to command-code's projects/<dir> name", () => {
    expect(sanitizeCommandCodeCwd("/Users/test-fixture-xyz/work/poracode")).toBe(
      "users-test-fixture-xyz-work-poracode",
    );
  });

  it("lowercases and collapses dots and slashes (worktree + temp paths)", () => {
    expect(
      sanitizeCommandCodeCwd(
        "/Users/test-fixture-xyz/.poracode/worktrees/lc-bbea/lc-golden-pixel-8f39b4b5",
      ),
    ).toBe("users-test-fixture-xyz-poracode-worktrees-lc-bbea-lc-golden-pixel-8f39b4b5");
    expect(sanitizeCommandCodeCwd("/private/var/T/cc-dbg-ca.ppww")).toBe(
      "private-var-t-cc-dbg-ca-ppww",
    );
  });

  it("splits camel-cased Windows path components like the v1.4.1 CLI", () => {
    expect(sanitizeCommandCodeCwd("C:\\Users\\demo\\AppData\\Local\\CommandCode")).toBe(
      "c-users-demo-app-data-local-command-code",
    );
  });

  it("matches the CLI's distinct empty-slug fallbacks for sessions and MCP", () => {
    expect(sanitizeCommandCodeCwd("")).toBe("root");
    expect(sanitizeCommandCodeMcpCwd("")).toBe("");
  });
});
