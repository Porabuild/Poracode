import { describe, expect, it } from "vitest";
import type { CanonicalContentBlock } from "@/shared/contracts";
import {
  compactInlinePieces,
  hasChipPiece,
  inlinePiecesFromContent,
  inlinePiecesFromText,
  type PromptInlinePiece,
} from "./promptInlinePieces";

function skillBlock(
  extra: Partial<Extract<CanonicalContentBlock, { kind: "skill" }>> = {},
): CanonicalContentBlock {
  return {
    kind: "skill",
    name: "finalize",
    invocation: "$finalize",
    provider: "fixture",
    scope: "project",
    ...extra,
  } as CanonicalContentBlock;
}

/** Pieces without their React keys, for readable expectations. */
function shape(pieces: PromptInlinePiece[]) {
  return pieces.map((piece) =>
    piece.kind === "text" ? piece.text : `[${JSON.stringify(piece.chip)}]`,
  );
}

describe("inlinePiecesFromContent", () => {
  it("turns a skill block into a skill chip between its text", () => {
    const pieces = inlinePiecesFromContent([
      { kind: "text", text: "run " },
      skillBlock(),
      { kind: "text", text: " now" },
    ]);
    expect(shape(pieces)).toEqual(["run ", '[{"kind":"skill","name":"finalize"}]', " now"]);
  });

  it("keeps the plugin identity of a whole-plugin mention", () => {
    const pieces = inlinePiecesFromContent([
      skillBlock({ name: "build", invocation: "@Acme", pluginId: "acme", pluginName: "Acme" }),
    ]);
    expect(pieces).toMatchObject([
      {
        kind: "chip",
        chip: { kind: "skill", name: "build", pluginId: "acme", pluginName: "Acme" },
      },
    ]);
  });

  it("turns a leading slash command typed as text into one chip", () => {
    const pieces = inlinePiecesFromContent([{ kind: "text", text: "/goal ship it" }]);
    expect(shape(pieces)).toEqual(['[{"kind":"command","command":"goal"}]', "ship it"]);
  });

  it("shows an ACP /skill: command as a skill-flavoured command chip", () => {
    const pieces = inlinePiecesFromContent([{ kind: "text", text: "/skill:review please" }]);
    expect(shape(pieces)).toEqual([
      '[{"kind":"command","command":"review","skillName":"review"}]',
      "please",
    ]);
  });

  it("keeps a slash skill block as that skill rather than a plain command", () => {
    const pieces = inlinePiecesFromContent([
      skillBlock({ name: "code-review", invocation: "/code-review" }),
      { kind: "text", text: " the diff" },
    ]);
    expect(shape(pieces)).toEqual(['[{"kind":"skill","name":"code-review"}]', " the diff"]);
  });

  it("covers mcp, thread and file mentions and leaves attachments out", () => {
    const pieces = inlinePiecesFromContent([
      { kind: "mcp", id: "mcp-1", name: "github" } as CanonicalContentBlock,
      { kind: "thread", threadId: "t1", title: "Earlier" } as CanonicalContentBlock,
      { kind: "file", path: "src/a.ts" } as CanonicalContentBlock,
      { kind: "file", path: "shot.png", source: "attachment" } as CanonicalContentBlock,
    ]);
    expect(pieces.map((piece) => (piece.kind === "chip" ? piece.chip.kind : "text"))).toEqual([
      "mcp",
      "thread",
      "file",
    ]);
  });

  it("reports whether a message renders as chips", () => {
    const chips = (content: CanonicalContentBlock[]) =>
      hasChipPiece(inlinePiecesFromContent(content));
    expect(chips([{ kind: "text", text: "plain words" }])).toBe(false);
    expect(chips([{ kind: "text", text: "/goal x" }])).toBe(true);
    expect(chips([skillBlock()])).toBe(true);
  });
});

describe("inlinePiecesFromText", () => {
  it("chips a $skill token anywhere in the text", () => {
    expect(shape(inlinePiecesFromText("then $finalize it"))).toEqual([
      "then ",
      '[{"kind":"skill","name":"finalize"}]',
      " it",
    ]);
  });

  it("chips a leading slash command", () => {
    expect(shape(inlinePiecesFromText("/code-review fix login"))).toEqual([
      '[{"kind":"command","command":"code-review"}]',
      "fix login",
    ]);
  });

  it("leaves trailing punctuation and a truncation ellipsis outside the chip", () => {
    expect(shape(inlinePiecesFromText("ship it with $finalize..."))).toEqual([
      "ship it with ",
      '[{"kind":"skill","name":"finalize"}]',
      "...",
    ]);
  });

  it("does not chip money, environment variables, paths or plain titles", () => {
    for (const title of ["costs $5 today", "fix $PATH lookup", "/usr/bin broke", "plain title"]) {
      expect(inlinePiecesFromText(title).some((piece) => piece.kind === "chip")).toBe(false);
    }
  });

  it("does not chip a $ glued to a word", () => {
    expect(inlinePiecesFromText("a$b and c").some((piece) => piece.kind === "chip")).toBe(false);
  });
});

describe("compactInlinePieces", () => {
  it("collapses whitespace and trims the ends but keeps chips", () => {
    const pieces = compactInlinePieces(
      inlinePiecesFromContent([
        { kind: "text", text: "  fix\n\nthe   bug " },
        skillBlock(),
        { kind: "text", text: "\n now  " },
      ]),
    );
    expect(shape(pieces)).toEqual(["fix the bug ", '[{"kind":"skill","name":"finalize"}]', " now"]);
  });

  it("drops text that is only whitespace", () => {
    const pieces = compactInlinePieces([
      { kind: "text", key: "a", text: " \n " },
      { kind: "chip", key: "b", chip: { kind: "skill", name: "x" } },
    ]);
    expect(pieces).toHaveLength(1);
  });
});
