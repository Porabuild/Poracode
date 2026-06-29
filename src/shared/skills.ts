import type { SkillScopeLevel } from "./contracts/skills";

/**
 * Skill "roots": folder conventions that agents read for skills. Each root is
 * consumed by one or more installed agents. The two canonical roots today:
 *
 *  - `.claude/skills` — read by Claude Code and Claude profiles.
 *  - `.agents/skills` — the shared convention read by the ACP-speaking agents
 *    (Copilot, Codex, Cursor, Gemini, Grok, OpenCode, and custom ACP agents).
 *
 * The "optimizer" mirrors skills across roots at a given level so that whichever
 * agent the user runs can see every skill (some read `.agents`, some read their
 * own folder). To extend: add a root here and the manager picks it up.
 */
export interface SkillRoot {
  id: string;
  label: string;
  /** Relative directory, POSIX-style, e.g. ".claude/skills". */
  dirName: string;
  /** Short human description of which agents read this root. */
  consumerLabel: string;
  /**
   * Agent kinds that read this root. Matched by exact kind or by `${kind}:`
   * prefix (covers Claude profiles `claude:<id>` and `acp-generic:<id>`).
   */
  consumerKinds: string[];
}

export const SKILL_ROOTS: SkillRoot[] = [
  {
    id: "claude",
    label: "Claude",
    dirName: ".claude/skills",
    consumerLabel: "Claude Code & Claude profiles",
    consumerKinds: ["claude"],
  },
  {
    id: "agents",
    label: "Shared agents",
    dirName: ".agents/skills",
    consumerLabel: "Copilot, Codex, Cursor, Gemini, Grok, OpenCode",
    consumerKinds: ["copilot", "codex", "cursor", "gemini", "grok", "opencode", "acp-generic"],
  },
];

export function makeScopeId(level: SkillScopeLevel, rootId: string): string {
  return `${level}:${rootId}`;
}

/** Slugify a free-form skill name into a safe folder name. */
export function slugifySkillName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "skill";
}

/**
 * Build a SKILL.md document from structured fields. Frontmatter mirrors the
 * format used by the bundled skills (`name`, `description`, optional metadata).
 */
export function buildSkillMarkdown(input: {
  name: string;
  description: string;
  body?: string;
  metadata?: Record<string, string>;
}): string {
  // Quote both name and description so colons/quotes/newlines in them can't
  // corrupt the YAML frontmatter that downstream agents parse with strict YAML.
  const lines = ["---", `name: ${JSON.stringify(input.name)}`];
  lines.push(`description: ${JSON.stringify(input.description)}`);
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    lines.push("metadata:");
    for (const [key, value] of Object.entries(input.metadata)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "");
  const body = (input.body ?? "").trim();
  lines.push(body.length > 0 ? body : `# ${input.name}\n`);
  lines.push("");
  return lines.join("\n");
}

/** A curated, popular skill the user can install with one click. */
export interface MarketplaceSkill {
  id: string;
  name: string;
  folderName: string;
  description: string;
  author: string;
  tags: string[];
  /** Link to the canonical upstream source. */
  homepage?: string;
  /** Rough popularity weight, used only for default ordering. */
  popularity: number;
  /** Embedded markdown body written into the installed SKILL.md. */
  template: string;
}

/**
 * Curated marketplace. Entries install as self-contained templates (offline,
 * always-correct) and link out to their canonical source. For anything not
 * listed here, the UI also offers "Install from Git URL", which clones a repo
 * and copies a skill folder out of it.
 */
