import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

function ruleFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));
  if (!match?.[1]) throw new Error(`Missing base style for ${selector}`);
  return match[1];
}

describe("base control styles", () => {
  it("keeps neutral button variants on the theme foreground", () => {
    for (const selector of [".button--primary", ".button--secondary", ".button--tertiary"]) {
      expect(ruleFor(selector)).toContain("--button-fg: var(--foreground)");
    }
  });
});
