import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAdapter } from "../../agents/base";
import type { ProjectLocation, SessionRef, ThreadConfig } from "@/shared/contracts";

// applyClaudeMergedSettingsRewrite's only I/O is the merged-settings file write;
// mock it so the swap branch is unit-testable without touching disk.
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
import { applyClaudeMergedSettingsRewrite, mergeCliHookExtraArgs } from "./cliHookArgs";

function adapter(kind: string): AgentAdapter {
  return { kind } as unknown as AgentAdapter;
}

const NATIVE: ProjectLocation = { kind: "windows", path: "C:\\proj" };
const sessionRef = { id: "sess-1" } as unknown as SessionRef;

describe("mergeCliHookExtraArgs", () => {
  it("returns argv unchanged when there are no hook extras", () => {
    const args = ["codex", "--config", "x"];
    // Same reference — nothing to merge.
    expect(mergeCliHookExtraArgs(adapter("codex"), args, [], "")).toBe(args);
  });

  it("appends extras for a generic adapter (fallback path)", () => {
    expect(mergeCliHookExtraArgs(adapter("gemini"), ["gemini"], ["--flag"], "")).toEqual([
      "gemini",
      "--flag",
    ]);
  });

  it("appends extras for a codex launch (no trailing positionals)", () => {
    // Launch: args[0] !== "resume", no sessionRef, empty prompt -> insertAt = args.length.
    expect(mergeCliHookExtraArgs(adapter("codex"), ["codex"], ["--enable", "hooks"], "")).toEqual([
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
      adapter("codex"),
      ["resume", "sess-1"],
      ["--enable", "hooks"],
      "",
      sessionRef,
    );
    expect(out).toEqual(["resume", "--enable", "hooks", "sess-1"]);
  });

  it("counts a non-empty prompt as an extra trailing positional for codex resume", () => {
    const out = mergeCliHookExtraArgs(
      adapter("codex"),
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
      adapter("claude"),
      ["claude", "-p", "hello"],
      ["--hook", "x"],
      "hello",
    );
    expect(out).toEqual(["claude", "-p", "--hook", "x", "hello"]);
  });

  it("appends claude extras when there is no prompt", () => {
    expect(mergeCliHookExtraArgs(adapter("claude"), ["claude"], ["--hook", "x"], "")).toEqual([
      "claude",
      "--hook",
      "x",
    ]);
  });
});

describe("applyClaudeMergedSettingsRewrite", () => {
  beforeEach(() => {
    vi.mocked(prepareClaudeMergedSettingsFile).mockReset();
  });

  it("passes through unchanged for a non-Claude adapter", async () => {
    const args = ["codex", "--settings", "/x"];
    const config = { effort: "ultracode" } as ThreadConfig;
    await expect(
      applyClaudeMergedSettingsRewrite(adapter("codex"), args, config, NATIVE),
    ).resolves.toBe(args);
    expect(prepareClaudeMergedSettingsFile).not.toHaveBeenCalled();
  });

  it("passes through when no inline flags need merging", async () => {
    const args = ["claude", "--settings", "/x"];
    const config = { effort: "high" } as ThreadConfig; // not ultracode, fast unset
    await expect(
      applyClaudeMergedSettingsRewrite(adapter("claude"), args, config, NATIVE),
    ).resolves.toBe(args);
    expect(prepareClaudeMergedSettingsFile).not.toHaveBeenCalled();
  });

  it("passes through when there is no --settings flag to swap", async () => {
    const args = ["claude", "-p", "hi"];
    const config = { effort: "ultracode" } as ThreadConfig;
    await expect(
      applyClaudeMergedSettingsRewrite(adapter("claude"), args, config, NATIVE),
    ).resolves.toBe(args);
    expect(prepareClaudeMergedSettingsFile).not.toHaveBeenCalled();
  });

  it("swaps the --settings path for the merged file when flags are present", async () => {
    vi.mocked(prepareClaudeMergedSettingsFile).mockResolvedValue("/merged/settings.json");
    const args = ["claude", "--settings", "/orig/path"];
    const config = { effort: "ultracode", fast: true } as ThreadConfig;
    const out = await applyClaudeMergedSettingsRewrite(adapter("claude"), args, config, NATIVE);
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
    await expect(
      applyClaudeMergedSettingsRewrite(adapter("claude"), args, config, NATIVE),
    ).resolves.toBe(args);
  });
});