export const SKILL_MARKETPLACE: MarketplaceSkill[] = [
  {
    id: "systematic-debugging",
    name: "Systematic Debugging",
    folderName: "systematic-debugging",
    description:
      "Use when stuck on a bug: form a hypothesis, add instrumentation, bisect, and verify the root cause before changing code. Keywords: debug, root cause, stack trace, reproduce.",
    author: "Lightcode",
    tags: ["debugging", "workflow"],
    homepage: "https://github.com/obra/superpowers",
    popularity: 95,
    template: `# Systematic Debugging

Use this skill when you are stuck on a bug or unexpected behavior.

## Method
1. **Reproduce reliably.** Find the smallest input/steps that trigger it. If you can't reproduce it, you can't fix it.
2. **State the hypothesis.** Write down what you believe is happening and why, in one sentence.
3. **Instrument.** Add logging / asserts / a breakpoint at the boundary where the hypothesis predicts the divergence.
4. **Bisect.** Narrow the failure to a single function/commit (git bisect, binary search the data).
5. **Confirm the root cause.** Prove it — don't guess. Change one thing and watch the prediction hold.
6. **Fix + regression test.** Add a test that fails before the fix and passes after.

## Anti-patterns
- Changing several things at once.
- "Fixing" symptoms without confirming the cause.
- Deleting logging before the fix is verified.
`,
  },
  {
    id: "code-review",
    name: "Code Review",
    folderName: "code-review",
    description:
      "Use when reviewing a diff or PR. Checks correctness, edge cases, security, tests, and readability, and reports findings by severity. Keywords: review, PR, diff, audit.",
    author: "Lightcode",
    tags: ["review", "quality"],
    popularity: 90,
    template: `# Code Review

Review the changed code (the diff), not the whole repo, unless asked.

## Pass order
1. **Correctness** — does it do what the PR says? Off-by-one, null/empty, async races, error paths.
2. **Edge cases** — boundaries, large/empty inputs, concurrency, failure/retry.
3. **Security** — injection, authz, secrets, unsafe deserialization, path traversal.
4. **Tests** — is the new behavior covered? Do tests assert the right thing?
5. **Readability** — naming, dead code, duplication, comment/altitude.

## Output
Report findings grouped by severity (blocker / should-fix / nit) with \`file:line\` references and a concrete suggested change. Lead with what's correct so the author has signal, then the findings.
`,
  },
  {
    id: "writing-commits",
    name: "Conventional Commits",
    folderName: "writing-commits",
    description:
      "Use when writing git commit messages. Produces a concise, imperative, conventional-commit subject plus a body explaining why. Keywords: commit, git, message, changelog.",
    author: "Lightcode",
    tags: ["git", "workflow"],
    homepage: "https://www.conventionalcommits.org",
    popularity: 80,
    template: `# Conventional Commits

Write commit messages as: \`type(scope): summary\`.

- **type**: feat, fix, docs, refactor, perf, test, build, chore.
- **summary**: imperative, lower-case, no trailing period, ≤ 72 chars.
- **body** (optional): explain *why*, not *what* the diff already shows. Wrap at 72.
- **footer** (optional): \`BREAKING CHANGE:\`, issue refs.

## Example
\`\`\`
fix(auth): reject expired refresh tokens

Tokens past their exp were silently accepted because the clock-skew
window was applied with the wrong sign. Compare against now() and
allow only a 30s skew.
\`\`\`
`,
  },
  {
    id: "test-driven-development",
    name: "Test-Driven Development",
    folderName: "test-driven-development",
    description:
      "Use when implementing a feature or fix. Drives the change with a failing test first (red → green → refactor). Keywords: TDD, tests, red green refactor.",
    author: "Lightcode",
    tags: ["testing", "workflow"],
    popularity: 78,
    template: `# Test-Driven Development

Drive the change with tests.

1. **Red** — write the smallest test that expresses the next bit of behavior. Run it; watch it fail for the right reason.
2. **Green** — write the least code that makes it pass. Don't gold-plate.
3. **Refactor** — clean up names/duplication with the test as a safety net.

## Tips
- One behavior per test; assert on outcomes, not implementation details.
- If a test is hard to write, the design is probably hard to use — fix the design.
- Keep the loop tight: seconds, not minutes.
`,
  },
  {
    id: "pdf-processing",
    name: "PDF Processing",
    folderName: "pdf",
    description:
      "Use when extracting text/tables from PDFs or filling/merging/splitting PDF files. Keywords: pdf, extract, form, merge, pypdf.",
    author: "Anthropic",
    tags: ["documents", "data"],
    homepage: "https://github.com/anthropics/skills",
    popularity: 88,
    template: `# PDF Processing

Use when working with PDF files (extraction, forms, merge/split).

## Tools
- **pypdf** — pure-python read/merge/split, form fields.
- **pdfplumber** — text + table extraction with layout.
- **pdf2image + an OCR engine** — scanned/image PDFs.

## Recipes
- *Extract text*: \`pdfplumber\` page-by-page; prefer \`extract_table()\` for tabular data.
- *Merge*: \`pypdf.PdfWriter\` — append pages, then write once.
- *Fill a form*: read the field names first, then \`update_page_form_field_values\`.

Always verify output: page counts, that no text was dropped, that tables kept their columns.
`,
  },
  {
    id: "web-research",
    name: "Web Research",
    folderName: "web-research",
    description:
      "Use when answering a question that needs current or external facts. Searches multiple sources, cross-checks, and cites. Keywords: research, search, sources, cite, verify.",
    author: "Lightcode",
    tags: ["research"],
    popularity: 72,
    template: `# Web Research

Use when a task needs facts you can't derive from the repo.

## Method
1. **Decompose** the question into sub-claims.
2. **Search broadly** — multiple queries/phrasings; don't stop at the first hit.
3. **Cross-check** each claim against ≥ 2 independent sources; prefer primary sources.
4. **Note recency** — flag anything that may be stale.
5. **Cite** — every non-obvious claim gets a source link.

## Output
A short synthesis answering the question, followed by a sources list. Separate what's well-supported from what's uncertain.
`,
  },
  {
    id: "brainstorming",
    name: "Brainstorming",
    folderName: "brainstorming",
    description:
      "Use when exploring options or designing an approach. Generates diverse alternatives, then evaluates against constraints before committing. Keywords: brainstorm, design, options, tradeoffs.",
    author: "Lightcode",
    tags: ["design", "workflow"],
    popularity: 60,
    template: `# Brainstorming

Use before committing to an approach.

1. **Diverge** — list 3–5 genuinely different options (not variations of one). Include a "boring" and a "bold" one.
2. **State constraints** — what must be true (time, deps, compatibility, risk).
3. **Score** each option against the constraints; note the failure mode of each.
4. **Recommend one** with a one-line rationale, and name the runner-up.

Don't silently pick the first idea. Make the tradeoff explicit.
`,
  },
  {
    id: "slides",
    name: "Slide Decks (PPTX)",
    folderName: "pptx",
    description:
      "Use when creating or editing PowerPoint presentations programmatically. Keywords: pptx, slides, powerpoint, python-pptx, deck.",
    author: "Anthropic",
    tags: ["documents", "presentation"],
    homepage: "https://github.com/anthropics/skills",
    popularity: 65,
    template: `# Slide Decks (PPTX)

Use when generating/editing \`.pptx\` files.

## Tool
- **python-pptx** — programmatic slides, layouts, text frames, tables, images.

## Recipe
1. Start from a template \`.pptx\` to inherit theme/fonts.
2. Add slides by layout index; set title + body placeholders by index, not by guessing.
3. For charts/tables, build data first, then render.
4. Save and re-open to verify nothing overflowed the slide bounds.

Keep one idea per slide; prefer few words + a visual over paragraphs.
`,
  },
];

export function marketplaceSkillById(id: string): MarketplaceSkill | undefined {
  return SKILL_MARKETPLACE.find((skill) => skill.id === id);
}
