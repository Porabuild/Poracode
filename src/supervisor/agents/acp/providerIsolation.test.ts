/**
 * Guard for the shared ACP stack's provider-agnostic boundary.
 *
 * The rule (see `.agents/docs/agent-adapters.md#provider-isolation--hard-rules`):
 * a provider name may appear in a comment — documenting the real-world case a
 * generic behavior exists for — but never in the code itself. An identifier,
 * type, or regex in `acp/` or `acp-generic/` that names one agent means shared
 * code is carrying that agent's quirk instead of the provider folder.
 *
 * Prose strings are ignored; comparison literals and module imports are checked.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tokenizer, type Token } from "acorn";

const AGENTS_DIR = fileURLToPath(new URL("..", import.meta.url));
const SHARED_DIRS = ["acp", "acp-generic"] as const;

/**
 * Kind names that are also ordinary English or programming words, so an
 * identifier-segment match says nothing. Segment matching cannot separate a
 * text-scan `cursor` from the Cursor provider; review covers these.
 */
const AMBIGUOUS_KINDS = new Set(["cursor"]);

/** Printed alongside any violation so the failure explains the fix. */
const ISOLATION_HINT =
  "Shared ACP code must not name a provider. Declare a capability or an " +
  "`AcpSessionBehavior` field, or supply a hook from the provider folder — see " +
  ".agents/docs/agent-adapters.md#provider-isolation--hard-rules";

/** Every provider folder, discovered the same way the registry parity test does. */
function discoverProviderKinds(): string[] {
  return readdirSync(AGENTS_DIR).filter((entry) => {
    const dir = join(AGENTS_DIR, entry);
    if (!statSync(dir).isDirectory()) return false;
    return readdirSync(dir).includes("detection.ts");
  });
}

function providerCodeSegments(src: string): Set<string> {
  const tokens = [...tokenizer(src, { ecmaVersion: "latest", sourceType: "module" })] as Array<
    Token & { value: unknown }
  >;
  const code: string[] = [];
  const imports: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const label = token.type.label;
    if (label === "name") code.push(String(token.value));
    if (label === "regexp") code.push(src.slice(token.start + 1, token.end));
    if (label !== "string" && label !== "template") continue;

    const template = label === "template";
    const previous = tokens[index - (template ? 2 : 1)];
    const next = tokens[index + (template ? 2 : 1)];
    const comparison = (value: unknown) => ["==", "!=", "===", "!=="].includes(String(value));
    const imported =
      previous?.type.label === "import" ||
      previous?.value === "from" ||
      (previous?.type.label === "(" &&
        ["import", "require"].includes(String(tokens[index - (template ? 3 : 2)]?.value)));
    if (comparison(previous?.value) || comparison(next?.value) || previous?.type.label === "case") {
      code.push(String(token.value));
    }
    if (imported) imports.push(String(token.value));
  }
  return new Set([
    ...identifierSegments(code.join(" ")),
    ...imports.flatMap((id) => id.split("/")),
  ]);
}

/** Lowercased word segments of every identifier-shaped token in `code`. */
function identifierSegments(code: string): Set<string> {
  const segments = new Set<string>();
  for (const [token] of code.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    for (const segment of token
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(/[\s_$]+/)) {
      if (segment) segments.add(segment.toLowerCase());
    }
  }
  return segments;
}

function sharedSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "fixtures") walk(path);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(path);
      }
    }
  };
  for (const dir of SHARED_DIRS) walk(join(AGENTS_DIR, dir));
  return files;
}

describe("shared ACP code names no provider", () => {
  const kinds = discoverProviderKinds().filter((kind) => !AMBIGUOUS_KINDS.has(kind));

  it("discovers the provider folders it is meant to guard against", () => {
    expect(kinds).toContain("antigravity");
    expect(kinds).toContain("gemini");
    expect(kinds.length).toBeGreaterThan(8);
  });

  const found = sharedSourceFiles().flatMap((path) => {
    const segments = providerCodeSegments(readFileSync(path, "utf8"));
    const file = relative(AGENTS_DIR, path).split(sep).join("/");
    return kinds.filter((kind) => segments.has(kind)).map((kind) => ({ file, kind }));
  });
  const key = (hit: { file: string; kind: string }) => `${hit.file} → ${hit.kind}`;

  it("has no provider name in identifiers, types, regexes, comparisons, or imports", () => {
    const violations = found.map(key);
    expect(violations.length > 0 ? [ISOLATION_HINT, ...violations] : []).toEqual([]);
  });
});

describe("provider isolation scanner", () => {
  it.each([
    "const geminiBuffer = [];",
    "let value: GeminiPayload;",
    'const pattern = /gemini-["a-z]+/;',
    'if (kind === "gemini") stop();',
    'if ("gemini" !== kind) stop();',
    "if (kind === `gemini`) stop();",
    'switch (kind) { case "gemini": break; }',
    'import { normalize } from "../gemini/detection";',
    'await import("../gemini/detection");',
    "const message = `value: ${geminiState}`;",
  ])("detects provider knowledge in %s", (source) => {
    expect(providerCodeSegments(source)).toContain("gemini");
  });

  it("ignores comments, prose, and template text while preserving division", () => {
    const source = [
      "// geminiBuffer is provider-owned",
      "/* GeminiPayload */",
      'const message = "gemini output";',
      "const template = `gemini ${count / total}`;",
    ].join("\n");
    expect(providerCodeSegments(source)).not.toContain("gemini");
    expect(providerCodeSegments(source)).toContain("count");
  });
});
