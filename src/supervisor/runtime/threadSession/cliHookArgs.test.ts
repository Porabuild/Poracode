import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAdapter } from "../../agents/base";
import type { ProjectLocation, SessionRef, ThreadConfig } from "@/shared/contracts";

// rewriteClaudeLaunchArgsForConfig's only I/O is the merged-settings file
// write; mock it so the swap branch is unit-testable without touching disk.
vi.mock("../../agents/claude/mergedSettings", () => ({
  prepareClaudeMergedSettingsFile: vi.fn<
    (
      path: string,
      location: ProjectLocation,
      flags: Record<string, unknown>,
    ) => Promise<string | undefined>
  >(async () => "/merged/settings.json"),
}));

import { prepareClaudeMergedSettingsFile } from "../../agents/claude/mergedSettings";
import {
  claudeExtraArgsPosition,
  rewriteClaudeLaunchArgsForConfig,
} from "../../agents/claude/argv";
import { codexExtraArgsPosition } from "../../agents/codex/argv";
import { applyLaunchArgsConfigRewrite, mergeCliHookExtraArgs } from "./cliHookArgs";

const codexAdapter = { kind: "codex", extraArgsPosition: codexExtraArgsPosition } as AgentAdapter;
const claudeAdapter = {
  kind: "claude",
  extraArgsPosition: claudeExtraArgsPosition,
  rewriteLaunchArgsForConfig: rewriteClaudeLaunchArgsForConfig,
} as AgentAdapter;
const genericAdapter = { kind: "gemini" } as AgentAdapter;

const NATIVE: ProjectLocation = { kind: "windows", path: "C:\\proj" };
const sessionRef = { id: "sess-1" } as unknown as SessionRef;

describe("mergeCliHookExtraArgs", () => {
  it("returns argv unchanged when there are no hook extras", () => {
    const args = ["codex", "--config", "x"];
    // Same reference — nothing to merge.
    expect(mergeCliHookExtraArgs(codexAdapter, args, [], "")).toBe(args);
  });

  it("appends extras for an adapter without extraArgsPosition (fallback path)", () => {
    expect(mergeCliHookExtraArgs(genericAdapter, ["gemini"], ["--flag"], "")).toEqual([
      "gemini",
      "--flag",
    ]);
  });

  it("appends extras for a codex launch (no trailing positionals)", () => {
    // Launch: args[0] !== "resume", no sessionRef, empty prompt -> insertAt = args.length.
    expect(mergeCliHookExtraArgs(codexAdapter, ["codex"], ["--enable", "hooks"], "")).toEqual([
      "codex",
      "--enable",
      "hooks",
    ]);
  });

  it("inserts codex resume extras before the session-id positional", () => {
    // resume argv is ["resume", "<sessionId>"]; sessionRef is present, no prompt.
    // The hook flags must land between "resume" and the id so Codex doesn't read
    // `--enable <feature>` as trailing user input.
    const out = mergeCliHookExtraArgs(
      codexAdapter,
      ["resume", "sess-1"],
      ["--enable", "hooks"],
      "",
      sessionRef,
    );
    expect(out).toEqual(["resume", "--enable", "hooks", "sess-1"]);
  });

  it("counts a non-empty prompt as an extra trailing positional for codex resume", () => {
    const out = mergeCliHookExtraArgs(
      codexAdapter,
      ["resume", "sess-1"],
      ["--enable", "hooks"],
      "do the thing",
      sessionRef,
    );
    // sessionRef + prompt = 2 trailing positionals -> insertAt = max(2 - 2, 1) = 1.
    expect(out).toEqual(["resume", "--enable", "hooks", "sess-1"]);
  });

  it("inserts claude extras before the last positional when a prompt is present", () => {
    const out = mergeCliHookExtraArgs(
      claudeAdapter,
      ["claude", "-p", "hello"],
      ["--hook", "x"],
      "hello",
    );
    expect(out).toEqual(["claude", "-p", "--hook", "x", "hello"]);
  });

  it("appends claude extras when there is no prompt", () => {
    expect(mergeCliHookExtraArgs(claudeAdapter, ["claude"], ["--hook", "x"], "")).toEqual([
      "claude",
      "--hook",
      "x",
    ]);
  });
});

describe("applyLaunchArgsConfigRewrite", () => {
  beforeEach(() => {
    vi.mocked(prepareClaudeMergedSettingsFile).mockReset();
  });

  it("passes through unchanged for an adapter without a rewrite hook", async () => {
    const args = ["codex", "--settings", "/x"];
    const config = { effort: "ultracode" } as ThreadConfig;
    await expect(applyLaunchArgsConfigRewrite(codexAdapter, args, config, NATIVE)).resolves.toBe(
      args,
    );
    expect(prepareClaudeMergedSettingsFile).not.toHaveBeenCalled();
  });

  it("passes through when no inline flags need merging", async () => {
    const args = ["claude", "--settings", "/x"];
    const config = { effort: "high" } as ThreadConfig; // not ultracode, fast unset
    await expect(applyLaunchArgsConfigRewrite(claudeAdapter, args, config, NATIVE)).resolves.toBe(
      args,
    );
    expect(prepareClaudeMergedSettingsFile).not.toHaveBeenCalled();
  });

  it("passes through when there is no --settings flag to swap", async () => {
    const args = ["claude", "-p", "hi"];
    const config = { effort: "ultracode" } as ThreadConfig;
    await expect(applyLaunchArgsConfigRewrite(claudeAdapter, args, config, NATIVE)).resolves.toBe(
      args,
    );
    expect(prepareClaudeMergedSettingsFile).not.toHaveBeenCalled();
  });

  it("swaps the --settings path for the merged file when flags are present", async () => {
    vi.mocked(prepareClaudeMergedSettingsFile).mockResolvedValue("/merged/settings.json");
    const args = ["claude", "--settings", "/orig/path"];
    const config = { effort: "ultracode", fast: true } as ThreadConfig;
    const out = await applyLaunchArgsConfigRewrite(claudeAdapter, args, config, NATIVE);
    expect(out).toEqual(["claude", "--settings", "/merged/settings.json"]);
    expect(prepareClaudeMergedSettingsFile).toHaveBeenCalledWith("/orig/path", NATIVE, {
      ultracode: true,
      fastMode: true,
    });
  });

  it("passes through when the merged-file write fails", async () => {
    vi.mocked(prepareClaudeMergedSettingsFile).mockResolvedValue(undefined);
    const args = ["claude", "--settings", "/orig/path"];
    const config = { effort: "ultracode" } as ThreadConfig;
    await expect(applyLaunchArgsConfigRewrite(claudeAdapter, args, config, NATIVE)).resolves.toBe(
      args,
    );
  });
});
