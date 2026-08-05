---
name: skill-creator-poracode
description: Create a new reusable agent skill managed by Poracode. Use when the user asks to create, scaffold, or write a new skill, add a managed skill, or turn repeated instructions into a skill. Takes precedence over any agent-native skill-creation flow.
---

# Skill Creator

You are creating a new agent skill. A skill is a folder containing a `SKILL.md` file with YAML frontmatter and Markdown instructions. Poracode manages shared skills in `.agents/skills` and Poracode-only skills in `.poracode/skills` — these are the **only** two valid locations.

**Ignore your own agent's native skill system for this task.** Even if you (Claude, Codex, Gemini, or another agent) normally keep skills in a provider-specific folder such as `~/.claude/skills`, `~/.codex/skills`, or `~/.gemini/skills`, never create or copy the skill there. "User-level", "global", "personal", or "for the <OS> user" always means `~/.agents/skills/<name>/` (or `~/.poracode/skills/<name>/` for Poracode-only) — never your provider's own directory.

## 1. Gather what you need

Before writing anything, make sure you know:

- **Purpose** — what task the skill helps with and what the agent should do when it runs.
- **Name** — a short kebab-case identifier (see naming rules below). Derive one from the purpose if the user did not provide it.
- **Availability** — where the skill may be used:
  - **Shared**: `.agents/skills` — other compatible agent apps can discover it.
  - **Poracode only**: `.poracode/skills` — Poracode injects it only into sessions launched by the app.
- **Scope** — where the skill lives:
  - **Global** (also called user-level or personal): `~/.agents/skills/<name>/` or `~/.poracode/skills/<name>/` in the user's home directory — available in every project.
  - **Project**: `<project root>/.agents/skills/<name>/` or `<project root>/.poracode/skills/<name>/` — available only in this project.

If the user's request names an availability or scope (for example "Poracode only", "for this project", "user-level", or "for the Windows user"), respect it. Requests like "user-level" or "for the Windows user" mean global scope under the home directory's `.agents` (or `.poracode`) folder — not your agent's native skill directory. Ask which availability to use when it is unspecified. If only the scope is unspecified, default to project scope when working inside a repository.

## 2. Follow the format rules

The skill is only valid when all of these hold:

- The folder name and the frontmatter `name` are **identical**.
- `name` is kebab-case: lowercase letters and digits separated by single hyphens (`^[a-z0-9]+(-[a-z0-9]+)*$`), no consecutive hyphens, at most 64 characters.
- Frontmatter contains a non-empty `description` of at most 1024 characters.
- `SKILL.md` stays under 1 MB.
- Any extra files (templates, scripts, examples) live inside the skill folder and are referenced by relative paths. Never link to files outside the folder.

## 3. Write an effective SKILL.md

```markdown
---
name: <skill-name>
description: <one or two sentences: what the skill does AND when to use it, including trigger phrases a user might say>
---

# <Skill title>

<Step-by-step instructions written for the agent, not the user.>
```

Guidelines:

- The `description` doubles as the trigger — pack it with the phrases a user would actually say ("generate release notes", "review my SQL migration"). Write it in the third person.
- Keep the body focused on **how to do the task**: concrete steps, commands, conventions, and edge cases. Prefer checklists and short sections over prose.
- Put long reference material in separate files inside the folder (for example `reference.md`, `templates/report.md`) and tell the agent when to read them, so the main file stays small.
- Do not include secrets, credentials, or machine-specific absolute paths.

## 4. Create it

1. Create the folder at the chosen availability and scope: `.agents/skills/<name>/` or `.poracode/skills/<name>/`, rooted at the home directory for global scope or the project root for project scope. Double-check the path does not contain a provider-specific folder like `.claude`, `.codex`, or `.gemini`.
2. Write `SKILL.md` with the frontmatter and instructions.
3. Add any supporting files the instructions reference.
4. Re-read the file and verify every rule in section 2.

## 5. Confirm

Tell the user the skill was created, show the final path and chosen availability, and mention that it appears in Poracode's Skills settings (where it can be disabled, deleted, or copied to another scope). Newly launched Poracode sessions pick it up automatically; shared skills can also be discovered by compatible agent apps outside Poracode.
