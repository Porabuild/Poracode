import { describe, expect, it } from "vitest";
import {
  createDevinPersonaContent,
  parseDevinPersonaDefinition,
  serializeDevinPersonaDefinition,
  validateDevinPersonaCatalog,
  validateDevinPersonaDefinition,
} from "./definitions";

const parse = (content: string, pathId = "reviewer") =>
  parseDevinPersonaDefinition({
    content,
    pathId,
    filePath: `/root/${pathId}.md`,
    origin: "project",
  });

const parseOk = (content: string) => {
  const result = parse(content);
  if (result.status !== "ok") throw new Error(`parse failed: ${result.reason}`);
  return result.definition;
};

describe("native persona definitions", () => {
  it("parses frontmatter fields and preserves unknown keys", () => {
    const result = parse(
      `---
name: reviewer
description: Reviews diffs
model: swe-2-high
allowed-tools:
  - read
  - grep
custom_future_key: keep-me
---
Body text here.`,
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.definition.id).toBe("reviewer");
    expect(result.definition.frontmatter).toMatchObject({
      name: "reviewer",
      description: "Reviews diffs",
      model: "swe-2-high",
      allowedTools: ["read", "grep"],
    });
    expect(result.definition.frontmatter.unknown).toEqual({ custom_future_key: "keep-me" });
    expect(result.definition.body).toBe("Body text here.");
  });

  it("accepts the tools alias and falls back to the path id", () => {
    const result = parse("---\ndescription: x\ntools:\n  - read\n---\n", "fallback-id");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.definition.id).toBe("fallback-id");
    expect(result.definition.frontmatter.allowedTools).toEqual(["read"]);
  });

  it.each([
    ["no frontmatter", "just body text"],
    ["unparseable frontmatter", "---\n: : :\n---\nbody"],
    ["non-mapping frontmatter", "---\n- a\n- b\n---\n"],
  ])("reports malformed definitions: %s", (_label, content) => {
    expect(parse(content).status).toBe("malformed");
  });

  it("flags built-in collisions, missing descriptions, bad nesting and ungrantable tools", () => {
    const builtIn = parse("---\nname: subagent_general\ndescription: x\n---\n");
    expect(builtIn.status).toBe("ok");
    if (builtIn.status !== "ok") return;
    expect(validateDevinPersonaDefinition(builtIn.definition)).toEqual([
      expect.objectContaining({ code: "builtin-name-collision", severity: "error" }),
    ]);

    const loose = parse("---\nmax-nesting: -1\nallowed-tools:\n  - ask_user_question\n---\n");
    expect(loose.status).toBe("ok");
    if (loose.status !== "ok") return;
    const codes = validateDevinPersonaDefinition(loose.definition).map((issue) => issue.code);
    expect(codes).toContain("missing-description");
    expect(codes).toContain("invalid-max-nesting");
    expect(codes).toContain("ungrantable-tool");
  });

  it.each([
    ["string '3'", "max-nesting: '3'"],
    ["bool true", "max-nesting: true"],
    ["array", "max-nesting:\n  - 1"],
    ["fraction 1.5", "max-nesting: 1.5"],
    ["negative -1", "max-nesting: -1"],
    ["float 2.0", "max-nesting: 2.0"],
    ["exponent 2e0", "max-nesting: 2e0"],
    ["negative zero -0", "max-nesting: -0"],
    ["tagged !!float 2.0", "max-nesting: !!float 2.0"],
    ["tagged !!int 2.0", "max-nesting: !!int 2.0"],
    ["tagged !!str null", "max-nesting: !!str null"],
    ["tagged !!null 2", "max-nesting: !!null 2"],
    ["uppercase hex", "max-nesting: 0X10"],
    ["underscores", "max-nesting: 1_000"],
    ["quoted tagged int", 'max-nesting: !!int "2"'],
    ["custom tagged null", "max-nesting: !foo null"],
    ["above u32 max", "max-nesting: 4294967296"],
  ])(
    "reports non-u32 max-nesting (%s) as invalid instead of silently dropping it",
    (_label, fm) => {
      const result = parse(`---\n${fm}\ndescription: x\n---\nbody`);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      const codes = validateDevinPersonaDefinition(result.definition).map((issue) => issue.code);
      expect(codes).toContain("invalid-max-nesting");
    },
  );

  it("keeps the raw max-nesting value for validation instead of dropping it", () => {
    const result = parse("---\ndescription: x\nmax-nesting: '3'\n---\nbody");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.definition.frontmatter.maxNesting).toBe("3");
  });

  it.each([
    ["absent", "description: x"],
    ["zero", "max-nesting: 0\ndescription: x"],
    ["positive", "max-nesting: 3\ndescription: x"],
    ["u32 max", "max-nesting: 4294967295\ndescription: x"],
    ["blank value", "max-nesting:\ndescription: x"],
    ["plain null", "max-nesting: null\ndescription: x"],
    ["hex integer", "max-nesting: 0x10\ndescription: x"],
    ["plus integer", "max-nesting: +2\ndescription: x"],
    ["plus hex integer", "max-nesting: +0x10\ndescription: x"],
    ["plus octal integer", "max-nesting: +0o10\ndescription: x"],
    ["plus binary integer", "max-nesting: +0b10\ndescription: x"],
    ["octal integer", "max-nesting: 0o10\ndescription: x"],
    ["binary integer", "max-nesting: 0b10\ndescription: x"],
    ["custom tagged integer", "max-nesting: !foo 2\ndescription: x"],
    ["tagged !!str 2", "max-nesting: !!str 2\ndescription: x"],
    ["tagged !!float 2", "max-nesting: !!float 2\ndescription: x"],
    ["tagged !!int 2", "max-nesting: !!int 2\ndescription: x"],
    ["tagged !!bool 2", "max-nesting: !!bool 2\ndescription: x"],
    ["tagged null", "max-nesting: !!null null\ndescription: x"],
  ])("accepts native max-nesting (%s)", (_label, fm) => {
    const result = parse(`---\n${fm}\n---\nbody`);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const codes = validateDevinPersonaDefinition(result.definition).map((issue) => issue.code);
    expect(codes).not.toContain("invalid-max-nesting");
  });

  // Pins the AST-derived classification the validator consumes: native u32
  // deserialization is decided by the scalar's plain source text, not the
  // JS value parseYaml-style parsing collapses to.
  describe("native max-nesting scalar classification", () => {
    const parseFmOk = (fm: string) => {
      const result = parse(`---\n${fm}\ndescription: x\n---\nbody`);
      if (result.status !== "ok") throw new Error(`parse failed: ${result.reason}`);
      return result.definition;
    };

    it.each([
      ["absent key", "model: m", { kind: "absent" }],
      ["blank value", "max-nesting:", { kind: "default" }],
      ["plain null", "max-nesting: null", { kind: "default" }],
      ["decimal", "max-nesting: 3", { kind: "u32", value: 3 }],
      ["hex", "max-nesting: 0x10", { kind: "u32", value: 16 }],
      ["tagged !!str", "max-nesting: !!str 2", { kind: "u32", value: 2 }],
      ["tagged !!float", "max-nesting: !!float 2", { kind: "u32", value: 2 }],
      ["tagged !!int", "max-nesting: !!int 2", { kind: "u32", value: 2 }],
      ["alias to anchored int", "anchor: &depth 2\nmax-nesting: *depth", { kind: "u32", value: 2 }],
    ])("classifies native-accepted max-nesting (%s)", (_label, fm, expected) => {
      const definition = parseFmOk(fm);
      expect(definition.frontmatter.maxNestingScalar).toStrictEqual(expected);
      const codes = validateDevinPersonaDefinition(definition).map((issue) => issue.code);
      expect(codes).not.toContain("invalid-max-nesting");
    });

    it("classifies float-lexical and tagged-null sources as native-invalid", () => {
      expect(parseFmOk("max-nesting: 2.0").frontmatter.maxNestingScalar).toStrictEqual({
        kind: "invalid",
      });
      expect(parseFmOk("max-nesting: !!str null").frontmatter.maxNestingScalar).toStrictEqual({
        kind: "invalid",
      });
    });

    it("keeps the raw tagged scalar while classifying its native shape", () => {
      const definition = parseFmOk("max-nesting: !!str 2");
      expect(definition.frontmatter.maxNesting).toBe("2");
      expect(definition.frontmatter.maxNestingScalar).toStrictEqual({ kind: "u32", value: 2 });
    });

    it("falls back to the raw-value u32 check for frontmatter built without an AST", () => {
      const base = {
        id: "built",
        pathId: "built",
        origin: "project" as const,
        filePath: "/root/built.md",
        body: "",
        rawFrontmatter: "",
      };
      const frontmatter = (maxNesting: unknown) => ({
        name: undefined,
        description: "d",
        model: undefined,
        allowedTools: [],
        maxNesting,
        unknown: {},
      });
      const codes = (maxNesting: unknown) =>
        validateDevinPersonaDefinition({ ...base, frontmatter: frontmatter(maxNesting) }).map(
          (issue) => issue.code,
        );
      expect(codes(4294967296)).toContain("invalid-max-nesting");
      expect(codes(3)).not.toContain("invalid-max-nesting");
    });
  });

  it("reports same-name definitions as shadowed instead of merging them", () => {
    const first = parse("---\nname: dup\ndescription: winner\n---\n", "a");
    const second = parse("---\nname: dup\ndescription: loser\n---\n", "b");
    if (first.status !== "ok" || second.status !== "ok") throw new Error("parse failed");
    const issues = validateDevinPersonaCatalog([
      { definition: first.definition },
      { definition: second.definition },
    ]);
    expect(issues).toEqual([expect.objectContaining({ code: "duplicate-name" })]);
    expect(issues[0]?.message).toContain("shadowed");
  });

  it("edits managed keys while preserving unknown frontmatter and the body", () => {
    const original = parse(
      "---\nname: old\ndescription: old\ncustom_key: 1\n---\nOriginal body.",
      "p",
    );
    if (original.status !== "ok") throw new Error("parse failed");
    const next = serializeDevinPersonaDefinition(original.definition, {
      fields: { name: "new", description: "new description", maxNesting: 2 },
      allowedTools: ["read", "write"],
      body: "New body.",
    });
    const reparsed = parse(next, "p");
    expect(reparsed.status).toBe("ok");
    if (reparsed.status !== "ok") return;
    expect(reparsed.definition.frontmatter).toMatchObject({
      name: "new",
      description: "new description",
      maxNesting: 2,
      allowedTools: ["read", "write"],
    });
    expect(reparsed.definition.frontmatter.unknown).toEqual({ custom_key: 1 });
    expect(reparsed.definition.body).toBe("New body.");
  });

  it("creates new definition content", () => {
    const content = createDevinPersonaContent({
      name: "scout",
      description: "Explores the repo",
      model: "swe-2-medium",
      allowedTools: ["read"],
      body: "Do recon.",
    });
    const parsed = parse(content, "scout");
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.definition.frontmatter).toMatchObject({
      name: "scout",
      description: "Explores the repo",
      model: "swe-2-medium",
      allowedTools: ["read"],
    });
    expect(parsed.definition.body).toBe("Do recon.");
  });

  it("omits allowed-tools from created content only when undefined", () => {
    const without = createDevinPersonaContent({ name: "s", description: "d" });
    expect(without).not.toContain("allowed-tools");
    // An explicitly supplied empty list is a real (empty) restriction, not an omission.
    const empty = createDevinPersonaContent({ name: "s", description: "d", allowedTools: [] });
    expect(empty).toContain("allowed-tools: []");
    const parsed = parse(empty, "s");
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.definition.frontmatter.allowedTools).toEqual([]);
  });
});

