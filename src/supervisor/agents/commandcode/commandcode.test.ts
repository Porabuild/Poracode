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
import { detectCommandCodeTerminalStatus } from "./terminal";

describe("buildCommandCodeArgs", () => {
  const config: ThreadConfig = { model: "claude-opus-4-8" };

  it("pins standard mode and always appends --yolo to unlock bypass in the picker", () => {
    // `--yolo` is always appended as an unlock; pinning `--permission-mode
    // standard` keeps it from becoming the initial mode. Verified against the
    // v0.31.2 bundle: initial = permissionMode || (yolo ? "bypass":"standard").
    expect(buildCommandCodeArgs(config, "hello")).toEqual([
      "--trust",
      "--skip-onboarding",
      "--model",
      "claude-opus-4-8",
      "--permission-mode",
      "standard",
      "--yolo",
      "hello",
    ]);
  });

  it("adds --continue when resuming", () => {
    expect(buildCommandCodeArgs(config, "next", true)).toEqual([
      "--trust",
      "--skip-onboarding",
      "--continue",
      "--model",
      "claude-opus-4-8",
      "--permission-mode",
      "standard",
      "--yolo",
      "next",
    ]);
  });

  it("omits the prompt positional when empty", () => {
    expect(buildCommandCodeArgs(config, "   ")).toEqual([
      "--trust",
      "--skip-onboarding",
      "--model",
      "claude-opus-4-8",
      "--permission-mode",
      "standard",
      "--yolo",
    ]);
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
      "yolo",
    ]);
    expect(adapter.capabilities.defaultApprovalPolicy).toBe("yolo");
    expect(defaultCommandCodeCapabilities.presentationModes).toEqual(["terminal"]);
  });

  it("exposes the update spec on the adapter so the npm latest-version probe works", () => {
    // Regression guard: the registry card's "latest version" probe reads
    // `adapter.update`, not the detection status. Without this field a
    // not-installed Command Code card shows no version.
    const adapter = createCommandCodeAdapter();
    expect(adapter.update?.npm).toBe("command-code");
  });

  it("mints a synthetic sessionRef on launch so the thread is resumable", () => {
    const adapter = createCommandCodeAdapter();
    const launch = adapter.buildLaunchArgv(project, { model: "gpt-5.5" }, "hi");

    expect(launch.binary).toBe("command-code");
    expect(launch.args).toEqual([
      "--trust",
      "--skip-onboarding",
      "--model",
      "gpt-5.5",
      "--permission-mode",
      "standard",
      "--yolo",
      "hi",
    ]);
    expect(launch.sessionRef?.providerSessionId).toEqual(expect.any(String));
    expect(launch.sessionRef?.providerSessionId.length).toBeGreaterThan(0);
  });

  it("resumes with --continue and ignores the synthetic session id", () => {
    const adapter = createCommandCodeAdapter();
    const resume = adapter.buildResumeArgv(project, { model: "gpt-5.5" }, "next", {
      providerSessionId: "synthetic-id",
      discoveredAt: "2026-05-20T00:00:00.000Z",
    });

    expect(resume).toMatchObject({
      binary: "command-code",
      args: [
        "--trust",
        "--skip-onboarding",
        "--continue",
        "--model",
        "gpt-5.5",
        "--permission-mode",
        "standard",
        "--yolo",
        "next",
      ],
    });
    expect(resume.args).not.toContain("synthetic-id");
  });

  it("builds a print-mode one-shot command", () => {
    const adapter = createCommandCodeAdapter();
    expect(adapter.buildOneShotCommand?.("gpt-5.4-mini", undefined, "summarize")).toEqual({
      command: "command-code",
      args: ["--trust", "--skip-onboarding", "--model", "gpt-5.4-mini", "-p", "summarize"],
      stdin: "",
    });
  });
});

describe("detectCommandCodeTerminalStatus", () => {
  it("treats the empty prompt as idle", () => {
    const text = ["────────────", ">", "────────────", "? for shortcuts"].join("\n");
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

  it("detects the braille loader as working", () => {
    expect(detectCommandCodeTerminalStatus("⡿ Thinking…")).toMatchObject({
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

  it("advertises a terminal login method when installed (drives the Login button)", async () => {
    const project: ProjectLocation = { kind: "windows", path: "C:\\demo" };
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.({
      location: project,
      executablePath: "C:\\bin\\command-code.cmd",
    });
    expect(result?.authMethods).toEqual([
      { id: "commandcode-terminal-login", name: "Login", type: "terminal" },
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

  it("declares a credential-file auth probe (not a config-dir presence check)", () => {
    // Sign-in must be read from `auth.json`, not the config dir, which is
    // created on first run regardless. The probe maps to authenticated/missing.
    expect(commandCodeDetectionSpec.authProbes).toHaveLength(1);
  });

  it("treats auth.json as signed in only when it carries a non-empty apiKey", () => {
    // present apiKey => authenticated ("Re-login" / "Signed in");
    // absent / empty / unparseable => missing ("Login").
    expect(authJsonHasApiKey(JSON.stringify({ apiKey: "k", userName: "x" }))).toBe(true);
    expect(authJsonHasApiKey(JSON.stringify({ apiKey: "" }))).toBe(false);
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
moonshotai/Kimi-K2.7-Code          improved long-horizon coding with vision
nvidia/nemotron-3-ultra-550b-a55b  open reasoning model for long-horizon autonomous agents

Anthropic

claude-sonnet-4-6                  best combo of speed & intelligence (recommended)
claude-fable-5                     most capable for demanding reasoning & long-horizon agents

OpenAI

gpt-5.5                            latest frontier model for general complex work

Pass the full id, or just the short name after the last "/":
cmd --model moonshotai/Kimi-K2.5
cmd --model kimi-k2.5

Docs:  https://commandcode.ai/docs/reference/cli/models
`;

describe("parseCommandCodeModels", () => {
  it("extracts ids + taglines and skips headers, footer and the docs line", () => {
    const parsed = parseCommandCodeModels(LIST_MODELS_FIXTURE);
    expect(parsed.map((m) => m.id)).toEqual([
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-flash",
      "moonshotai/Kimi-K2.7-Code",
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
    expect(byId.get("moonshotai/Kimi-K2.7-Code")?.label).toBe("Kimi K2.7 Code");
    expect(byId.get("gpt-5.5")?.label).toBe("GPT-5.5");
    // The CLI tagline rides along as the (search/tooltip) description.
    expect(byId.get("moonshotai/Kimi-K2.7-Code")?.description).toBe(
      "improved long-horizon coding with vision",
    );

    // Un-namespaced ids map explicitly; slash-namespaced ids derive from prefix.
    expect(caps.modelSubProvider?.["claude-fable-5"]).toBe("anthropic");
    expect(caps.modelSubProvider?.["gpt-5.5"]).toBe("openai");
    expect(caps.modelSubProvider?.["nvidia/nemotron-3-ultra-550b-a55b"]).toBe("nvidia");

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
  });

  it("ignores unrelated output", () => {
    expect(detectCommandCodeInvalidSessionRef("Command Code ready")).toBe(false);
  });
});
