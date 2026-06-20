import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDINGS } from "./keybindings";

describe("DEFAULT_KEYBINDINGS", () => {
  it("keeps close/save shortcuts out of text inputs and unrelated forms", () => {
    const byCommand = Object.fromEntries(
      DEFAULT_KEYBINDINGS.keybindings.map((binding) => [binding.command, binding]),
    );

    expect(byCommand["pane.close"]?.when).toContain("!inputFocus");
    expect(byCommand["pane.close"]?.when).toContain("!terminalFocus");
    expect(byCommand["editor.save"]?.when).toBe("editorFocus");
    expect(byCommand["thread.search.open"]?.when).toContain("!inputFocus");
    expect(byCommand["star.toggle"]?.when).toContain("!inputFocus");
    expect(byCommand["star.toggle"]?.when).toContain("!terminalFocus");
  });
});
