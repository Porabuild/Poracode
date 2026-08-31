/**
 * Guard for the shared ACP stack's provider-agnostic boundary.
 *
 * The rule (see `.agents/docs/agent-adapters.md#provider-isolation--hard-rules`):
 * a provider name may appear in a comment — documenting the real-world case a
 * generic behavior exists for — but never in the code itself. An identifier,
 * type, or regex in `acp/` or `acp-generic/` that names one agent means shared
 * code is carrying that agent's quirk instead of the provider folder.
 *
 * String literals are exempt: shared code legitimately matches and surfaces
 * vendor wire text. Control flow and data shape are what this checks.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AGENTS_DIR = fileURLToPath(new URL("..", import.meta.url));
const SHARED_DIRS = ["acp", "acp-generic"] as const;

/**
 * Kind names that are also ordinary English or programming words, so an
 * identifier-segment match says nothing. Segment matching cannot separate a
 * text-scan `cursor` from the Cursor provider; review covers these.
 */
const AMBIGUOUS_KINDS = new Set(["cursor"]);

/**
 * Provider knowledge that predates the boundary being enforced. Pin it so
 * nothing new lands, and delete the entry when the debt is paid — a stale
 * entry fails this test just as a new violation does.
 */
const KNOWN_EXCEPTIONS: ReadonlyArray<{ file: string; kind: string; reason: string }> = [
  {
    file: "acp/probe.ts",
    kind: "gemini",
    reason:
      "humanizeModelId strips a hardcoded `gemini-` prefix for every ACP agent. " +
      "Fix: let the adapter declare its model-label normalization instead.",
  },
  {
    file: "acp-generic/index.ts",
    kind: "factory",
    reason:
      "Probe results are routed through `normalizeFactoryModels` behind an " +
      '`instance.id === "factory-droid"` branch. Fix: pass it as the existing ' +
      "`normalizeProbeResult` option from the Factory registry entry.",
  },
];

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

/**
 * Drop comments and string/template contents, keeping everything else —
 * including regex bodies, which encode provider knowledge as surely as an
 * identifier does. Regex literals are consumed atomically so a quote inside a
 * character class cannot be mistaken for the start of a string.
 */
function codeOnly(src: string): string {
  let out = "";
  let i = 0;
  /** Last non-whitespace char of real code, to tell regex from division. */
  let prev = "";
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === c) {
          i++;
          break;
        }
        i++;
      }
      out += '""';
      prev = '"';
      continue;
    }
    if (c === "/" && !/[A-Za-z0-9_$)\]]/.test(prev)) {
      i++;
      let body = "";
      let inClass = false;
      while (i < src.length) {
        const ch = src[i]!;
        if (ch === "\\") {
          body += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (ch === "\n") break;
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) {
          i++;
          break;
        }
        body += ch;
        i++;
      }
      out += ` ${body} `;
      prev = "/";
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
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
    const segments = identifierSegments(codeOnly(readFileSync(path, "utf8")));
    const file = relative(AGENTS_DIR, path).split(sep).join("/");
    return kinds.filter((kind) => segments.has(kind)).map((kind) => ({ file, kind }));
  });
  const key = (hit: { file: string; kind: string }) => `${hit.file} → ${hit.kind}`;

  it("has no provider name in an identifier, type, or regex", () => {
    const allowed = new Set(KNOWN_EXCEPTIONS.map(key));
    const violations = found.filter((hit) => !allowed.has(key(hit))).map(key);
    // The hint rides along in the compared value so a failure prints it.
    const report = violations.length > 0 ? [ISOLATION_HINT, ...violations] : [];
    expect(report).toEqual([]);
  });

  it("pins only debt that still exists", () => {
    const present = new Set(found.map(key));
    const stale = KNOWN_EXCEPTIONS.filter((hit) => !present.has(key(hit))).map(key);
    const report =
      stale.length > 0 ? ["Fixed — delete these from KNOWN_EXCEPTIONS.", ...stale] : [];
    expect(report).toEqual([]);
  });
});
