import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireFromApp = createRequire(import.meta.url);
const requireFromRehypeKatex = createRequire(requireFromApp.resolve("rehype-katex"));

function katexVersion(require: NodeJS.Require): string {
  return (require("katex/package.json") as { version: string }).version;
}

describe("KaTeX dependency", () => {
  // tailwind.css imports the app's katex.min.css, while rehype-katex emits markup
  // from its own katex. KaTeX renames layout classes between minor versions, so a
  // mismatch leaves fractions and superscripts unpositioned.
  it("styles math with the same KaTeX version that rehype-katex renders with", () => {
    expect(katexVersion(requireFromRehypeKatex)).toBe(katexVersion(requireFromApp));
  });
});