describe("native persona partial-edit lossless policy", () => {
  // Alias `tools:`, comments, a multiline unknown key, and trailing unknown keys all present.
  const LOSSLESS_FM = [
    "# fixture header",
    "name: reviewer",
    "description: Reviews diffs",
    "custom_future_key:",
    "  alpha: 1",
    "  beta: two",
    "tools:",
    "  - read",
    "  - grep",
    "model: swe-2-high",
    "max-nesting: 1",
    "# trailing note",
    "unknown_after: keep",
  ].join("\n");
  const parseFm = (fm: string, pathId = "reviewer") => parse(`---\n${fm}\n---\nBody text.`, pathId);
  const parseFmOk = (fm: string) => {
    const result = parseFm(fm);
    if (result.status !== "ok") throw new Error(`parse failed: ${result.reason}`);
    return result.definition;
  };

  it.each(["name", "description"] as const)(
    "replaces the valid spaced YAML key %s without duplicating it",
    (key) => {
      const fm = `name : old\ndescription : existing\ntools :\n  - read\nunknown : keep`;
      const next = serializeDevinPersonaDefinition(parseFmOk(fm), { fields: { [key]: "new" } });
      const result = parse(next);
      if (result.status !== "ok") throw new Error(result.reason);
      expect(result.definition.frontmatter[key]).toBe("new");
      expect(result.definition.frontmatter.allowedTools).toEqual(["read"]);
      expect(result.definition.frontmatter.unknown).toEqual({ unknown: "keep" });
    },
  );

  it.each([
    "tools:\n  - read\n# keep the note\n\n  - grep",
    "tools:\n- read\n# keep the note\n\n- grep",
  ])("replaces complete tool sequences across comments without orphaning items: %s", (tools) => {
    const definition = parseFmOk(`name: scout\ndescription: d\n${tools}\nunknown: kept`);
    const next = serializeDevinPersonaDefinition(definition, { fields: {}, allowedTools: [] });
    const result = parse(next);
    if (result.status !== "ok") throw new Error(result.reason);
    expect(result.definition.frontmatter.allowedTools).toEqual([]);
    expect(result.definition.frontmatter.unknown).toEqual({ unknown: "kept" });
    expect(next).toContain("# keep the note");
    expect(next).not.toContain("- read");
    expect(next).not.toContain("- grep");
  });

  it.each(["true", "false", "null", "123", "1.5", "---"])(
    "retains the string type of YAML-looking scalar %s during create and edit",
    (value) => {
      const created = parse(
        createDevinPersonaContent({ name: value, description: value, model: value }),
      );
      if (created.status !== "ok") throw new Error(created.reason);
      expect(created.definition.frontmatter).toMatchObject({
        name: value,
        description: value,
        model: value,
      });
      const edited = parse(
        serializeDevinPersonaDefinition(parseFmOk("name: scout\ndescription: d"), {
          fields: { name: value, description: value, model: value },
        }),
      );
      if (edited.status !== "ok") throw new Error(edited.reason);
      expect(edited.definition.frontmatter).toMatchObject({
        name: value,
        description: value,
        model: value,
      });
    },
  );

  it("keeps the raw frontmatter byte-identical under a body-only edit", () => {
    const next = serializeDevinPersonaDefinition(parseFmOk(LOSSLESS_FM), {
      fields: {},
      body: "New body.",
    });
    expect(next).toBe(`---\n${LOSSLESS_FM}\n---\nNew body.`);
  });

  it("replaces only the supplied key under a one-field edit", () => {
    const next = serializeDevinPersonaDefinition(parseFmOk(LOSSLESS_FM), {
      fields: { description: "Edited" },
    });
    expect(next).toBe(
      `---\n${LOSSLESS_FM.replace("description: Reviews diffs", "description: Edited")}\n---\nBody text.`,
    );
  });

  it("re-emits a supplied tools list under the alias the file used", () => {
    const next = serializeDevinPersonaDefinition(parseFmOk(LOSSLESS_FM), {
      fields: {},
      allowedTools: ["shell"],
    });
    expect(next).toBe(
      `---\n${LOSSLESS_FM.replace("tools:\n  - read\n  - grep", "tools:\n  - shell")}\n---\nBody text.`,
    );
    const reparsed = parseFm(next);
    expect(reparsed.status).toBe("ok");
    if (reparsed.status !== "ok") return;
    expect(reparsed.definition.frontmatter.allowedTools).toEqual(["shell"]);
  });

  it("treats the allowed-tools spelling the same way under a one-field edit", () => {
    const fm = "name: scout\ndescription: d\nallowed-tools:\n  - read\nunknown: 1";
    const next = serializeDevinPersonaDefinition(parseFmOk(fm), {
      fields: { model: "m2" },
    });
    // The restriction and unknown key stay verbatim; the new key appends after the block.
    expect(next).toBe(
      "---\nname: scout\ndescription: d\nallowed-tools:\n  - read\nunknown: 1\nmodel: m2\n---\nBody text.",
    );
  });

  it("serializes a supplied empty list as an explicit empty restriction, not a removal", () => {
    const fm = "name: scout\ndescription: d\nallowed-tools:\n  - read";
    const next = serializeDevinPersonaDefinition(parseFmOk(fm), {
      fields: {},
      allowedTools: [],
    });
    expect(next).toContain("allowed-tools: []");
    expect(next).not.toContain("  - read");
    const reparsed = parseFm(next);
    expect(reparsed.status).toBe("ok");
    if (reparsed.status !== "ok") return;
    expect(reparsed.definition.frontmatter.allowedTools).toEqual([]);
  });

  it("keeps quoted managed-key spellings lossless instead of duplicating them", () => {
    const fm = '"tools":\n  - read\nname: q\ndescription: d';
    const definition = parseFmOk(fm);
    const next = serializeDevinPersonaDefinition(definition, {
      fields: {},
      allowedTools: ["shell"],
    });
    const reparsed = parseFm(next);
    expect(reparsed.status).toBe("ok");
    if (reparsed.status !== "ok") return;
    expect(reparsed.definition.frontmatter.allowedTools).toEqual(["shell"]);
    expect(next).not.toContain("  - read");
  });

  it("serializes an empty string as an explicit value, not an omission", () => {
    const next = serializeDevinPersonaDefinition(parseFmOk("name: scout\ndescription: d"), {
      fields: { description: "" },
    });
    expect(next).toContain('description: ""');
    const reparsed = parseFm(next);
    expect(reparsed.status).toBe("ok");
    if (reparsed.status !== "ok") return;
    expect(reparsed.definition.frontmatter.description).toBe("");
  });
});

