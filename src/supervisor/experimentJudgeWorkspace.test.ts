import { describe, expect, it, vi } from "vitest";
import type { JudgeExperimentCandidate, ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient } from "./wsl/bridge/client";
import { createExperimentJudgeWorkspace } from "./experimentJudgeWorkspace";

const location: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/demo/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
};

const candidates: JudgeExperimentCandidate[] = [
  { threadId: "secret-claude", diff: "diff --git a/one.ts b/one.ts\n+one" },
  { threadId: "secret-codex", diff: "diff --git a/two.ts b/two.ts\n+two" },
];

describe("createExperimentJudgeWorkspace", () => {
  it("writes anonymous full diffs inside the selected WSL distro and removes them", async () => {
    const mkdir = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    const writeNewFile = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});
    const rm = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    const wslClient = { mkdir, writeNewFile, rm } as unknown as WslBridgeClient;

    const workspace = await createExperimentJudgeWorkspace(
      location,
      "Implement it",
      candidates,
      wslClient,
    );

    expect(workspace.location).toMatchObject({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: expect.stringMatching(/^\/tmp\/poracode-judge-[0-9a-f-]+$/u),
      uncPath: expect.stringContaining("poracode-judge-"),
    });
    expect(mkdir).toHaveBeenCalledOnce();
    expect(writeNewFile).toHaveBeenCalledTimes(4);
    const written = new Map(
      writeNewFile.mock.calls.map((call) => [
        String(call[1]).split("/").at(-1),
        (call[2] as Buffer).toString("utf8"),
      ]),
    );
    expect(written.get("task.txt")).toBe("Implement it");
    expect(written.get("solution-1.patch")).toBe(candidates[0]!.diff);
    expect(written.get("solution-2.patch")).toBe(candidates[1]!.diff);
    expect(written.get("manifest.json")).not.toContain("secret-claude");
    expect(written.get("manifest.json")).not.toContain("secret-codex");

    await workspace.cleanup();
    expect(rm).toHaveBeenCalledWith(
      expect.objectContaining({ distro: "Ubuntu", linuxPath: "/tmp" }),
      expect.stringMatching(/^\/tmp\/poracode-judge-[0-9a-f-]+$/u),
      { recursive: true, force: true },
    );
  });

  it("fails before judging when the WSL bridge is unavailable", async () => {
    await expect(createExperimentJudgeWorkspace(location, "Task", candidates)).rejects.toThrow(
      'WSL bridge unavailable for experiment judge in distro "Ubuntu"',
    );
  });
});
