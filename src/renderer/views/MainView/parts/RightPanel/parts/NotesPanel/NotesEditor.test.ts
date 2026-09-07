import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import { wrapIn } from "@tiptap/pm/commands";

describe("Notes editor dependency compatibility", () => {
  it("round-trips the saved document shape from Tiptap 3.27.1", () => {
    const saved = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Bold" },
            { type: "hardBreak" },
            { type: "text", marks: [{ type: "italic" }], text: "Italic" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Task" }] }],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: null },
          content: [{ type: "text", text: "const saved = true;" }],
        },
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }],
        },
        { type: "horizontalRule" },
      ],
    };
    const schema = getSchema([StarterKit]);
    expect(schema.nodeFromJSON(saved).toJSON()).toEqual(saved);
  });

  it("wraps a note paragraph without mixing ProseMirror model instances", () => {
    const schema = getSchema([StarterKit]);
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("Notes example")),
    ]);
    let state = EditorState.create({ schema, doc });
    expect(
      wrapIn(schema.nodes.blockquote!)(state, (transaction) => {
        state = state.apply(transaction);
      }),
    ).toBe(true);
    expect(state.doc.firstChild?.type.name).toBe("blockquote");
    expect(state.doc.textContent).toBe("Notes example");
  });
});
