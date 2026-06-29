import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { buildSkillMarkdown } from "@/shared/skills";
import { parseSkillFrontmatter, SkillsService } from "./skills";

describe("parseSkillFrontmatter", () => {
  it("reads name and description", () => {
    const md = "---\nname: my-skill\ndescription: Use when testing.\n---\n\n# Body\n";
    expect(parseSkillFrontmatter(md)).toEqual({
      name: "my-skill",
      description: "Use when testing.",
    });
  });

  it("unquotes a JSON-quoted description with colons", () => {
    const md = '---\nname: x\ndescription: "Use when: building. Keywords: a, b."\n---\nbody';
    expect(parseSkillFrontmatter(md).description).toBe("Use when: building. Keywords: a, b.");
  });

  it("ignores nested metadata keys", () => {
    const md = "---\nname: x\ndescription: d\nmetadata:\n  name: not-this\n---\n";
    expect(parseSkillFrontmatter(md)).toEqual({ name: "x", description: "d" });
  });

  it("returns empty when there is no frontmatter", () => {
    expect(parseSkillFrontmatter("# Just markdown")).toEqual({});
  });

  it("parses CRLF (Windows) files", () => {
    const md = "---\r\nname: my-skill\r\ndescription: Use when testing.\r\n---\r\n\r\n# Body\r\n";
    expect(parseSkillFrontmatter(md)).toEqual({
      name: "my-skill",
      description: "Use when testing.",
    });
  });

  it("strips a leading UTF-8 BOM", () => {
    const md = "﻿---\nname: x\ndescription: d\n---\n";
    expect(parseSkillFrontmatter(md)).toEqual({ name: "x", description: "d" });
  });

  it("captures metadata.source", () => {
    const md = "---\nname: x\ndescription: d\nmetadata:\n  source: code-review\n---\n";
    expect(parseSkillFrontmatter(md).source).toBe("code-review");
  });

  it("round-trips a name containing a colon via buildSkillMarkdown", () => {
    const md = buildSkillMarkdown({ name: "Use: this thing", description: "d" });
    expect(parseSkillFrontmatter(md)).toMatchObject({ name: "Use: this thing", description: "d" });
  });
});

