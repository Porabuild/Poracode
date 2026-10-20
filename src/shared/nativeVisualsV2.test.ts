import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NATIVE_VISUAL_V2_FORMAT_VERSION, parseNativeVisual } from "./nativeVisuals";

const text = { type: "text", text: "Plain authored content" };
const outputs = { type: "outputs", items: [{ label: "Total", value: 1 }] };
const checklist = (count: number) => ({
  type: "checklist",
  items: Array.from({ length: count }, (_, index) => ({
    id: `item${index}`,
    label: `Item ${index}`,
  })),
});
const diagram = {
  type: "diagram",
  nodes: [
    { id: "start", label: "Start", tone: "accent" },
    { id: "finish", label: "Finish" },
  ],
  edges: [{ from: "start", to: "finish", label: "Continue" }],
};
const tabs = (children: unknown[]) => ({
  type: "tabs",
  tabs: [{ id: "first", label: "First", blocks: children }],
});
const parse = (value: unknown) => parseNativeVisual(JSON.stringify(value), 2);

describe("native v2 aggregate declarative boundary", () => {
  it("admits the actual canonical core-skill v1 and v2 authoring examples", () => {
    const skill = readFileSync(
      "resources/plugins/app-controls/skills/app-controls/SKILL.md",
      "utf8",
    );
    const examples = [
      ...skill.matchAll(/```poracode-visual-v([12]) [^\r\n]+\r?\n([\s\S]*?)\r?\n```/g),
    ];
    expect(examples.map((match) => match[1])).toEqual(["1", "2"]);
    for (const match of examples)
      expect(
        match[1] === "1" ? parseNativeVisual(match[2]!).ok : parseNativeVisual(match[2]!, 2).ok,
      ).toBe(true);
  });

  it("admits plain native content and keeps strict v1 acceptance unchanged", () => {
    expect(NATIVE_VISUAL_V2_FORMAT_VERSION).toBe(2);
    const legacy = JSON.stringify({ blocks: [outputs] });
    expect(parseNativeVisual(legacy)).toEqual(parseNativeVisual(legacy, 2));
    const source = JSON.stringify({
      layout: "dashboard",
      accent: "success",
      blocks: [text, checklist(3), tabs([outputs, diagram])],
    });
    expect(parseNativeVisual(source).ok).toBe(false);
    expect(parseNativeVisual(source, 2)).toMatchObject({
      ok: true,
      spec: { inputs: [], layout: "dashboard", accent: "success" },
    });
  });

  it("treats all authored labels and text as plain data, including inactive tabs", () => {
    const attack =
      '<script>new RTCPeerConnection()</script><img src="https://invalid" onerror="run()">';
    expect(
      parse({
        blocks: [
          tabs([
            { type: "text", text: attack },
            { type: "checklist", items: [{ id: "data", label: attack, checked: true }] },
          ]),
        ],
      }),
    ).toMatchObject({ ok: true });
    for (const value of [
      { ...text, html: attack },
      { type: "text", text: { html: attack } },
      { type: "checklist", items: [{ id: "a", label: "Run", action: "tools/call" }] },
      { ...diagram, nodes: [{ id: "a", label: "Link", url: "https://invalid" }] },
      { ...tabs([text]), onSelect: "run()" },
    ])
      expect(parse({ blocks: [value] }).ok).toBe(false);
  });

  it.each(["#fff", "url(/probe)", ["success"], { toString: "app" }, null, 1])(
    "rejects non-enumerated or non-string accent %j without coercion",
    (accent) => {
      expect(parse({ accent, blocks: [text] }).ok).toBe(false);
      expect(
        parse({ blocks: [{ ...diagram, nodes: [{ id: "a", label: "Node", tone: accent }] }] }).ok,
      ).toBe(false);
    },
  );

  it("requires finite unique checklist and tab identities and disallows nested containers", () => {
    for (const block of [
      checklist(0),
      checklist(33),
      {
        type: "checklist",
        items: [
          { id: "a", label: "First" },
          { id: "a", label: "Second" },
        ],
      },
      { type: "checklist", items: [{ id: "a", label: "First", checked: "true" }] },
      { type: "checklist", items: [{ id: "a.b", label: "First" }] },
      tabs([tabs([text])]),
      { type: "tabs", tabs: [] },
      {
        type: "tabs",
        tabs: [
          { id: "a", label: "A", blocks: [text] },
          { id: "a", label: "B", blocks: [text] },
        ],
      },
      {
        type: "tabs",
        tabs: Array.from({ length: 5 }, (_, index) => ({
          id: `tab${index}`,
          label: "Tab",
          blocks: [text],
        })),
      },
    ])
      expect(parse({ blocks: [block] }).ok).toBe(false);
    expect(parse({ blocks: [checklist(32), tabs([checklist(32)])] }).ok).toBe(true);
    expect(parse({ blocks: [checklist(32), tabs([checklist(32), checklist(1)])] }).ok).toBe(false);
  });

  it("counts inactive child blocks, text and numeric slots against aggregate budgets", () => {
    expect(parse({ blocks: Array.from({ length: 9 }, () => text) }).ok).toBe(false);
    const manyTabs = Array.from({ length: 4 }, (_, index) => ({
      id: `t${index}`,
      label: "Tab",
      blocks: [text, text],
    }));
    expect(parse({ blocks: [{ type: "tabs", tabs: manyTabs }, text, text, text] }).ok).toBe(true);
    expect(parse({ blocks: [{ type: "tabs", tabs: manyTabs }, text, text, text, text] }).ok).toBe(
      false,
    );
    const long = { type: "text", text: "x".repeat(4_096) };
    expect(parse({ blocks: [long, tabs([long, long])] }).ok).toBe(false);
    const table = {
      type: "table",
      columns: Array.from({ length: 8 }, () => ({ label: "Value" })),
      rows: Array.from({ length: 100 }, () => Array.from({ length: 8 }, () => 1)),
    };
    expect(parse({ blocks: [table, tabs([table])] }).ok).toBe(false);
  });

  it("admits all six legal single-child tab containers without resetting the aggregate budget", () => {
    const six = Array.from({ length: 6 }, () => tabs([text]));
    expect(parse({ blocks: six }).ok).toBe(true);
    expect(parse({ blocks: [...six, tabs([text])] }).ok).toBe(false);
    expect(parse({ blocks: [...six, text] }).ok).toBe(false);
  });

  it("reuses the closed expression vocabulary and aggregate work budget across every tab", () => {
    const input = { id: "amount", label: "Amount", min: 0, max: 100, step: 1, value: 10 };
    const block = {
      type: "outputs",
      items: [{ label: "Scaled", value: { op: "multiply", args: [{ input: "amount" }, 2] } }],
    };
    expect(parse({ inputs: [input], blocks: [tabs([block])] }).ok).toBe(true);
    for (const value of [
      "amount*2",
      { op: "fetch", args: [1, 2] },
      { input: "unknown" },
      { op: ["add"], args: [1, 2] },
    ]) {
      expect(
        parse({ blocks: [tabs([{ type: "outputs", items: [{ label: "Bad", value }] }])] }).ok,
      ).toBe(false);
    }
    let expression: unknown = 1;
    for (let depth = 0; depth < 10; depth++)
      expression = { op: "add", args: [expression, expression] };
    const expensive = { type: "outputs", items: [{ label: "Work", value: expression }] };
    expect(parse({ blocks: [expensive, tabs([expensive])] }).ok).toBe(true);
    const overWork = {
      blocks: [
        expensive,
        tabs([
          expensive,
          {
            type: "outputs",
            items: Array.from({ length: 3 }, () => ({ label: "Extra", value: 1 })),
          },
        ]),
      ],
    };
    expect(new TextEncoder().encode(JSON.stringify(overWork)).length).toBeLessThan(64 * 1024);
    expect(parse(overWork).ok).toBe(false);
  });

  it("admits only bounded acyclic diagrams with known unique endpoints", () => {
    expect(parse({ blocks: [diagram] }).ok).toBe(true);
    for (const invalid of [
      { ...diagram, nodes: [diagram.nodes[0], diagram.nodes[0]] },
      { ...diagram, edges: [{ from: "start", to: "unknown" }] },
      { ...diagram, edges: [{ from: "start", to: "start" }] },
      { ...diagram, edges: [diagram.edges[0], diagram.edges[0]] },
      { ...diagram, edges: [...diagram.edges, { from: "finish", to: "start" }] },
      { ...diagram, direction: "custom-css" },
      {
        ...diagram,
        nodes: Array.from({ length: 17 }, (_, index) => ({ id: `n${index}`, label: "Node" })),
        edges: [],
      },
    ])
      expect(parse({ blocks: [invalid] }).ok).toBe(false);
    const nodes = Array.from({ length: 9 }, (_, index) => ({ id: `n${index}`, label: "Node" }));
    expect(
      parse({
        blocks: [
          { type: "diagram", nodes, edges: [] },
          tabs([{ type: "diagram", nodes, edges: [] }]),
        ],
      }).ok,
    ).toBe(false);
    const edges = nodes.flatMap((node, index) =>
      nodes.slice(index + 1).map((target) => ({ from: node.id, to: target.id })),
    );
    expect(parse({ blocks: [{ type: "diagram", nodes, edges: edges.slice(0, 24) }] }).ok).toBe(
      true,
    );
    expect(parse({ blocks: [{ type: "diagram", nodes, edges: edges.slice(0, 25) }] }).ok).toBe(
      false,
    );
    const small = {
      type: "diagram",
      nodes: nodes.slice(0, 8),
      edges: edges.filter((edge) => edge.to !== "n8").slice(0, 13),
    };
    expect(parse({ blocks: [small, tabs([small])] }).ok).toBe(false);
  });
});
