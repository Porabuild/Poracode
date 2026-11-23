import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("composer chip line height", () => {
  it("keeps inline slash chips out of the composer line-box height", () => {
    expect(styles).toMatch(
      /\.poracode-mention-input \.poracode-slash-chip\s*\{\s*margin-bottom: -0\.25em;\s*\}/,
    );
    expect(styles).toMatch(/\.poracode-slash-chip\s*\{[^}]*vertical-align: text-top;/);
  });

  it("aligns file mention chips identically to slash chips inside the composer", () => {
    expect(styles).toMatch(
      /\.poracode-mention-input \.poracode-mention-chip\s*\{\s*margin-bottom: -0\.25em;\s*\}/,
    );
    expect(styles).toMatch(/\.poracode-mention-chip\s*\{[^}]*vertical-align: text-top;/);
    expect(styles).toMatch(/\.poracode-mention-chip\s*\{[^}]*line-height: 1\.3;/);
  });
});
