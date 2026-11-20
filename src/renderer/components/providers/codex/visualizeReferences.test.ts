import { describe, expect, it } from "vitest";
import { splitVisualizeReferences } from "./visualizeReferences";

const reference =
  '\ue200visualize\ue202{"path":"poracode-surfaces.html","mode":"wide","title":"Example"}\ue201';

describe("splitVisualizeReferences", () => {
  it("reads an absolute Windows path with JSON escaping", () => {
    const path = "C:\\Workspace\\Surface proposals.html";
    const text = `\ue200visualize\ue202${JSON.stringify({ path })}\ue201`;
    expect(splitVisualizeReferences(text)).toEqual([{ kind: "html-file", path, title: "" }]);
  });

  it.each([
    `\`${reference}\``,
    `- \`\`\`text\n  ${reference}\n  \`\`\``,
    `\\${reference}`,
    reference.slice(0, -1),
    reference.replace("poracode-surfaces.html", "https://example.com/visual.html"),
    reference.replace("poracode-surfaces.html", "figure.svg"),
  ])("keeps a literal or invalid reference as Markdown", (text) => {
    expect(splitVisualizeReferences(text)).toEqual([{ kind: "markdown", text }]);
  });
});
