import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { buildCommandRegistry } from "./registry";
import { buildShortcutRows, SHORTCUT_CONTEXTS, type ShortcutContext } from "./shortcutCatalog";
import { formatKeybinding, type PlatformName } from "./keybindingMatcher";

const resolveLabel = (value: string | MessageDescriptor): string =>
  typeof value === "string" ? value : (value.message ?? String(value.id));

const PLATFORMS: PlatformName[] = ["darwin", "win32", "linux"];
const CONTEXTS = SHORTCUT_CONTEXTS.map((context) => context.id).filter(
  (context): context is Exclude<ShortcutContext, "all"> => context !== "all",
);

describe("shortcut catalog", () => {
  it("lists Shift+F5 for browser hard reload", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const row = rows.find((item) => item.id === "browser.hard-reload");

      expect(row?.keys).toContain(formatKeybinding("Shift+F5", platform));
    }
  });

  it("documents the editor close-tab key once, without a duplicate row", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const closeRows = rows.filter((row) => row.title.trim().toLowerCase() === "close editor tab");
      expect(closeRows).toHaveLength(1);
      expect(closeRows[0]?.keys).toContain(formatKeybinding("Mod+W", platform));
    }
  });

  it("does not list two rows with the same title in a single context", () => {
    const duplicates: string[] = [];
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      for (const context of CONTEXTS) {
        const seen = new Map<string, string>();
        for (const row of rows) {
          if (!row.contexts.includes(context)) continue;
          const title = row.title.trim().toLowerCase();
          const previous = seen.get(title);
          if (previous) {
            duplicates.push(`${platform} ${context} "${title}": ${previous} vs ${row.id}`);
          }
          seen.set(title, row.id);
        }
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("does not show conflicting shortcuts inside a context", () => {
    const conflicts: string[] = [];

    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );

      for (const context of CONTEXTS) {
        const seen = new Map<string, string>();
        for (const row of rows) {
          if (!row.contexts.includes(context)) continue;
          for (const key of row.keys) {
            const previous = seen.get(key);
            if (previous) {
              conflicts.push(`${platform} ${context} ${key}: ${previous} vs ${row.id}`);
            }
            seen.set(key, row.id);
          }
        }
      }
    }

    expect(conflicts).toEqual([]);
  });
});
