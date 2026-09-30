import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSlashCommand, PromptSegment } from "@/shared/contracts";
import { skillSegmentFromSlashCommand } from "@/shared/promptContent";
import { buildSkillSlashCommands } from "@/renderer/components/skills/useSkills";
import { resolveAvailableSlashCommands } from "@/renderer/components/thread/threadSlashCommands";
import { SkillsService } from "@/supervisor/skills/SkillsService";
import { createClaudeAdapter } from "@/supervisor/agents/claude";
import { buildSdkUserMessage } from "@/supervisor/agents/claude/sdkPrompt";

// Scan -> composer -> Claude prompt for skills that only one side may start.
describe("Claude skill invocation from scanned skills", () => {
  let root: string;
  let home: string;
  let projectPath: string;

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
    root = await mkdtemp(join(tmpdir(), "poracode-claude-skills-"));
    home = join(root, "home");
    projectPath = join(root, "project");
    await mkdir(projectPath, { recursive: true });
    await writeSkill("useronly", "disable-model-invocation: true\n");
    await writeSkill("modelonly", "user-invocable: false\n");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  async function composerCommands(): Promise<Map<string, AgentSlashCommand>> {
    const adapter = createClaudeAdapter();
    const service = new SkillsService({
      adapters: new Map([["claude", adapter]]),
      homeDirectory: () => home,
      env: {},
    });
    const scan = await service.scan({
      projectLocation: { kind: "windows", path: projectPath },
      agentKind: "claude",
    });
    // A capability cache written before this rule existed still offers the
    // model-only skill as `/modelonly`. The scanned entry must replace it.
    const staleCached: AgentSlashCommand[] = [
      {
        id: "modelonly",
        label: "modelonly",
        section: "skills",
        skillName: "modelonly",
        skillInvocation: "/modelonly",
        skillProvider: "Claude",
        skillScope: "global",
      },
    ];
    const commands = resolveAvailableSlashCommands(undefined, staleCached, {
      skillCommands: buildSkillSlashCommands(scan),
    });
    return new Map(
      commands.filter((command) => command.section === "skills").map((c) => [c.id, c]),
    );
  }

  function promptFor(command: AgentSlashCommand | undefined): PromptSegment[] {
    const skill = skillSegmentFromSlashCommand(command);
    if (!skill) throw new Error(`no skill segment for ${command?.id}`);
    return [skill, { kind: "text", content: " hi" }];
  }

  async function sdkText(segments: PromptSegment[]): Promise<string> {
    const message = await buildSdkUserMessage("", segments);
    const content = message.message.content as Array<{ type: string; text?: string }>;
    return content.map((block) => block.text ?? "").join("");
  }

  it("sends a user-only skill as its slash command", async () => {
    const segments = promptFor((await composerCommands()).get("useronly"));

    expect(await sdkText(segments)).toBe("/useronly hi");
    expect(createClaudeAdapter().formatPromptSegments?.(segments)).toBe("/useronly hi");
  });

  it("asks the model to use a model-only skill", async () => {
    const segments = promptFor((await composerCommands()).get("modelonly"));

    expect(await sdkText(segments)).toBe("Use the modelonly skill. hi");
    expect(createClaudeAdapter().formatPromptSegments?.(segments)).toBe(
      "Use the modelonly skill. hi",
    );
  });
});
