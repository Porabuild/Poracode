import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { bindingForPlatform, canonicalizeKeybinding, type PlatformName } from "./keybindingMatcher";
import { buildCommandRegistry } from "./registry";
import { evaluateWhenClause } from "./when";

const PLATFORMS: PlatformName[] = ["darwin", "win32", "linux"];

describe("default keybindings", () => {
  it("reference registered commands", () => {
    const commandIds = new Set(buildCommandRegistry().map((command) => command.id));

    for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
      expect(commandIds.has(binding.command)).toBe(true);
    }
  });

  it("do not collide on any supported platform", () => {
    for (const platform of PLATFORMS) {
      const seen = new Map<string, string>();
      for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
        const key = bindingForPlatform(binding, platform);
        const normalized = key ? canonicalizeKeybinding(key, platform) : undefined;
        if (!normalized) continue;

        expect(seen.get(normalized)).toBeUndefined();
        seen.set(normalized, binding.command);
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
  });
});
