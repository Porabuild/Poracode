import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

// Chat diffs sit in a 920px-capped transcript column — just above the 768px
// gutter breakpoint — so the opt-in .poracode-compact-diff-gutter class must
// compact them regardless of container width.
describe("compact diff gutter variant", () => {
  it("ORs the 768px container query with the opt-in class", () => {
    expect(styles).toMatch(
      /@custom-variant compact-diff-gutter\s*\{\s*@container \(max-width: 768px\)\s*\{\s*@slot;\s*\}\s*&:where\(\.poracode-compact-diff-gutter, \.poracode-compact-diff-gutter \*\)\s*\{\s*@slot;\s*\}\s*\}/,
    );
  });

  it("applies the variant to the diff line-number rules", () => {
    expect(styles).toMatch(
      /\.diff-view-wrapper\s*\{\s*@variant compact-diff-gutter\s*\{\s*\.diff-line-num,\s*\.diff-line-hunk-action\s*\{\s*width: 48px !important;/,
    );
  });
});