describe("native persona edit faithfulness (root-indent AST guards)", () => {
  const serializeFm = (fm: string, edit: Parameters<typeof serializeDevinPersonaDefinition>[1]) =>
    serializeDevinPersonaDefinition(parseOk(`---\n${fm}\n---\nBody text.`), edit);

  it("edits the root field of an indented mapping in place at the root indent", () => {
    const next = serializeFm("  name: scout\n  description: original\n  custom: kept", {
      fields: { description: "edited" },
    });
    expect(next).toBe("---\n  name: scout\n  description: edited\n  custom: kept\n---\nBody text.");
    const reparsed = parse(next);
    if (reparsed.status !== "ok") throw new Error(reparsed.reason);
    expect(reparsed.definition.frontmatter).toMatchObject({ name: "scout", description: "edited" });
    expect(reparsed.definition.frontmatter.unknown).toEqual({ custom: "kept" });
  });

  it("edits only the root description when an unknown nested key is also named description", () => {
    const next = serializeFm(
      "  name: scout\n  description: original\n  custom:\n    description: nested",
      { fields: { description: "edited" } },
    );
    expect(next).toBe(
      "---\n  name: scout\n  description: edited\n  custom:\n    description: nested\n---\nBody text.",
    );
    const reparsed = parse(next);
    if (reparsed.status !== "ok") throw new Error(reparsed.reason);
    expect(reparsed.definition.frontmatter.description).toBe("edited");
    expect(reparsed.definition.frontmatter.unknown).toEqual({ custom: { description: "nested" } });
  });

  it("appends supplied fields at the root indent of an indented mapping", () => {
    const next = serializeFm("  name: scout\n  custom: kept", {
      fields: { description: "added", model: "m1" },
    });
    expect(next).toBe(
      "---\n  name: scout\n  custom: kept\n  description: added\n  model: m1\n---\nBody text.",
    );
  });

  it("keeps CRLF endings and root indentation through an edit", () => {
    const definition = parseOk("---\r\n  name: scout\r\n  description: old\r\n---\r\nBody text.");
    const next = serializeDevinPersonaDefinition(definition, { fields: { description: "edited" } });
    expect(next).toBe("---\r\n  name: scout\r\n  description: edited\r\n---\r\nBody text.");
  });

  it("preserves an edited root scalar's anchor so untouched aliases stay resolvable", () => {
    const next = serializeFm("name: scout\ndescription: &d original\ncustom: *d", {
      fields: { description: "edited" },
    });
    expect(next).toBe("---\nname: scout\ndescription: &d edited\ncustom: *d\n---\nBody text.");
    const reparsed = parse(next);
    if (reparsed.status !== "ok") throw new Error(reparsed.reason);
    expect(reparsed.definition.frontmatter.description).toBe("edited");
    expect(reparsed.definition.frontmatter.unknown).toEqual({ custom: "edited" });
  });

  it("refuses a replaced collection whose nested anchor is referenced outside the replaced block", () => {
    const definition = parseOk(
      "---\nname: scout\ndescription: d\ntools:\n  - &t read\nother: *t\n---\nBody text.",
    );
    expect(() =>
      serializeDevinPersonaDefinition(definition, { fields: {}, allowedTools: ["shell"] }),
    ).toThrow(/anchor/);
  });

  it("refuses flow-styled root mappings instead of appending malformed block keys", () => {
    const definition = parseOk("---\n{name: scout, description: original}\n---\nBody text.");
    expect(() =>
      serializeDevinPersonaDefinition(definition, { fields: { description: "edited" } }),
    ).toThrow(/flow-styled/);
    expect(() => serializeDevinPersonaDefinition(definition, { fields: { model: "m1" } })).toThrow(
      /flow-styled/,
    );
  });

  it.each([
    ["flow mapping opened under the key", "name: scout\ndescription: {\n  a: 1\n}"],
    ["flow sequence opened under the key", "name: scout\ndescription: [\n  a\n]"],
  ])("refuses multi-line values the line editor cannot replace faithfully: %s", (_label, fm) => {
    const definition = parseOk(`---\n${fm}\n---\nBody text.`);
    expect(() =>
      serializeDevinPersonaDefinition(definition, { fields: { description: "edited" } }),
    ).toThrow(/spans lines/);
  });

  it("refuses anchored managed-key spellings it cannot re-emit faithfully", () => {
    const definition = parseOk("---\n&k description: original\n---\nBody text.");
    expect(() =>
      serializeDevinPersonaDefinition(definition, { fields: { description: "edited" } }),
    ).toThrow(/spelling/);
  });
});

