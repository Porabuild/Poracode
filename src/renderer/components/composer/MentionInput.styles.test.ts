import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("composer chip line height", () => {
  it("keeps inline slash chips out of the composer line-box height", () => {
    expect(styles).toMatch(
      /\.poracode-mention-input \.poracode-slash-chip\s*\{\s*margin-block: -0\.25em;\s*\}/,
    );
    expect(styles).toMatch(/\.poracode-slash-chip\s*\{[^}]*vertical-align: middle;/);
  });
});
