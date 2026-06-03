import { describe, expect, it } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createAntigravityAdapter } from ".";
import { buildAntigravityArgs } from "./argv";
import { ANTIGRAVITY_MANAGED_MODEL_ID } from "./detection";
import { detectAntigravityInvalidSessionRef } from "./session";
import { detectAntigravityTerminalStatus } from "./terminal";

describe("buildAntigravityArgs", () => {
  const config: ThreadConfig = { model: ANTIGRAVITY_MANAGED_MODEL_ID };

  it("uses agy prompt-interactive for initial prompts without forwarding a model", () => {
    const args = buildAntigravityArgs({ ...config, effort: "high" }, "hello");

    expect(args).toEqual(["--prompt-interactive", "hello"]);
    expect(args).not.toContain("--model");
    expect(args).not.toContain(ANTIGRAVITY_MANAGED_MODEL_ID);
    expect(args).not.toContain("high");
  });

  it("uses --conversation when resuming a known conversation", () => {
    expect(buildAntigravityArgs(config, "", "conversation-id")).toEqual([
      "--conversation",
      "conversation-id",
    ]);
  });

  it("maps Lightcode bypass and sandbox config to agy flags", () => {
    expect(
      buildAntigravityArgs({ ...config, approvalPolicy: "yolo", sandboxMode: "sandbox" }, ""),
    ).toEqual(["--dangerously-skip-permissions", "--sandbox"]);
  });
});

describe("createAntigravityAdapter", () => {
  const project: ProjectLocation = {
    kind: "windows",
    path: "C:\\demo",
  };

  it("declares the real agy binary and permission override capability", () => {
    const adapter = createAntigravityAdapter();

    expect(adapter.kind).toBe("antigravity");
    expect(adapter.binary).toBe("agy");
    expect(adapter.update).toEqual({
      builtIn: { binary: "agy", args: ["update"] },
      latestVersionUrls: [
        "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json",
      ],
    });
    expect(adapter.capabilities.models).toEqual([
      {
        id: ANTIGRAVITY_MANAGED_MODEL_ID,
        label: "Auto",
        description: "Model selected by agy from the signed-in account",
      },
    ]);
    expect(adapter.capabilities.approvalPolicies.map((policy) => policy.id)).toEqual([
      "default",
      "yolo",
    ]);
    expect(adapter.defaultOneShotModel).toBe(ANTIGRAVITY_MANAGED_MODEL_ID);
  });

  it("builds agy launch, resume, and one-shot commands", () => {
    const adapter = createAntigravityAdapter();
    const config: ThreadConfig = { model: ANTIGRAVITY_MANAGED_MODEL_ID };

    expect(adapter.buildLaunchArgv(project, config, "hi")).toMatchObject({
      binary: "agy",
      args: ["--prompt-interactive", "hi"],
    });
    expect(
      adapter.buildResumeArgv(project, config, "next", {
        providerSessionId: "conversation-id",
        discoveredAt: "2026-05-20T00:00:00.000Z",
      }),
    ).toMatchObject({
      binary: "agy",
      args: ["--conversation", "conversation-id", "--prompt-interactive", "next"],
    });
    expect(
      adapter.buildOneShotCommand?.(ANTIGRAVITY_MANAGED_MODEL_ID, undefined, "summarize"),
    ).toEqual({
      command: "agy",
      args: ["-p", "summarize"],
      stdin: "",
      // Isolate the cwd so the one-shot's last_conversations.json[cwd] write
      // can't be mistaken for the real interactive session (see index.ts).
      isolateCwd: true,
      // agy print mode emits its answer only when attached to a terminal.
      pty: true,
    });
  });
});

describe("detectAntigravityTerminalStatus", () => {
  it("detects the signed-in agy idle prompt seen in the real TUI", () => {
    const text = [
      "      ▄▀▀▄        Antigravity CLI 1.0.0",
      "     ▀▀▀▀▀▀       user@example.com",
      "    ▀▀▀▀▀▀▀▀      Gemini 3.5 Flash (High)",
      "   ▄▀▀    ▀▀▄     ~/work/lightcode",
      "",
      "────────────────────────────────────────────────────────────────────────────────",
      ">",
      "────────────────────────────────────────────────────────────────────────────────",
      "? for shortcuts                                          Gemini 3.5 Flash (High)",
    ].join("\n");

    expect(detectAntigravityTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("detects action-required prompts before idle fallbacks", () => {
    const result = detectAntigravityTerminalStatus("✋ Action Required\n>\n? for shortcuts");

    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects the visible agy braille loader as working", () => {
    expect(detectAntigravityTerminalStatus("⡿ Generating...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("returns null when no Antigravity prompt indicators are present", () => {
    expect(detectAntigravityTerminalStatus("random output")).toBeNull();
  });
});

describe("detectAntigravityInvalidSessionRef", () => {
  it("detects invalid conversation messages", () => {
    expect(detectAntigravityInvalidSessionRef("invalid conversation: missing")).toBe(true);
    expect(detectAntigravityInvalidSessionRef("conversation not found")).toBe(true);
  });

  it("ignores unrelated output", () => {
    expect(detectAntigravityInvalidSessionRef("Antigravity CLI ready")).toBe(false);
  });
});