describe("native persona unknown root pairs survive replacements (AST boundaries)", () => {
  // Each unknown pair sits directly after the replaced root description, the
  // exact position where the old line-swallowing emitter dropped it: the pair
  // is valid YAML at the root indent but outside the managed-key grammar.
  it.each([
    ["quoted key with spaces", "  'custom data': preserved", { "custom data": "preserved" }],
    ["dotted key", "  custom.key: kept", { "custom.key": "kept" }],
    ["underscore-led key", "  _custom: kept", { _custom: "kept" }],
    ["numeric key", "  123: kept", { 123: "kept" }],
    ["explicit key spelling", "  ? custom\n  : kept", { custom: "kept" }],
    [
      "unknown mapping with a nested description",
      "  custom.key:\n    description: nested",
      { "custom.key": { description: "nested" } },
    ],
  ])(
    "preserves the unknown root pair (%s) when the indented description is replaced",
    (_label, unknownPair, unknown) => {
      const content = `---\n  name: test\n  description: original\n${unknownPair}\n  model: swe-2-high\n---\nBody text.`;
      const next = serializeDevinPersonaDefinition(parseOk(content), {
        fields: { description: "edited" },
      });
      expect(next).toBe(content.replace("description: original", "description: edited"));
      const reparsed = parse(next);
      if (reparsed.status !== "ok") throw new Error(reparsed.reason);
      expect(reparsed.definition.frontmatter.unknown).toEqual(unknown);
      expect(reparsed.definition.frontmatter.model).toBe("swe-2-high");
      expect(reparsed.definition.body).toBe("Body text.");
    },
  );
});

