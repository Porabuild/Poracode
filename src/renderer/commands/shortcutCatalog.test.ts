// @vitest-environment node

import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";
import {
  COMPOSER_CONTROL_COMMAND_IDS,
  DEFAULT_KEYBINDINGS,
  QUICK_COMPOSER_COMMAND_ID,
} from "@/shared/keybindings";
import { buildCommandRegistry } from "./registry";
import { buildShortcutRows, SHORTCUT_CONTEXTS, type ShortcutContext } from "./shortcutCatalog";
import { formatKeybinding, type PlatformName } from "./keybindingMatcher";

const resolveLabel = (value: string | MessageDescriptor): string =>
  typeof value === "string" ? value : (value.message ?? String(value.id));

const PLATFORMS = ["darwin", "win32", "linux"] as const satisfies readonly PlatformName[];
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

  it("exposes composer controls as editable, store-backed rows", () => {
    const rows = buildShortcutRows(
      buildCommandRegistry(),
      DEFAULT_KEYBINDINGS.keybindings,
      "win32",
      resolveLabel,
    );

    for (const id of COMPOSER_CONTROL_COMMAND_IDS) {
      const row = rows.find((item) => item.id === id);
      expect(row?.id).toBe(id);
      expect(row?.editable).toBe(true);
      expect(row?.commandId).toBe(id);
      expect(row?.section).toBe("composer");
    }

    // The default key surfaces even though these aren't registry commands.
    const effort = rows.find((item) => item.id === "composer.cycle-effort");
    expect(effort?.keys).toContain(formatKeybinding("Ctrl+T", "win32"));
  });

  it("exposes the global quick composer binding with platform-specific keys", () => {
    const expected = {
      darwin: "Meta+Shift+Space",
      win32: "Ctrl+Alt+Space",
      linux: "Ctrl+Shift+Space",
    } as const;
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const row = rows.find((item) => item.id === QUICK_COMPOSER_COMMAND_ID);

      expect(row).toMatchObject({
        title: "Toggle Quick Composer",
        editable: true,
        commandId: QUICK_COMPOSER_COMMAND_ID,
        section: "general",
        contexts: ["global"],
      });
      expect(row?.keys).toEqual([formatKeybinding(expected[platform], platform)]);
    }
  });

  it("does not expose chat slash commands as shortcut rows", () => {
    const rows = buildShortcutRows(
      [
        {
          id: "chat.command.skill",
          title: "/skill",
          group: "Chat Commands",
          showInShortcuts: false,
          run: () => {},
        },
      ],
      [],
      "win32",
      resolveLabel,
    );

    expect(rows.some((row) => row.id === "chat.command.skill")).toBe(false);
  });

  it("does not expose inactive project script bindings as custom rows", () => {
    const rows = buildShortcutRows(
      [
        {
          id: "script.active.run",
          title: "Run active",
          group: "Scripts",
          when: "hasProject",
          run: () => {},
        },
      ],
      [
        { command: "script.active.run", key: "Ctrl+R" },
        { command: "script.other-project.run", key: "Ctrl+R" },
      ],
      "win32",
      resolveLabel,
    );

    expect(rows.some((row) => row.commandId === "script.active.run")).toBe(true);
    expect(rows.some((row) => row.commandId === "script.other-project.run")).toBe(false);
  });

  it("exposes the browser focus-address-bar command as an editable browser row", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const row = rows.find((item) => item.id === "browser.focus-address-bar");

      expect(row?.editable).toBe(true);
      expect(row?.commandId).toBe("browser.focus-address-bar");
      expect(row?.section).toBe("browser");
      expect(row?.contexts).toContain("browser");
      expect(row?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+L" : "Ctrl+L", platform),
      );
    }
  });

  it("exposes the new-browser-tab command as an editable browser row", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const row = rows.find((item) => item.id === "browser.tab.new");

      expect(row?.editable).toBe(true);
      expect(row?.commandId).toBe("browser.tab.new");
      expect(row?.section).toBe("browser");
      expect(row?.contexts).toContain("browser");
      expect(row?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+T" : "Ctrl+T", platform),
      );
    }
  });

  it("exposes the toggle-file-tree command as an editable project row", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const row = rows.find((item) => item.id === "files.toggle");

      expect(row?.editable).toBe(true);
      expect(row?.commandId).toBe("files.toggle");
      expect(row?.section).toBe("project");
      expect(row?.contexts).toContain("project");
      expect(row?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+Shift+E" : "Ctrl+Shift+E", platform),
      );
    }
  });

  it("exposes the add-project command as an editable project row", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const row = rows.find((item) => item.id === "project.add");

      expect(row?.editable).toBe(true);
      expect(row?.commandId).toBe("project.add");
      expect(row?.section).toBe("project");
      expect(row?.contexts).toContain("project");
      expect(row?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+O" : "Ctrl+O", platform),
      );
    }
  });

  it("exposes the toggle-side-panel command as an editable general row", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );
      const row = rows.find((item) => item.id === "sidebar.toggle");

      expect(row?.editable).toBe(true);
      expect(row?.commandId).toBe("sidebar.toggle");
      expect(row?.section).toBe("general");
      expect(row?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+B" : "Ctrl+B", platform),
      );
    }
  });

  it("exposes next/previous chat as editable Thread rows", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );

      const next = rows.find((item) => item.id === "thread.next");
      expect(next?.editable).toBe(true);
      expect(next?.commandId).toBe("thread.next");
      expect(next?.section).toBe("thread");
      expect(next?.contexts).toContain("thread");
      expect(next?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+Shift+]" : "Ctrl+Shift+]", platform),
      );
      expect(next?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+PageDown" : "Ctrl+PageDown", platform),
      );

      const previous = rows.find((item) => item.id === "thread.previous");
      expect(previous?.section).toBe("thread");
      expect(previous?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+Shift+[" : "Ctrl+Shift+[", platform),
      );
      expect(previous?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+PageUp" : "Ctrl+PageUp", platform),
      );
    }
  });

  it("exposes next/previous tab as editable general rows scoped to editor and terminal", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );

      const next = rows.find((item) => item.id === "tab.next");
      expect(next?.editable).toBe(true);
      expect(next?.commandId).toBe("tab.next");
      expect(next?.section).toBe("general");
      expect(next?.contexts).toEqual(expect.arrayContaining(["editor", "terminal"]));
      expect(next?.keys).toContain(formatKeybinding("Ctrl+Tab", platform));
      expect(next?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+PageDown" : "Ctrl+PageDown", platform),
      );

      const previous = rows.find((item) => item.id === "tab.previous");
      expect(previous?.editable).toBe(true);
      expect(previous?.commandId).toBe("tab.previous");
      expect(previous?.section).toBe("general");
      expect(previous?.contexts).toEqual(expect.arrayContaining(["editor", "terminal"]));
      expect(previous?.keys).toContain(formatKeybinding("Ctrl+Shift+Tab", platform));
      expect(previous?.keys).toContain(
        formatKeybinding(platform === "darwin" ? "Meta+PageUp" : "Ctrl+PageUp", platform),
      );
    }
  });

  it("documents browser back/forward as read-only keyboard rows", () => {
    for (const platform of PLATFORMS) {
      const rows = buildShortcutRows(
        buildCommandRegistry(),
        DEFAULT_KEYBINDINGS.keybindings,
        platform,
        resolveLabel,
      );

      const back = rows.find((item) => item.id === "browser.back");
      expect(back?.editable).toBe(false);
      expect(back?.section).toBe("browser");
      expect(back?.contexts).toContain("browser");
      expect(back?.keys).toContain(formatKeybinding("Mod+[", platform));

      const forward = rows.find((item) => item.id === "browser.forward");
      expect(forward?.editable).toBe(false);
      expect(forward?.section).toBe("browser");
      expect(forward?.contexts).toContain("browser");
      expect(forward?.keys).toContain(formatKeybinding("Mod+]", platform));
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

  it("detects command contexts independent of the active locale", () => {
    // Simulate a non-English locale: a resolver that mangles every label so any
    // context detection that keyed off the *translated* group (instead of the
    // canonical English token) would silently fall back to ["global"].
    const translate = (value: string | MessageDescriptor): string =>
      `xx-${typeof value === "string" ? value : (value.message ?? String(value.id))}`;

    const rows = buildShortcutRows(
      buildCommandRegistry(),
      DEFAULT_KEYBINDINGS.keybindings,
      "darwin",
      translate,
    );

    // `terminal.toggle` (group "Terminal") and `thread.search.open` (group
    // "Thread", no `when`) categorize purely off their group token.
    expect(rows.find((row) => row.id === "terminal.toggle")?.contexts).toContain("terminal");
    expect(rows.find((row) => row.id === "thread.search.open")?.contexts).toContain("thread");
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
