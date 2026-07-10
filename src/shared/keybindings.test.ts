import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBINDINGS,
  QUICK_COMPOSER_COMMAND_ID,
  QUICK_COMPOSER_DEFAULT_BINDING,
} from "./keybindings";

describe("DEFAULT_KEYBINDINGS", () => {
  it("keeps close/save shortcuts out of text inputs and unrelated forms", () => {
    const byCommand = Object.fromEntries(
      DEFAULT_KEYBINDINGS.keybindings.map((binding) => [binding.command, binding]),
    );

    expect(byCommand["pane.close"]?.when).toContain("!inputFocus");
    expect(byCommand["pane.close"]?.when).toContain("!terminalFocus");
    expect(byCommand["pane.close"]?.when).toContain("!panelFocus");
    expect(byCommand["pane.close"]?.when).toContain("!browserFocus");
    expect(byCommand["pane.close"]?.when).toContain("!composerFocus");
    expect(byCommand["editor.save"]?.when).toBe("editorFocus");
    expect(byCommand["thread.search.open"]?.when).toContain("!inputFocus");
    expect(byCommand["thread.search.open"]?.when).toContain("!panelFocus");
    expect(byCommand["thread.star"]?.when).toContain("draftView");
    expect(byCommand["thread.star"]?.when).toContain("!inputFocus");
    expect(byCommand["thread.star"]?.when).toContain("!terminalFocus");
  });

  it("ships platform-specific global defaults for the quick composer", () => {
    expect(
      DEFAULT_KEYBINDINGS.keybindings.find(
        (binding) => binding.command === QUICK_COMPOSER_COMMAND_ID,
      ),
    ).toEqual(QUICK_COMPOSER_DEFAULT_BINDING);
  });
});