describe("SkillsService (project scopes)", () => {
  let dir: string;
  let location: ProjectLocation;
  const service = new SkillsService();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lc-skills-test-"));
    location = { kind: "posix", path: dir };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const claudeDir = () => join(dir, ".claude", "skills");
  const agentsDir = () => join(dir, ".agents", "skills");
  const skillContext = () => ({ projectLocation: location });

  function projectSkills(scan: Awaited<ReturnType<SkillsService["scanSkills"]>>) {
    return scan.skills.filter((s) => s.level === "project");
  }

  it("creates, scans, and reads a skill in a project scope", async () => {
    const created = await service.createSkill({
      ...skillContext(),
      scopeDir: claudeDir(),
      folderName: "demo",
      name: "Demo Skill",
      description: "Use when demoing.",
      body: "# Demo\n\nDo the thing.",
    });
    expect(created.absolutePath).toBe(join(claudeDir(), "demo"));

    const scan = await service.scanSkills({ projectLocation: location });
    const found = projectSkills(scan).find((s) => s.folderName === "demo");
    expect(found).toBeDefined();
    expect(found?.name).toBe("Demo Skill");
    expect(found?.description).toBe("Use when demoing.");
    expect(found?.rootId).toBe("claude");
    expect(found?.hasSkillFile).toBe(true);

    const detail = await service.readSkill({
      ...skillContext(),
      absolutePath: created.absolutePath,
    });
    expect(detail.content).toContain('name: "Demo Skill"');
    expect(detail.files.some((f) => f.path === "SKILL.md")).toBe(true);
  });

  it("rejects creating outside a skills directory", async () => {
    await expect(
      service.createSkill({
        ...skillContext(),
        scopeDir: join(dir, "random"),
        folderName: "x",
        name: "X",
        description: "",
      }),
    ).rejects.toThrow(/not a skills directory/i);
  });

  it("copies a skill to another provider root", async () => {
    await service.createSkill({
      ...skillContext(),
      scopeDir: claudeDir(),
      folderName: "shared",
      name: "Shared",
      description: "d",
    });
    await service.transferSkill({
      ...skillContext(),
      fromPath: join(claudeDir(), "shared"),
      toScopeDir: agentsDir(),
      move: false,
      overwrite: false,
    });

    const scan = await service.scanSkills({ projectLocation: location });
    const roots = projectSkills(scan)
      .filter((s) => s.folderName === "shared")
      .map((s) => s.rootId)
      .sort();
    expect(roots).toEqual(["agents", "claude"]);
  });

  it("optimizer plans copies for missing roots, then reports in-sync", async () => {
    await service.createSkill({
      ...skillContext(),
      scopeDir: claudeDir(),
      folderName: "only-claude",
      name: "Only Claude",
      description: "d",
    });

    const plan = await service.optimizeSkills({
      projectLocation: location,
      level: "project",
      apply: false,
    });
    expect(plan.applied).toBe(false);
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]?.fromScopeId).toBe("project:claude");
    expect(plan.ops[0]?.toScopeId).toBe("project:agents");

    const applied = await service.optimizeSkills({
      projectLocation: location,
      level: "project",
      apply: true,
    });
    expect(applied.applied).toBe(true);
    expect(applied.ops).toHaveLength(1);

    const after = await service.optimizeSkills({
      projectLocation: location,
      level: "project",
      apply: false,
    });
    expect(after.ops).toHaveLength(0);
  });

  it("re-syncs a divergent copy after an edit (the newest wins)", async () => {
    // Same folder in both roots, then edit only the claude copy.
    await service.createSkill({
      ...skillContext(),
      scopeDir: claudeDir(),
      folderName: "shared",
      name: "Shared",
      description: "v1",
    });
    await service.transferSkill({
      ...skillContext(),
      fromPath: join(claudeDir(), "shared"),
      toScopeDir: agentsDir(),
      move: false,
      overwrite: false,
    });

    // Edit the claude copy so the two roots diverge.
    await service.writeSkill({
      ...skillContext(),
      absolutePath: join(claudeDir(), "shared"),
      content: "---\nname: Shared\ndescription: v2-edited\n---\n\n# Updated body\n",
    });

    const plan = await service.optimizeSkills({
      projectLocation: location,
      level: "project",
      apply: true,
    });
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]?.kind).toBe("update");
    expect(plan.ops[0]?.fromScopeId).toBe("project:claude");
    expect(plan.ops[0]?.toScopeId).toBe("project:agents");

    // The agents copy now matches the edited claude copy.
    const agentsContent = await readFile(join(agentsDir(), "shared", "SKILL.md"), "utf8");
    expect(agentsContent).toContain("v2-edited");

    const after = await service.optimizeSkills({
      projectLocation: location,
      level: "project",
      apply: false,
    });
    expect(after.ops).toHaveLength(0);
  });

  it("does not mirror malformed folders (no SKILL.md) across roots", async () => {
    // A stray folder with no SKILL.md under .claude/skills should be ignored.
    await mkdir(join(claudeDir(), "junk"), { recursive: true });
    const plan = await service.optimizeSkills({
      projectLocation: location,
      level: "project",
      apply: false,
    });
    expect(plan.ops).toHaveLength(0);
  });

  it("records metadata.source for a marketplace-installed skill", async () => {
    await service.installMarketplaceSkill({
      ...skillContext(),
      catalogId: "code-review",
      targetScopeDir: agentsDir(),
    });
    const scan = await service.scanSkills({ projectLocation: location });
    const found = projectSkills(scan).find((s) => s.folderName === "code-review");
    expect(found?.source).toBe("code-review");
  });

  it("renames a skill folder", async () => {
    const created = await service.createSkill({
      ...skillContext(),
      scopeDir: claudeDir(),
      folderName: "old-name",
      name: "Renamable",
      description: "",
    });
    const renamed = await service.renameSkill({
      ...skillContext(),
      absolutePath: created.absolutePath,
      nextFolderName: "new-name",
    });
    expect(renamed.absolutePath).toBe(join(claudeDir(), "new-name"));
    const scan = await service.scanSkills({ projectLocation: location });
    const folders = projectSkills(scan).map((s) => s.folderName);
    expect(folders).toContain("new-name");
    expect(folders).not.toContain("old-name");
  });

  it("rejects mutating a relative or non-skills path", async () => {
    await expect(service.deleteSkill({ absolutePath: ".claude/skills/x" })).rejects.toThrow(
      /must be absolute/i,
    );
    await expect(
      service.writeSkill({
        ...skillContext(),
        absolutePath: join(dir, "notskills", "x"),
        content: "",
      }),
    ).rejects.toThrow(/outside a skills directory/i);
  });

  it("rejects a lookalike skills directory outside the operation context", async () => {
    await expect(
      service.writeSkill({
        ...skillContext(),
        absolutePath: join(dir, "outside", ".agents", "skills", "outside"),
        content: "x",
      }),
    ).rejects.toThrow(/outside a skills directory/i);
  });

  it("writeSkill ignores '..' traversal by normalizing the path", async () => {
    // Resolves to <dir>/.claude/skills/x — still inside a skills dir, so allowed,
    // but a traversal that escaped would be rejected.
    await expect(
      service.writeSkill({
        ...skillContext(),
        absolutePath: join(claudeDir(), "sub", "..", "..", "..", "..", "etc", "passwd"),
        content: "x",
      }),
    ).rejects.toThrow(/outside a skills directory/i);
  });

  it("installs a marketplace skill and refuses duplicates", async () => {
    const result = await service.installMarketplaceSkill({
      ...skillContext(),
      catalogId: "code-review",
      targetScopeDir: agentsDir(),
    });
    expect(result.folderName).toBe("code-review");
    const body = await readFile(join(result.absolutePath, "SKILL.md"), "utf8");
    expect(body).toContain('name: "Code Review"');

    await expect(
      service.installMarketplaceSkill({
        ...skillContext(),
        catalogId: "code-review",
        targetScopeDir: agentsDir(),
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("deletes a skill", async () => {
    const created = await service.createSkill({
      ...skillContext(),
      scopeDir: claudeDir(),
      folderName: "temp",
      name: "Temp",
      description: "",
    });
    await service.deleteSkill({ ...skillContext(), absolutePath: created.absolutePath });
    const scan = await service.scanSkills({ projectLocation: location });
    expect(projectSkills(scan).some((s) => s.folderName === "temp")).toBe(false);
  });
});