describe("native persona empty values with tag/anchor property lines", () => {
  // A zero-length AST value can own tag/anchor syntax on a line of its own
  // (`description:` + a standalone `  !!str` / `&d` / `&d !!str` line). The
  // replacement must consume that property line — bytes left behind fold into
  // the edited value (or break implicit-key parsing after a comment) — while
  // never reaching past it into the next root pair. Anchored forms keep their
  // anchor on the replacement so untouched aliases resolve to the new value.
  const cases: [string, string, string[], string[], boolean][] = [
    ["tag-only !!str line (LF)", "\n", ["description:", "  !!str"], ["description: edited"], false],
    [
      "tag-only !!str line (CRLF)",
      "\r\n",
      ["description:", "  !!str"],
      ["description: edited"],
      false,
    ],
    [
      "anchored &d line with alias (LF)",
      "\n",
      ["description:", "  &d"],
      ["description: &d edited"],
      true,
    ],
    [
      "anchored &d line with alias (CRLF)",
      "\r\n",
      ["description:", "  &d"],
      ["description: &d edited"],
      true,
    ],
    [
      "anchored tagged &d !!str line with alias (LF)",
      "\n",
      ["description:", "  &d !!str"],
      ["description: &d edited"],
      true,
    ],
    [
      "anchored tagged &d !!str line with alias (CRLF)",
      "\r\n",
      ["description:", "  &d !!str"],
      ["description: &d edited"],
      true,
    ],
    [
      "anchor with inline comment (LF)",
      "\n",
      ["description:", "  &d # keep"],
      ["description: &d edited"],
      true,
    ],
    [
      "anchor with inline comment (CRLF)",
      "\r\n",
      ["description:", "  &d # keep"],
      ["description: &d edited"],
      true,
    ],
    [
      "comment before the anchor (LF)",
      "\n",
      ["description:", "# separator", "  &d"],
      ["description: &d edited", "# separator"],
      true,
    ],
    [
      "comment before the anchor (CRLF)",
      "\r\n",
      ["description:", "# separator", "  &d"],
      ["description: &d edited", "# separator"],
      true,
    ],
    ["ordinary empty value (LF)", "\n", ["description:"], ["description: edited"], false],
    ["ordinary empty value (CRLF)", "\r\n", ["description:"], ["description: edited"], false],
    [
      "empty value with separator comment (LF)",
      "\n",
      ["description:", "# separator"],
      ["description: edited", "# separator"],
      false,
    ],
    [
      "empty value with separator comment (CRLF)",
      "\r\n",
      ["description:", "# separator"],
      ["description: edited", "# separator"],
      false,
    ],
    [
      "tagged explicit empty string (LF)",
      "\n",
      ["description:", '  !!str ""'],
      ["description: edited"],
      false,
    ],
    [
      "tagged explicit empty string (CRLF)",
      "\r\n",
      ["description:", '  !!str ""'],
      ["description: edited"],
      false,
    ],
  ];

  it.each(cases)("%s", (_label, eol, valueLines, expectedLines, anchored) => {
    const tail = anchored ? ["custom.key: kept", "alias: *d"] : ["custom.key: kept"];
    const content = ["---", "name: test", ...valueLines, ...tail, "---", "Body text."].join(eol);
    const next = serializeDevinPersonaDefinition(parseOk(content), {
      fields: { description: "edited" },
    });
    expect(next).toBe(
      ["---", "name: test", ...expectedLines, ...tail, "---", "Body text."].join(eol),
    );
    // Semantic assertions run on the actual reparsed output, not the requested input.
    const reparsed = parse(next);
    if (reparsed.status !== "ok") throw new Error(reparsed.reason);
    expect(reparsed.definition.frontmatter.description).toBe("edited");
    expect(reparsed.definition.frontmatter.unknown).toEqual(
      anchored ? { "custom.key": "kept", alias: "edited" } : { "custom.key": "kept" },
    );
    expect(reparsed.definition.body).toBe("Body text.");
  });
});
