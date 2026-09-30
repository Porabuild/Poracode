import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, PromptSegment } from "@/shared/contracts";
import { SkillsService } from "../../skills/SkillsService";
import { createClaudeAdapter } from "./index";
import { buildSdkUserMessage } from "./sdkPrompt";

// A paired desktop built before per-skill invocations (v1.8.1 and earlier)
// builds every scanned Claude skill as `/name`. The host must still send a
// model-only skill in a form Claude can run.
describe("Claude skill segments from a client that predates per-skill invocation", () => {
  let root: string;
  let home: string;
  let projectLocation: ProjectLocation;

  async function writeSkill(name: string, extra: string) {
    const dir = join(home, ".claude", "skills", name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name} skill\n${extra}---\n\nReply ${name}.\n`,
      "utf8",
    );
  }

  beforeEach(async () => {
    vi.stubEnv("PORACODE_BUNDLED_SKILLS_DIR", "");
    root = await mkdtemp(join(tmpdir(), "poracode-claude-host-skills-"));
    home = join(root, "home");
    const projectPath = join(root, "project");
    await mkdir(projectPath, { recursive: true });
    projectLocation = { kind: "windows", path: projectPath };
    await writeSkill("useronly", "disable-model-invocation: true\n");
    await writeSkill("modelonly", "user-invocable: false\n");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  async function hostSegments(name: string): Promise<PromptSegment[]> {
    const adapter = createClaudeAdapter();
    const service = new SkillsService({
      adapters: new Map([["claude", adapter]]),
      homeDirectory: () => home,
      env: {},
    });
    const scan = await service.scan({ projectLocation, agentKind: "claude" });
    const skill = scan.skills.find((entry) => entry.name === name);
    if (!skill) throw new Error(`skill ${name} was not scanned`);
    // The old client ignores `skill.invocation` and uses the scan-wide form.
    const fromOldClient: PromptSegment[] = [
      {
        kind: "skill",
        name: skill.name,
        path: skill.skillFilePath,
        invocation: `/${skill.name}`,
        provider: skill.providerLabel,
        scope: skill.scope,
      },
      { kind: "text", content: " hi" },
    ];
    return service.filterPluginSkillSegments(fromOldClient, {
      agentKind: "claude",
      projectLocation,
    });
  }

  async function sdkText(segments: PromptSegment[]): Promise<string> {
    const message = await buildSdkUserMessage("", segments);
    const content = message.message.content as Array<{ type: string; text?: string }>;
    return content.map((block) => block.text ?? "").join("");
  }

  it("keeps a user-only skill as its slash command", async () => {
    const segments = await hostSegments("useronly");

    expect(await sdkText(segments)).toBe("/useronly hi");
    expect(createClaudeAdapter().formatPromptSegments?.(segments)).toBe("/useronly hi");
  });

  it("turns a model-only skill back into a request to the model", async () => {
    const segments = await hostSegments("modelonly");

    expect(await sdkText(segments)).toBe("Use the modelonly skill. hi");
    expect(createClaudeAdapter().formatPromptSegments?.(segments)).toBe(
      "Use the modelonly skill. hi",
    );
  });
});
