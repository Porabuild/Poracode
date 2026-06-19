import { describe, expect, it } from "vitest";
import { COMPOSER_CONTROL_COMMAND_IDS, DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { bindingForPlatform, canonicalizeKeybinding, type PlatformName } from "./keybindingMatcher";
import { buildCommandRegistry } from "./registry";
import { evaluateWhenClause } from "./when";

const PLATFORMS: PlatformName[] = ["darwin", "win32", "linux"];

const COMPOSER_COMMANDS = new Set<string>(COMPOSER_CONTROL_COMMAND_IDS);

/** Composer-control bindings only fire while the composer is focused; the rest
 * are scoped to !composerFocus. Treat the two as separate keyspaces so they may
 * intentionally reuse a chord (e.g. Ctrl+P) without counting as a collision. */
function isComposerScoped(command: string): boolean {
  return COMPOSER_COMMANDS.has(command);
}

/** Surface-tab bindings fire only while the editor or terminal holds focus —
 * disjoint from both the composer and the global (chat) scope — so they may
 * intentionally reuse global chords (e.g. Ctrl+Shift+], owned by thread.next in
 * the disjoint chat scope). Bucket them as their own keyspace. */
const SURFACE_TAB_COMMANDS = new Set<string>(["tab.next", "tab.previous"]);

function keyspaceFor(command: string): "composer" | "surface" | "global" {
  if (COMPOSER_COMMANDS.has(command)) return "composer";
  if (SURFACE_TAB_COMMANDS.has(command)) return "surface";
  return "global";
}

describe("default keybindings", () => {
  it("reference registered commands", () => {
    const commandIds = new Set(buildCommandRegistry().map((command) => command.id));

    for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
      // Composer controls are dispatched locally by the focused composer, not
      // the global hook, so they're intentionally absent from the registry.
      if (isComposerScoped(binding.command)) continue;
      expect(commandIds.has(binding.command)).toBe(true);
    }
  });

  it("do not collide on any supported platform within a keyspace", () => {
    for (const platform of PLATFORMS) {
      const seen = new Map<string, string>();
      for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
        const key = bindingForPlatform(binding, platform);
        const normalized = key ? canonicalizeKeybinding(key, platform) : undefined;
        if (!normalized) continue;

        // Namespace by keyspace so chords in disjoint focus scopes (composer,
        // surface-tab, global) can intentionally coincide without colliding.
        const slot = `${keyspaceFor(binding.command)}:${normalized}`;
        expect(seen.get(slot)).toBeUndefined();
        seen.set(slot, binding.command);
      }
    }
  });

  it("match intended app contexts", () => {
    const bindings = Object.fromEntries(
      DEFAULT_KEYBINDINGS.keybindings.map((binding) => [binding.command, binding]),
    );
    const idleThreadContext = {
      hasProject: true,
      threadView: true,
      inputFocus: false,
      editorFocus: false,
      terminalFocus: false,
    };

    expect(evaluateWhenClause(bindings["pane.close"]?.when, idleThreadContext)).toBe(true);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        inputFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        panelFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        browserFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        composerFocus: true,
      }),
    ).toBe(false);
    expect(evaluateWhenClause(bindings["thread.search.open"]?.when, idleThreadContext)).toBe(true);
    expect(
      evaluateWhenClause(bindings["thread.search.open"]?.when, {
        ...idleThreadContext,
        panelFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["thread.search.open"]?.when, {
        ...idleThreadContext,
        browserFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["thread.search.open"]?.when, {
        ...idleThreadContext,
        composerFocus: true,
      }),
    ).toBe(false);
    expect(evaluateWhenClause(bindings["editor.save"]?.when, { editorFocus: true })).toBe(true);
    expect(evaluateWhenClause(bindings["editor.save"]?.when, { editorOpen: true })).toBe(false);

    // Archive-thread fires from the sidebar or a side panel, never while typing.
    const archive = bindings["thread.archive"]?.when;
    expect(evaluateWhenClause(archive, { hasThread: true, sidebarFocus: true })).toBe(true);
    expect(evaluateWhenClause(archive, { hasThread: true, panelFocus: true })).toBe(true);
    expect(evaluateWhenClause(archive, { hasThread: true, composerFocus: true })).toBe(false);
    expect(evaluateWhenClause(archive, { hasThread: false, sidebarFocus: true })).toBe(false);

    // Toggle-star shares archive's scope: sidebar or side panel, never typing.
    const star = bindings["thread.star"]?.when;
    expect(evaluateWhenClause(star, { hasThread: true, sidebarFocus: true })).toBe(true);
    expect(evaluateWhenClause(star, { hasThread: true, panelFocus: true })).toBe(true);
    expect(evaluateWhenClause(star, { hasThread: true, composerFocus: true })).toBe(false);
    expect(evaluateWhenClause(star, { hasThread: false, sidebarFocus: true })).toBe(false);

    // Rename-chat shares archive/star's scope: sidebar or side panel, never typing.
    const rename = bindings["thread.rename"]?.when;
    expect(evaluateWhenClause(rename, { hasThread: true, sidebarFocus: true })).toBe(true);
    expect(evaluateWhenClause(rename, { hasThread: true, panelFocus: true })).toBe(true);
    expect(evaluateWhenClause(rename, { hasThread: true, composerFocus: true })).toBe(false);
    expect(evaluateWhenClause(rename, { hasThread: false, sidebarFocus: true })).toBe(false);

    // Focus-address-bar only fires while the in-app browser holds focus.
    const focusAddress = bindings["browser.focus-address-bar"]?.when;
    expect(evaluateWhenClause(focusAddress, { browserFocus: true })).toBe(true);
    expect(evaluateWhenClause(focusAddress, { browserFocus: false })).toBe(false);
    expect(evaluateWhenClause(focusAddress, { composerFocus: true })).toBe(false);

    // Open-browser-tab is browser-scoped too, so it can safely reuse Ctrl+T —
    // the composer owns that chord only within the disjoint composerFocus scope.
    const newTab = bindings["browser.tab.new"]?.when;
    expect(evaluateWhenClause(newTab, { browserFocus: true })).toBe(true);
    expect(evaluateWhenClause(newTab, { browserFocus: false })).toBe(false);
    expect(evaluateWhenClause(newTab, { composerFocus: true })).toBe(false);

    // Next/previous chat switch from anywhere in the chat shell — including while
    // composing — but yield to the editor, terminal, and in-app browser, where
    // these chords carry a local meaning.
    for (const id of ["thread.next", "thread.previous"] as const) {
      const when = bindings[id]?.when;
      expect(evaluateWhenClause(when, { hasThread: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, composerFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, panelFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, sidebarFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, editorFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { hasThread: true, terminalFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { hasThread: true, browserFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { hasThread: false })).toBe(false);
    }

    // Next/previous tab switch only while the editor or terminal holds focus —
    // the exact complement of next/previous chat, which yields those surfaces.
    for (const id of ["tab.next", "tab.previous"] as const) {
      const when = bindings[id]?.when;
      expect(evaluateWhenClause(when, { editorFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { terminalFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, {})).toBe(false);
      expect(evaluateWhenClause(when, { composerFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { browserFocus: true })).toBe(false);
    }
  });
});
