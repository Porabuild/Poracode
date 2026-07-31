import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillScanResult } from "@/shared/contracts";
import { buildSkillSlashCommands, useSkills } from "./useSkills";

const { scanSkillsMock } = vi.hoisted(() => ({
  scanSkillsMock: vi.fn<() => Promise<SkillScanResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ scanSkills: scanSkillsMock }),
}));

const invocationByProvider = {
  claude: "slash",
  codex: "dollar",
  gemini: "prompt",
  opencode: "prompt",
  copilot: "slash",
  commandcode: "slash",
  cursor: "slash",
  grok: "slash",
  antigravity: "prompt",
  pi: "skill",
} as const;

function emptyScan(): SkillScanResult {
  return {
    skills: [],
    effectiveSkillIds: [],
    invocation: null,
    issues: [],
    canLinkToGlobal: true,
  };
}

describe("useSkills", () => {
  beforeEach(() => {
    scanSkillsMock.mockReset();
  });

  it("shows the cached result immediately while refreshing a remounted scope", async () => {
    const initial = emptyScan();
    scanSkillsMock.mockResolvedValueOnce(initial);
    const first = renderHook(() => useSkills(undefined, undefined, "CacheTest"));
    await waitFor(() => expect(first.result.current.scan).toBe(initial));
    first.unmount();

    const refreshed = { ...emptyScan(), canLinkToGlobal: false };
    let resolveRefresh!: (result: SkillScanResult) => void;
    scanSkillsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const second = renderHook(() => useSkills(undefined, undefined, "CacheTest"));

    expect(second.result.current.scan).toBe(initial);
    await waitFor(() => expect(scanSkillsMock).toHaveBeenCalledTimes(2));
    act(() => resolveRefresh(refreshed));
    await waitFor(() => expect(second.result.current.scan).toBe(refreshed));
  });
});

describe("buildSkillSlashCommands", () => {
  it.each(Object.entries(invocationByProvider))(
    "adds the unified managed skill to the %s composer menu",
    (provider, invocation) => {
      const id = `project:agents:unique-managed-skill:on`;
      const scan: SkillScanResult = {
        skills: [
          {
            id,
            name: "unique-managed-skill",
            description: "Unique managed test skill",
            folderName: "unique-managed-skill",
            absolutePath: "/project/.agents/skills/unique-managed-skill",
            skillFilePath: "/project/.agents/skills/unique-managed-skill/SKILL.md",
            rootPath: "/project/.agents/skills",
            providerId: "agents",
            providerLabel: "Shared agents",
            scope: "project",
            scopeLabel: "Project",
            origin: "managed",
            enabled: true,
            mutable: true,
            valid: true,
            linked: false,
          },
        ],
        effectiveSkillIds: [id],
        invocation,
        issues: [],
        canLinkToGlobal: true,
      };

      expect(buildSkillSlashCommands(scan)).toEqual([
        expect.objectContaining({
          id: "unique-managed-skill",
          section: "skills",
          skillName: "unique-managed-skill",
          skillInvocation:
            invocation === "dollar"
              ? "$unique-managed-skill"
              : invocation === "skill"
                ? "/skill:unique-managed-skill"
                : invocation === "prompt"
                  ? "Use the unique-managed-skill skill."
                  : "/unique-managed-skill",
        }),
      ]);
      expect(provider).toBeTruthy();
    },
  );
});
