import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "../agents/base";
import { SkillsService } from "./SkillsService";

async function writeSkill(path: string, name: string, description = `${name} description`) {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "SKILL.md"),
    `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`,
    "utf8",
  );
}

describe("SkillsService", () => {
  let root: string;
  let home: string;
  let projectPath: string;
  let projectLocation: ProjectLocation;
  let service: SkillsService;
  let adapters: ReadonlyMap<string, AgentAdapter>;

  beforeEach(async () => {
    vi.stubEnv("PORACODE_BUNDLED_SKILLS_DIR", "");
    root = await mkdtemp(join(tmpdir(), "poracode-skills-"));
    home = join(root, "home");
    projectPath = join(root, "project");
    await mkdir(projectPath, { recursive: true });
    projectLocation = { kind: "windows", path: projectPath };
    const claude = {
      kind: "claude",
      label: "Claude Code",
      binary: "claude",
      capabilities: {},
      skillSupport: {
        roots: [
          {
            id: "claude",
            label: "Claude Code",
            globalPath: ".claude/skills",
            projectPath: ".claude/skills",
          },
        ],
        projectionRoots: [
          {
            id: "claude",
            label: "Claude Code",
            globalPath: ".claude/skills",
            projectPath: ".claude/skills",
          },
        ],
        invocation: "slash",
      },
    } as unknown as AgentAdapter;
    adapters = new Map([["claude", claude]]);
    service = new SkillsService({
      adapters,
      homeDirectory: () => home,
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("discovers provider skills and imports a managed copy", async () => {
    const source = join(home, ".claude", "skills", "review");
    await writeSkill(source, "review", "Review changes");

    const before = await service.scan({ projectLocation });
    expect(before.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "review",
          providerId: "claude",
          scope: "global",
          importState: "available",
        }),
      ]),
    );

    const result = await service.import({
      skills: [
        {
          sourcePath: source,
          destinationScope: "global",
          mode: "copy",
          replace: false,
          projectLocation,
        },
      ],
    });
    expect(result.imported).toEqual([join(home, ".agents", "skills", "review")]);
    expect(await readFile(join(result.imported[0]!, "SKILL.md"), "utf8")).toContain(
      "Review changes",
    );

    const after = await service.scan({ projectLocation });
    expect(
      after.skills.find((skill) => skill.providerId === "claude" && skill.name === "review"),
    ).toMatchObject({ importState: "already-imported" });
  });

  it("imports Poracode-only skills without projecting them into provider folders", async () => {
    const source = join(home, ".claude", "skills", "private-review");
    await writeSkill(source, "private-review", "Private review");

    const result = await service.import({
      skills: [
        {
          sourcePath: source,
          destinationScope: "global",
          availability: "poracode",
          mode: "copy",
          replace: false,
          projectLocation,
        },
      ],
    });

    expect(result.imported).toEqual([join(home, ".poracode", "skills", "private-review")]);
    await expect(
      readFile(join(home, ".claude", "skills", "private-review", "SKILL.md"), "utf8"),
    ).resolves.toContain("Private review");
    await rm(source, { recursive: true, force: true });
    await service.prepareForLaunch(projectLocation, "claude");
    await expect(
      readFile(join(home, ".claude", "skills", "private-review", "SKILL.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const scan = await service.scan({ projectLocation, agentKind: "claude" });
    const privateSkill = scan.skills.find((skill) => skill.name === "private-review");
    expect(privateSkill).toMatchObject({
      providerId: "poracode",
      availability: "poracode",
      origin: "managed",
    });
    expect(scan.effectiveSkillIds).toContain(privateSkill!.id);

    const segment = {
      kind: "skill" as const,
      name: "private-review",
      path: privateSkill!.skillFilePath,
      invocation: "/private-review",
      provider: "Poracode only",
      scope: "global" as const,
    };
    await expect(
      service.buildTurnSkillInjection({
        agentKind: "claude",
        projectLocation,
        segments: [segment],
      }),
    ).resolves.toContain("Private review");
    await expect(
      service.rewriteTerminalSkillSegments({
        agentKind: "claude",
        projectLocation,
        segments: [segment],
      }),
    ).resolves.toEqual([
      {
        kind: "text",
        content: `Use the "private-review" agent skill: read ${privateSkill!.skillFilePath.replaceAll("\\", "/")} and follow its instructions.`,
      },
    ]);

    await writeSkill(
      join(home, ".agents", "skills", "private-review"),
      "private-review",
      "Shared review",
    );
    const duplicateScan = await service.scan({ projectLocation, agentKind: "claude" });
    expect(
      duplicateScan.skills.find((skill) => duplicateScan.effectiveSkillIds.includes(skill.id))
        ?.providerId,
    ).toBe("poracode");
  });

  it("stores project-scoped Poracode-only skills in .poracode/skills", async () => {
    const source = join(projectPath, ".claude", "skills", "project-private");
    await writeSkill(source, "project-private");

    const result = await service.import({
      skills: [
        {
          sourcePath: source,
          destinationScope: "project",
          availability: "poracode",
          mode: "copy",
          replace: false,
          projectLocation,
        },
      ],
    });

    expect(result.imported).toEqual([join(projectPath, ".poracode", "skills", "project-private")]);
  });

  it("reads folded YAML descriptions used by provider skills", async () => {
    const source = join(home, ".claude", "skills", "folded-description");
    await mkdir(source, { recursive: true });
    await writeFile(
      join(source, "SKILL.md"),
      "---\nname: folded-description\ndescription: >\n  Review changes and run tests.\n  Report actionable failures.\nmetadata:\n  owner: smoke\n---\n",
      "utf8",
    );

    const scan = await service.scan({ projectLocation });
    expect(scan.skills.find((skill) => skill.name === "folded-description")?.description).toBe(
      "Review changes and run tests. Report actionable failures.",
    );
  });

  it("keeps provider-native skills usable but prevents importing non-portable metadata", async () => {
    const source = join(home, ".claude", "skills", "Invalid_Name");
    await mkdir(source, { recursive: true });
    await writeFile(
      join(source, "SKILL.md"),
      "---\nname: Invalid_Name\ndescription: Invalid name\n---\n",
      "utf8",
    );

    const scan = await service.scan({ projectLocation });
    expect(scan.skills.find((skill) => skill.folderName === "Invalid_Name")).toMatchObject({
      valid: true,
      portable: false,
      invalidReason: "invalid-name",
    });
    await expect(
      service.import({
        skills: [
          {
            sourcePath: source,
            destinationScope: "global",
            mode: "copy",
            replace: false,
            projectLocation,
          },
        ],
      }),
    ).rejects.toThrow("Cannot import an invalid skill");
  });

  it("surfaces bundled read-only skills without copying them into provider roots", async () => {
    const bundledDir = join(root, "bundled-skills");
    await writeSkill(join(bundledDir, "skill-creator"), "skill-creator", "Create a new skill");
    const bundledService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      env: { PORACODE_BUNDLED_SKILLS_DIR: bundledDir },
    });

    const scan = await bundledService.scan({ projectLocation, agentKind: "claude" });
    const bundled = scan.skills.find((skill) => skill.name === "skill-creator");
    expect(bundled).toMatchObject({
      providerId: "poracode-built-in",
      providerGroupId: "poracode",
      providerGroupLabel: "Poracode",
      providerGroupOrder: -1,
      origin: "built-in",
      mutable: false,
      valid: true,
    });
    expect(scan.effectiveSkillIds).toContain(bundled!.id);

    await bundledService.prepareForLaunch(projectLocation, "claude");
    await expect(
      readFile(join(home, ".agents", "skills", "skill-creator", "SKILL.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(home, ".claude", "skills", "skill-creator", "SKILL.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("groups Codex built-ins with Codex provider skills", async () => {
    const codex = {
      kind: "codex",
      label: "Codex",
      binary: "codex",
      capabilities: {},
      skillSupport: {
        roots: [
          {
            id: "codex",
            label: "Codex",
            globalPath: ".codex/skills",
            builtInPath: ".system",
          },
        ],
        invocation: "dollar",
      },
    } as unknown as AgentAdapter;
    const codexService = new SkillsService({
      adapters: new Map([["codex", codex]]),
      homeDirectory: () => home,
    });
    await writeSkill(join(home, ".codex", "skills", "review"), "review");
    await writeSkill(join(home, ".codex", "skills", ".system", "openai-docs"), "openai-docs");

    const scan = await codexService.scan({ projectLocation });
    expect(scan.skills.find((skill) => skill.name === "review")).toMatchObject({
      providerId: "codex",
      providerLabel: "Codex",
      origin: "external",
    });
    expect(scan.skills.find((skill) => skill.name === "openai-docs")).toMatchObject({
      providerId: "codex-built-in",
      providerLabel: "Codex built-ins",
      providerGroupId: "codex",
      providerGroupLabel: "Codex",
      origin: "built-in",
    });
  });

  it("assigns every provider root to its adapter section", async () => {
    const opencode = {
      kind: "opencode",
      label: "OpenCode",
      binary: "opencode",
      capabilities: {},
      skillSupport: {
        roots: [
          {
            id: "opencode",
            label: "OpenCode",
            globalPath: ".config/opencode/skills",
            builtInPath: ".system",
          },
          {
            id: "opencode-singular",
            label: "OpenCode legacy",
            globalPath: ".config/opencode/skill",
          },
        ],
        invocation: "prompt",
      },
    } as unknown as AgentAdapter;
    const opencodeService = new SkillsService({
      adapters: new Map([["opencode", opencode]]),
      homeDirectory: () => home,
    });
    await writeSkill(join(home, ".config", "opencode", "skills", "review"), "review");
    await writeSkill(
      join(home, ".config", "opencode", "skills", ".system", "provider-help"),
      "provider-help",
    );
    await writeSkill(join(home, ".config", "opencode", "skill", "legacy"), "legacy");

    const scan = await opencodeService.scan({ projectLocation });
    expect(
      scan.skills
        .filter((skill) => skill.providerId.startsWith("opencode"))
        .map((skill) => ({
          providerId: skill.providerId,
          providerGroupId: skill.providerGroupId,
          providerGroupLabel: skill.providerGroupLabel,
        }))
        .toSorted((left, right) => left.providerId.localeCompare(right.providerId)),
    ).toEqual([
      {
        providerId: "opencode",
        providerGroupId: "opencode",
        providerGroupLabel: "OpenCode",
      },
      {
        providerId: "opencode-built-in",
        providerGroupId: "opencode",
        providerGroupLabel: "OpenCode",
      },
      {
        providerId: "opencode-singular",
        providerGroupId: "opencode",
        providerGroupLabel: "OpenCode",
      },
    ]);

    const activeScan = await opencodeService.scan({
      projectLocation,
      agentKind: "opencode",
    });
    const builtIn = activeScan.skills.find((skill) => skill.name === "provider-help")!;
    expect(activeScan.effectiveSkillIds).toContain(builtIn.id);
  });

  it("prefers a managed skill over a bundled skill with the same name", async () => {
    const bundledDir = join(root, "bundled-skills");
    await writeSkill(join(bundledDir, "skill-creator"), "skill-creator", "Bundled copy");
    await writeSkill(
      join(home, ".agents", "skills", "skill-creator"),
      "skill-creator",
      "User copy",
    );
    const bundledService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      env: { PORACODE_BUNDLED_SKILLS_DIR: bundledDir },
    });

    const scan = await bundledService.scan({ projectLocation, agentKind: "claude" });
    const effective = scan.skills.filter((skill) => scan.effectiveSkillIds.includes(skill.id));
    const winner = effective.find((skill) => skill.name === "skill-creator");
    expect(winner?.providerId).toBe("agents");

    await bundledService.prepareForLaunch(projectLocation, "claude");
    expect(
      await readFile(join(home, ".claude", "skills", "skill-creator", "SKILL.md"), "utf8"),
    ).toContain("User copy");
  });

  it("inlines SKILL.md instructions only for skills outside the provider's native roots", async () => {
    await writeSkill(
      join(home, ".agents", "skills", "portable"),
      "portable",
      "Portable instructions",
    );
    await writeSkill(join(home, ".claude", "skills", "native"), "native", "Native instructions");
    const displayHome = home.replaceAll("\\", "/");

    const injected = await service.buildTurnSkillInjection({
      agentKind: "claude",
      projectLocation,
      segments: [
        { kind: "text", content: "run it" },
        {
          kind: "skill",
          name: "portable",
          path: `${displayHome}/.agents/skills/portable/SKILL.md`,
          invocation: "/portable",
          provider: "Shared agents",
          scope: "global",
        },
      ],
    });
    expect(injected).toContain('<skill name="portable"');
    expect(injected).toContain("Portable instructions");

    const native = await service.buildTurnSkillInjection({
      agentKind: "claude",
      projectLocation,
      segments: [
        {
          kind: "skill",
          name: "native",
          path: `${displayHome}/.claude/skills/native/SKILL.md`,
          invocation: "/native",
          provider: "Claude Code",
          scope: "global",
        },
      ],
    });
    expect(native).toBeUndefined();
  });

  it("skips injection for providers that natively read .agents/skills", async () => {
    await writeSkill(join(home, ".agents", "skills", "portable"), "portable", "Portable body");
    const bundledDir = join(root, "bundled-skills");
    await writeSkill(join(bundledDir, "skill-creator"), "skill-creator", "Bundled body");
    // Mirrors cursor/grok/opencode/copilot: `.agents/skills` is a native root.
    const agentsReader = {
      kind: "reader",
      label: "Reader",
      binary: "reader",
      capabilities: {},
      skillSupport: {
        roots: [
          { id: "reader", label: "Reader", globalPath: ".reader/skills" },
          {
            id: "agents",
            label: "Shared agent skills",
            globalPath: ".agents/skills",
            projectPath: ".agents/skills",
          },
        ],
        invocation: "slash",
      },
    } as unknown as AgentAdapter;
    const readerService = new SkillsService({
      adapters: new Map([["reader", agentsReader]]),
      homeDirectory: () => home,
      env: { PORACODE_BUNDLED_SKILLS_DIR: bundledDir },
    });
    const displayHome = home.replaceAll("\\", "/");

    // Managed skill: the provider reads `.agents/skills` itself — no inline.
    expect(
      await readerService.buildTurnSkillInjection({
        agentKind: "reader",
        projectLocation,
        segments: [
          {
            kind: "skill",
            name: "portable",
            path: `${displayHome}/.agents/skills/portable/SKILL.md`,
            invocation: "/portable",
            provider: "Shared agents",
            scope: "global",
          },
        ],
      }),
    ).toBeUndefined();

    // Bundled skills stay app-private, so even a shared-root reader needs the
    // selected skill instructions inlined.
    expect(
      await readerService.buildTurnSkillInjection({
        agentKind: "reader",
        projectLocation,
        segments: [
          {
            kind: "skill",
            name: "skill-creator",
            path: `${bundledDir.replaceAll("\\", "/")}/skill-creator/SKILL.md`,
            invocation: "/skill-creator",
            provider: "Poracode built-ins",
            scope: "global",
          },
        ],
      }),
    ).toContain("Bundled body");
  });

  it("does not mirror bundled skills into .agents/skills or touch user copies", async () => {
    const bundledDir = join(root, "bundled-skills");
    await writeSkill(join(bundledDir, "skill-creator"), "skill-creator", "Bundled body");
    await writeSkill(join(bundledDir, "changelog"), "changelog", "Bundled changelog");
    // User-owned managed skill with the same name — must never be overwritten.
    await writeSkill(join(home, ".agents", "skills", "changelog"), "changelog", "User changelog");
    const bundledService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      env: { PORACODE_BUNDLED_SKILLS_DIR: bundledDir },
    });

    await bundledService.prepareForLaunch(projectLocation, "claude");

    await expect(
      readFile(join(home, ".agents", "skills", "skill-creator", "SKILL.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    // The user's same-name skill is authoritative.
    expect(
      await readFile(join(home, ".agents", "skills", "changelog", "SKILL.md"), "utf8"),
    ).toContain("User changelog");
    const scan = await bundledService.scan({ projectLocation, agentKind: "claude" });
    expect(
      scan.skills.filter((skill) => skill.name === "skill-creator").map((s) => s.providerId),
    ).toEqual(["poracode-built-in"]);
  });

  it("removes stale bundled projections left in shared skill folders", async () => {
    const bundledDir = join(root, "bundled-skills");
    await writeSkill(join(bundledDir, "skill-creator"), "skill-creator", "Bundled body");
    const bundledService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      env: { PORACODE_BUNDLED_SKILLS_DIR: bundledDir },
    });
    const mirrored = join(home, ".agents", "skills", "skill-creator");
    const disabledDir = join(home, ".agents", "skills.poracode-disabled");
    const disabledMirror = join(disabledDir, "skill-creator");
    for (const path of [mirrored, disabledMirror]) {
      await writeSkill(path, "skill-creator", "Stale projection");
      await writeFile(
        join(path, ".poracode-skill.json"),
        JSON.stringify({
          version: 1,
          mode: "projection",
          sourcePath: join(bundledDir, "skill-creator"),
          sourceHash: "stale",
        }),
        "utf8",
      );
    }

    await bundledService.prepareForLaunch(projectLocation, "claude");
    await expect(readFile(join(mirrored, "SKILL.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(join(disabledMirror, "SKILL.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rewrites terminal skill segments to path hints only when the CLI can't resolve them", async () => {
    const bundledDir = join(root, "bundled-skills");
    await writeSkill(join(bundledDir, "skill-creator"), "skill-creator", "Bundled body");
    await writeSkill(join(home, ".agents", "skills", "portable"), "portable", "Portable body");
    const bundledService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      env: { PORACODE_BUNDLED_SKILLS_DIR: bundledDir },
    });
    const displayHome = home.replaceAll("\\", "/");
    const bundledSegment = {
      kind: "skill" as const,
      name: "skill-creator",
      path: `${bundledDir.replaceAll("\\", "/")}/skill-creator/SKILL.md`,
      invocation: "/skill-creator",
      provider: "Poracode built-ins",
      scope: "global" as const,
    };

    // Claude CLI: bundled skill isn't natively resolvable → path hint at the
    // app-private bundled location.
    const rewritten = await bundledService.rewriteTerminalSkillSegments({
      agentKind: "claude",
      projectLocation,
      segments: [bundledSegment, { kind: "text", content: " Create one." }],
    });
    expect(rewritten[0]).toEqual({
      kind: "text",
      content: `Use the "skill-creator" agent skill: read ${bundledDir.replaceAll("\\", "/")}/skill-creator/SKILL.md and follow its instructions.`,
    });
    expect(rewritten[1]).toEqual({ kind: "text", content: " Create one." });

    // Claude CLI: managed skills are projected into `.claude/skills` → the
    // typed `/portable` resolves natively, segment untouched.
    const managedSegment = {
      kind: "skill" as const,
      name: "portable",
      path: `${displayHome}/.agents/skills/portable/SKILL.md`,
      invocation: "/portable",
      provider: "Shared agents",
      scope: "global" as const,
    };
    const nativeSegments = [managedSegment];
    expect(
      await bundledService.rewriteTerminalSkillSegments({
        agentKind: "claude",
        projectLocation,
        segments: nativeSegments,
      }),
    ).toBe(nativeSegments);

    // A shared-root reader cannot discover app-private bundled skills either.
    const reader = {
      kind: "reader",
      label: "Reader",
      binary: "reader",
      capabilities: {},
      skillSupport: {
        roots: [
          {
            id: "agents",
            label: "Shared agent skills",
            globalPath: ".agents/skills",
            projectPath: ".agents/skills",
          },
        ],
        invocation: "slash",
      },
    } as unknown as AgentAdapter;
    const readerService = new SkillsService({
      adapters: new Map([["reader", reader]]),
      homeDirectory: () => home,
      env: { PORACODE_BUNDLED_SKILLS_DIR: bundledDir },
    });
    expect(
      await readerService.rewriteTerminalSkillSegments({
        agentKind: "reader",
        projectLocation,
        segments: [bundledSegment],
      }),
    ).toEqual([
      {
        kind: "text",
        content: `Use the "skill-creator" agent skill: read ${bundledDir.replaceAll("\\", "/")}/skill-creator/SKILL.md and follow its instructions.`,
      },
    ]);
  });

  it("uses provider-declared scope and root precedence", async () => {
    const precedenceAdapter = {
      kind: "precedence",
      label: "Precedence",
      binary: "precedence",
      capabilities: {},
      skillSupport: {
        roots: [
          { id: "first", label: "First", globalPath: ".first/skills" },
          { id: "second", label: "Second", projectPath: ".second/skills" },
        ],
        invocation: "prompt",
        precedence: {
          scopeOrder: ["global", "project"],
          global: ["first"],
          project: ["second"],
        },
      },
    } as unknown as AgentAdapter;
    const precedenceService = new SkillsService({
      adapters: new Map([["precedence", precedenceAdapter]]),
      homeDirectory: () => home,
    });
    await writeSkill(join(home, ".first", "skills", "review"), "review", "Global");
    await writeSkill(join(projectPath, ".second", "skills", "review"), "review", "Project");

    const scan = await precedenceService.scan({ projectLocation, agentKind: "precedence" });
    expect(scan.effectiveSkillIds).toEqual([expect.stringMatching(/^global:first:review:/u)]);
  });

  it("excludes skills disabled by the provider-native catalog", async () => {
    const nativeAdapter = {
      kind: "native",
      label: "Native",
      binary: "native",
      capabilities: { disabledSkillNames: ["testing"] },
      skillSupport: {
        roots: [{ id: "native", label: "Native", projectPath: ".native/skills" }],
        invocation: "prompt",
      },
    } as unknown as AgentAdapter;
    const nativeService = new SkillsService({
      adapters: new Map([["native", nativeAdapter]]),
      homeDirectory: () => home,
    });
    await writeSkill(join(projectPath, ".agents", "skills", "testing"), "testing");

    const scan = await nativeService.scan({ projectLocation, agentKind: "native" });

    expect(scan.effectiveSkillIds).toEqual([]);
  });

  it("prepares projections only for the provider being launched", async () => {
    const makeAdapter = (kind: string, path: string) =>
      ({
        kind,
        label: kind,
        binary: kind,
        capabilities: {},
        skillSupport: {
          roots: [{ id: kind, label: kind, projectPath: path }],
          projectionRoots: [{ id: kind, label: kind, projectPath: path }],
          invocation: "prompt",
        },
      }) as unknown as AgentAdapter;
    const selectedService = new SkillsService({
      adapters: new Map([
        ["one", makeAdapter("one", ".one/skills")],
        ["two", makeAdapter("two", ".two/skills")],
      ]),
      homeDirectory: () => home,
    });
    await writeSkill(join(projectPath, ".agents", "skills", "testing"), "testing");

    await selectedService.prepareForLaunch(projectLocation, "one");

    expect(
      await readFile(join(projectPath, ".one", "skills", "testing", "SKILL.md"), "utf8"),
    ).toContain("testing");
    await expect(
      readFile(join(projectPath, ".two", "skills", "testing", "SKILL.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("projects managed skills and removes the owned projection when disabled", async () => {
    const managed = join(projectPath, ".agents", "skills", "testing");
    await writeSkill(managed, "testing");
    await service.prepareForLaunch(projectLocation);

    const projection = join(projectPath, ".claude", "skills", "testing");
    expect(await readFile(join(projection, "SKILL.md"), "utf8")).toContain("testing");
    expect(
      JSON.parse(await readFile(join(projection, ".poracode-skill.json"), "utf8")),
    ).toMatchObject({ mode: "projection", sourcePath: managed });

    await service.setEnabled({ absolutePath: managed, enabled: false, projectLocation });
    await expect(readFile(join(projection, "SKILL.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    const scan = await service.scan({ projectLocation });
    expect(
      scan.skills.find((skill) => skill.name === "testing" && skill.origin === "managed"),
    ).toMatchObject({ enabled: false });
  });

  it("keeps an imported provider copy disabled and restores it over a stale projection", async () => {
    const managed = join(projectPath, ".agents", "skills", "testing");
    const provider = join(projectPath, ".claude", "skills", "testing");
    await writeSkill(managed, "testing");
    await writeSkill(provider, "testing");

    await service.setEnabled({ absolutePath: provider, enabled: false, projectLocation });
    const disabled = join(projectPath, ".claude", "skills.poracode-disabled", "testing");
    await expect(readFile(join(provider, "SKILL.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(join(disabled, "SKILL.md"), "utf8")).toContain("testing");

    await writeSkill(provider, "testing");
    await writeFile(
      join(provider, ".poracode-skill.json"),
      JSON.stringify({ version: 1, mode: "projection", sourcePath: managed, sourceHash: "stale" }),
      "utf8",
    );
    await service.setEnabled({ absolutePath: disabled, enabled: true, projectLocation });

    expect(await readFile(join(provider, "SKILL.md"), "utf8")).toContain("testing");
    await expect(readFile(join(disabled, "SKILL.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("disables and restores linked imports with their provider source", async () => {
    const source = join(home, ".claude", "skills", "linked-review");
    await writeSkill(source, "linked-review");
    const [linked] = (
      await service.import({
        skills: [
          {
            sourcePath: source,
            destinationScope: "global",
            mode: "link",
            replace: false,
            projectLocation,
          },
        ],
      })
    ).imported;

    expect((await lstat(linked!)).isSymbolicLink()).toBe(true);
    await service.setEnabled({ absolutePath: source, enabled: false, projectLocation });

    const disabledSource = join(home, ".claude", "skills.poracode-disabled", "linked-review");
    const disabledLink = join(home, ".agents", "skills.poracode-disabled", "linked-review");
    await expect(lstat(linked!)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await lstat(disabledLink)).isSymbolicLink()).toBe(true);
    expect(await realpath(disabledLink)).toBe(await realpath(disabledSource));
    expect(
      (await service.scan({ projectLocation })).skills.find(
        (skill) => skill.origin === "managed" && skill.name === "linked-review",
      ),
    ).toMatchObject({ enabled: false, linked: true, sourcePath: disabledSource });

    await service.setEnabled({
      absolutePath: disabledSource,
      enabled: true,
      projectLocation,
    });

    expect((await lstat(linked!)).isSymbolicLink()).toBe(true);
    expect(await realpath(linked!)).toBe(await realpath(source));
    await expect(lstat(disabledLink)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores a linked import when disabling its source rolls back", async () => {
    const source = join(home, ".claude", "skills", "linked-review");
    await writeSkill(source, "linked-review");
    const [linked] = (
      await service.import({
        skills: [
          {
            sourcePath: source,
            destinationScope: "global",
            mode: "link",
            replace: false,
            projectLocation,
          },
        ],
      })
    ).imported;
    await mkdir(join(projectPath, ".claude"), { recursive: true });
    await writeFile(join(projectPath, ".claude", "skills"), "blocks project synchronization");

    await expect(
      service.setEnabled({ absolutePath: source, enabled: false, projectLocation }),
    ).rejects.toThrow("EEXIST");

    expect(await readFile(join(source, "SKILL.md"), "utf8")).toContain("linked-review");
    expect((await lstat(linked!)).isSymbolicLink()).toBe(true);
    expect(await realpath(linked!)).toBe(await realpath(source));
    await expect(
      lstat(join(home, ".agents", "skills.poracode-disabled", "linked-review")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back a disable when provider projection synchronization fails", async () => {
    const managed = join(projectPath, ".agents", "skills", "testing");
    await writeSkill(managed, "testing");
    await mkdir(join(projectPath, ".claude"), { recursive: true });
    await writeFile(join(projectPath, ".claude", "skills"), "blocks the projection directory");

    await expect(
      service.setEnabled({ absolutePath: managed, enabled: false, projectLocation }),
    ).rejects.toThrow("EEXIST");

    expect(await readFile(join(managed, "SKILL.md"), "utf8")).toContain("testing");
  });

  it("does not overwrite a conflicting provider-owned skill during projection", async () => {
    const managed = join(projectPath, ".agents", "skills", "review");
    const provider = join(projectPath, ".claude", "skills", "review");
    await writeSkill(managed, "review", "Managed version");
    await writeSkill(provider, "review", "Provider version");

    await service.prepareForLaunch(projectLocation);

    expect(await readFile(join(provider, "SKILL.md"), "utf8")).toContain("Provider version");
    await expect(readFile(join(provider, ".poracode-skill.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects mutations outside known skill roots", async () => {
    const outside = join(root, "outside");
    await writeSkill(outside, "outside");
    await expect(service.delete({ absolutePath: outside, projectLocation })).rejects.toThrow(
      "outside the configured provider roots",
    );
  });

  it("rejects importing an already managed skill", async () => {
    const managed = join(home, ".agents", "skills", "review");
    await writeSkill(managed, "review");

    await expect(
      service.import({
        skills: [
          {
            sourcePath: managed,
            destinationScope: "global",
            mode: "copy",
            replace: true,
            projectLocation,
          },
        ],
      }),
    ).rejects.toThrow("Only skills discovered in an external provider folder can be imported");
    expect(await readFile(join(managed, "SKILL.md"), "utf8")).toContain("review");
  });

  it("validates the full batch before importing any selected skill", async () => {
    const first = join(home, ".claude", "skills", "first");
    const tooLarge = join(home, ".claude", "skills", "too-large");
    await writeSkill(first, "first");
    await mkdir(tooLarge, { recursive: true });
    await writeFile(join(tooLarge, "SKILL.md"), "x".repeat(1024 * 1024 + 1), "utf8");

    await expect(
      service.import({
        skills: [
          {
            sourcePath: first,
            destinationScope: "global",
            mode: "copy",
            replace: false,
            projectLocation,
          },
          {
            sourcePath: tooLarge,
            destinationScope: "global",
            mode: "copy",
            replace: false,
            projectLocation,
          },
        ],
      }),
    ).rejects.toThrow("SKILL.md is too large to import");
    await expect(
      readFile(join(home, ".agents", "skills", "first", "SKILL.md")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stages a replacement before removing the existing managed skill", async () => {
    const managed = join(home, ".agents", "skills", "review");
    const external = join(home, ".claude", "skills", "review");
    await writeSkill(managed, "review", "Original managed skill");
    await writeSkill(external, "review", "Replacement skill");

    await service.import({
      skills: [
        {
          sourcePath: external,
          destinationScope: "global",
          mode: "copy",
          replace: true,
          projectLocation,
        },
      ],
    });

    expect(await readFile(join(managed, "SKILL.md"), "utf8")).toContain("Replacement skill");
  });

  it("uses the selected WSL distro home for global discovery and imports", async () => {
    const wslRoot = join(root, "wsl");
    const toWslPath = (_distro: string, linuxPath: string) =>
      join(wslRoot, ...linuxPath.split("/").filter(Boolean));
    const wslService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      resolveWslHome: async () => "/home/alice",
      wslFsPath: toWslPath,
    });
    const wslProject: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/work/project",
      uncPath: projectPath,
    };
    const source = join(toWslPath("Ubuntu", "/home/alice"), ".claude", "skills", "wsl-review");
    await writeSkill(source, "wsl-review");

    const scan = await wslService.scan({ projectLocation: wslProject });
    expect(scan.canLinkToGlobal).toBe(false);
    expect(scan.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "wsl-review",
          scopeLabel: "Global",
          skillFilePath: "/home/alice/.claude/skills/wsl-review/SKILL.md",
        }),
      ]),
    );

    const result = await wslService.import({
      skills: [
        {
          sourcePath: source,
          destinationScope: "global",
          mode: "copy",
          replace: false,
          projectLocation: wslProject,
        },
      ],
    });
    expect(result.imported).toEqual([
      join(toWslPath("Ubuntu", "/home/alice"), ".agents", "skills", "wsl-review"),
    ]);
  });

  it("resolves WSL skill directory links before reading SKILL.md", async () => {
    const wslRoot = join(root, "wsl-links");
    const toWslPath = (_distro: string, linuxPath: string) =>
      join(wslRoot, ...linuxPath.split("/").filter(Boolean));
    const linkedTarget = join(wslRoot, "linked-target");
    const resolvedTarget = join(toWslPath("Ubuntu", "/home/alice"), ".agents", "skills", "review");
    const providerLink = join(toWslPath("Ubuntu", "/home/alice"), ".claude", "skills", "review");
    await writeSkill(linkedTarget, "review", "Unresolved link");
    await writeSkill(resolvedTarget, "review", "Resolved WSL link");
    await mkdir(join(providerLink, ".."), { recursive: true });
    await symlink(linkedTarget, providerLink, process.platform === "win32" ? "junction" : "dir");

    const wslService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      resolveWslHome: async () => "/home/alice",
      resolveWslRealPaths: async () => ["/home/alice/.agents/skills/review"],
      wslFsPath: toWslPath,
    });
    const scan = await wslService.scan({ wslDistro: "Ubuntu" });
    const skill = scan.skills.find(
      (entry) => entry.providerId === "claude" && entry.folderName === "review",
    );

    expect(skill).toMatchObject({
      description: "Resolved WSL link",
      linked: true,
      sourcePath: resolvedTarget,
      valid: true,
    });
    expect(skill?.invalidReason).toBeUndefined();
  });

  it("manages a WSL user's global skills without requiring a project", async () => {
    const wslRoot = join(root, "wsl-global");
    const toWslPath = (_distro: string, linuxPath: string) =>
      join(wslRoot, ...linuxPath.split("/").filter(Boolean));
    const wslService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      resolveWslHome: async () => "/home/alice",
      wslFsPath: toWslPath,
    });
    const managed = join(
      toWslPath("Ubuntu", "/home/alice"),
      ".agents",
      "skills",
      "wsl-global-review",
    );
    await writeSkill(managed, "wsl-global-review");

    const scan = await wslService.scan({ wslDistro: "Ubuntu" });

    expect(scan.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "wsl-global-review",
          scope: "global",
          scopeLabel: "Global",
        }),
      ]),
    );
    await wslService.setEnabled({ absolutePath: managed, enabled: false, wslDistro: "Ubuntu" });
    const disabled = (await wslService.scan({ wslDistro: "Ubuntu" })).skills.find(
      (skill) => skill.name === "wsl-global-review",
    );
    expect(disabled).toMatchObject({ enabled: false });
    await wslService.setEnabled({
      absolutePath: disabled!.absolutePath,
      enabled: true,
      wslDistro: "Ubuntu",
    });
    expect(
      (await wslService.scan({ wslDistro: "Ubuntu" })).skills.find(
        (skill) => skill.name === "wsl-global-review",
      ),
    ).toMatchObject({ enabled: true });
  });

  it("installs a validated marketplace skill and projects it for Claude", async () => {
    const marketplaceHtml =
      '<script>{\\"source\\":\\"example/skills\\",\\"skillId\\":\\"unique-managed-skill\\",\\"name\\":\\"unique-managed-skill\\",\\"installs\\":42,\\"weeklyInstalls\\":[1,2,3],\\"isOfficial\\":true}</script>';
    const marketplaceService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      fetch: (async (input) => {
        const url = String(input);
        if (url === "https://www.skills.sh/") return new Response(marketplaceHtml);
        if (url === "https://api.github.com/repos/example/skills") {
          return Response.json({ default_branch: "main" });
        }
        if (url.includes("/git/trees/main?recursive=1")) {
          return Response.json({
            truncated: false,
            tree: [
              {
                path: "skills/unique-managed-skill/SKILL.md",
                type: "blob",
                mode: "100644",
                size: 96,
              },
            ],
          });
        }
        if (url.includes("raw.githubusercontent.com")) {
          return new Response(
            "---\nname: unique-managed-skill\ndescription: Unique managed test skill\n---\n",
          );
        }
        return new Response("not found", { status: 404 });
      }) as typeof fetch,
    });

    await marketplaceService.listMarketplace({ marketplace: "skills-sh", sort: "rank" });
    const result = await marketplaceService.installMarketplace({
      marketplace: "skills-sh",
      marketplaceSkillId: "example/skills/unique-managed-skill",
      destinationScope: "global",
      replace: false,
    });

    expect(result.installed).toBe(join(home, ".agents", "skills", "unique-managed-skill"));
    expect(
      await readFile(join(home, ".claude", "skills", "unique-managed-skill", "SKILL.md"), "utf8"),
    ).toContain("Unique managed test skill");

    const privateResult = await marketplaceService.installMarketplace({
      marketplace: "skills-sh",
      marketplaceSkillId: "example/skills/unique-managed-skill",
      destinationScope: "global",
      availability: "poracode",
      replace: false,
    });
    expect(privateResult.installed).toBe(join(home, ".poracode", "skills", "unique-managed-skill"));
  });

  it("lists Skills Directory through its public registry", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        registry: "skillsdirectory",
        skills: [
          {
            name: "Secure review",
            slug: "example-secure-review",
            description: "Review code securely",
            repository: "example/skills",
            stars: 120,
            verified: true,
          },
        ],
        pagination: { total: 96_920, limit: 100, offset: 0, hasMore: true },
      }),
    );
    const marketplaceService = new SkillsService({
      adapters,
      homeDirectory: () => home,
      fetch: fetchMock,
    });

    await expect(
      marketplaceService.listMarketplace({
        marketplace: "skills-directory",
        query: "review",
        sort: "rank",
      }),
    ).resolves.toMatchObject({
      marketplace: "skills-directory",
      total: 96_920,
      skills: [
        {
          id: "example-secure-review",
          source: "example/skills",
          skillId: "secure-review",
          stars: 120,
        },
      ],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://www.skillsdirectory.com/api/registry?q=review&limit=100&sort=stars",
    );
  });

  it("resolves profile-specific global skill roots inside the selected WSL distro", async () => {
    const profileAdapter = {
      kind: "claude:work",
      label: "Claude Work",
      binary: "claude",
      capabilities: {},
      skillSupport: {
        roots: [
          {
            id: "claude",
            label: "Claude Work",
            globalPath: ".claude/skills",
            globalBasePath: "~/.profiles/work",
            globalOverride: { env: "CLAUDE_CONFIG_DIR", path: "skills" },
          },
        ],
        invocation: "slash",
      },
    } as unknown as AgentAdapter;
    const wslRoot = join(root, "profile-wsl");
    const toWslPath = (_distro: string, linuxPath: string) =>
      join(wslRoot, ...linuxPath.split("/").filter(Boolean));
    const profileService = new SkillsService({
      adapters: new Map([["claude:work", profileAdapter]]),
      homeDirectory: () => home,
      resolveWslHome: async () => "/home/alice",
      wslFsPath: toWslPath,
    });
    await writeSkill(
      join(toWslPath("Ubuntu", "/home/alice/.profiles/work"), "skills", "profile-review"),
      "profile-review",
    );

    const scan = await profileService.scan({
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/work/project",
        uncPath: projectPath,
      },
      agentKind: "claude:work",
    });

    expect(scan.effectiveSkillIds).toEqual([
      expect.stringMatching(/^global:claude:profile-review:/u),
    ]);
    expect(scan.skills.find((skill) => skill.name === "profile-review")?.skillFilePath).toBe(
      "/home/alice/.profiles/work/skills/profile-review/SKILL.md",
    );
  });

  it("resolves provider home overrides from the selected WSL environment", async () => {
    const overrideAdapter = {
      kind: "override",
      label: "Override",
      binary: "override",
      capabilities: {},
      skillSupport: {
        roots: [
          {
            id: "override",
            label: "Override",
            globalPath: ".override/skills",
            globalOverride: { env: "OVERRIDE_HOME", path: "skills" },
          },
        ],
        invocation: "prompt",
      },
    } as unknown as AgentAdapter;
    const wslRoot = join(root, "override-wsl");
    const toWslPath = (_distro: string, linuxPath: string) =>
      join(wslRoot, ...linuxPath.split("/").filter(Boolean));
    const overrideService = new SkillsService({
      adapters: new Map([["override", overrideAdapter]]),
      homeDirectory: () => home,
      resolveWslHome: async () => "/home/alice",
      resolveWslEnv: async () => ({ OVERRIDE_HOME: "/srv/override" }),
      wslFsPath: toWslPath,
    });
    await writeSkill(
      join(toWslPath("Ubuntu", "/srv/override"), "skills", "override-review"),
      "override-review",
    );

    const scan = await overrideService.scan({
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/work/project",
        uncPath: projectPath,
      },
      agentKind: "override",
    });

    expect(scan.skills.find((skill) => skill.name === "override-review")?.skillFilePath).toBe(
      "/srv/override/skills/override-review/SKILL.md",
    );
  });
});
