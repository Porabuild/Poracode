import { describe, expect, it } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createKnownSessionRef } from "../base";
import { buildPiArgs, buildPiOneShotArgs, splitPiModelId } from "./argv";
import { parsePiModelList, piDefaultCapabilities, piDetectionSpec } from "./detection";
import { createPiAdapter } from "./index";

const location = { kind: "posix", path: "/tmp/pi-project" } as ProjectLocation;

describe("Pi provider metadata", () => {
  const adapter = createPiAdapter();

  it("declares terminal and native SDK chat without inventing plan or permission modes", () => {
    expect(adapter).toMatchObject({ kind: "pi", label: "Pi", binary: "pi" });
    expect(adapter.capabilities).toMatchObject({
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      modes: [],
      approvalPolicies: [],
      supportsResume: true,
      supportsOneShot: true,
      mcpScope: { terminal: "none", gui: "launch" },
    });
    expect(typeof adapter.createStructuredSession).toBe("function");
  });

  it("uses Pi and shared Agent Skills roots with Pi's native invocation", () => {
    expect(adapter.skillSupport).toEqual({
      roots: [
        {
          id: "pi",
          label: "Pi",
          globalPath: ".pi/agent/skills",
          projectPath: ".pi/skills",
          globalOverride: { env: "PI_CODING_AGENT_DIR", path: "skills" },
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "skill",
      precedence: { global: ["pi", "agents"], project: ["pi", "agents"] },
    });
  });

  it("wires the official self updater and package fallback", () => {
    expect(adapter.update).toMatchObject({
      builtIn: { binary: "pi", args: ["update", "self"] },
      npm: "@earendil-works/pi-coding-agent",
    });
    expect(piDetectionSpec.loginCommand).toBe("pi");
  });
});

describe("Pi CLI argv", () => {
  it("passes model and every supported thinking effort to interactive Pi", () => {
    expect(
      buildPiArgs(
        { model: "anthropic/claude-sonnet-4-5", effort: "max" } as ThreadConfig,
        "inspect this",
      ),
    ).toEqual([
      "--approve",
      "--model",
      "anthropic/claude-sonnet-4-5",
      "--thinking",
      "max",
      "inspect this",
    ]);
  });

  it("resumes the exact Pi session id", () => {
    const adapter = createPiAdapter();
    expect(
      adapter.buildResumeArgv(
        location,
        { model: "openai/gpt-5-mini", effort: "low" } as ThreadConfig,
        "continue",
        createKnownSessionRef("0198-session"),
      ).args,
    ).toEqual([
      "--approve",
      "--session",
      "0198-session",
      "--model",
      "openai/gpt-5-mini",
      "--thinking",
      "low",
      "continue",
    ]);
  });

  it("builds an ephemeral print-mode command for utility and subagent runs", () => {
    expect(
      buildPiOneShotArgs({ model: "google/gemini-2.5-flash", effort: "minimal" }, "reply OK", {
        textOnly: true,
      }),
    ).toEqual([
      "--approve",
      "--model",
      "google/gemini-2.5-flash",
      "--thinking",
      "minimal",
      "--no-session",
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "-p",
      "reply OK",
    ]);
  });

  it("formats attachments with Pi's documented @path syntax", () => {
    const formatted = createPiAdapter().formatPromptSegments?.([
      { kind: "text", content: "Review these" },
      { kind: "attachment", path: "/tmp/a.png", mimeType: "image/png" },
      { kind: "attachment", path: "/tmp/spec.md" },
    ]);
    expect(formatted).toBe("Review these\n\n@/tmp/a.png @/tmp/spec.md");
  });

  it("splits fully qualified model ids without truncating nested ids", () => {
    expect(splitPiModelId("openrouter/anthropic/claude-sonnet")).toEqual({
      provider: "openrouter",
      modelId: "anthropic/claude-sonnet",
    });
    expect(splitPiModelId("sonnet")).toBeUndefined();
  });
});

describe("Pi terminal behavior", () => {
  const adapter = createPiAdapter();

  it("submits direct input after Pi's paste guard window", () => {
    expect(adapter.buildDirectInput?.("hello")).toEqual(["hello", "@wait:150", "\r"]);
  });

  it("recognizes Pi working and idle output", () => {
    expect(adapter.detectTerminalStatus?.("Thinking… esc to abort")?.status).toBe("working");
    expect(adapter.detectTerminalStatus?.("12,400 tokens | $0.02")?.status).toBe("idle");
  });
});

describe("Pi capability defaults", () => {
  it("keeps model and effort discovery dynamic", () => {
    expect(piDefaultCapabilities.models).toEqual([]);
    expect(piDefaultCapabilities.efforts).toEqual([]);
    expect(piDefaultCapabilities.modelEfforts).toEqual({});
  });

  it("parses Pi's native model table for WSL terminal discovery", () => {
    expect(
      parsePiModelList(`provider  model             context  max-out  thinking  images
anthropic  claude-sonnet-4  200K     64K      yes       yes
openai     gpt-4.1-mini      1M       32K      no        yes`),
    ).toEqual([
      { id: "anthropic/claude-sonnet-4", reasoning: true },
      { id: "openai/gpt-4.1-mini", reasoning: false },
    ]);
  });
});
