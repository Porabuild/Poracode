import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings process ownership", () => {
  it("keeps the Electron settings IPC handlers as backend clients", () => {
    const source = readFileSync(join(process.cwd(), "src/main/ipc/localHandlers.ts"), "utf8");
    expect(source).not.toMatch(
      /readSharedSettingsFile|writeSharedSettingsFile|applyToSharedSettingsFile/,
    );
  });

  it("does not persist or acknowledge routing a second time in Electron", () => {
    const source = readFileSync(join(process.cwd(), "src/main/main.ts"), "utf8");
    expect(source).not.toMatch(
      /writeSharedSettingsFile|recordCrossagentSelectionPreference|confirmCrossagentRoutingOverride/,
    );
  });
});
