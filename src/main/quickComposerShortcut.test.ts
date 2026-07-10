import { describe, expect, it, vi } from "vitest";
import {
  QUICK_COMPOSER_COMMAND_ID,
  QUICK_COMPOSER_DEFAULT_BINDING,
  type KeybindingsFile,
} from "@/shared/keybindings";
import {
  QuickComposerShortcutManager,
  QuickComposerShortcutUnavailableError,
  resolveQuickComposerAccelerators,
} from "./quickComposerShortcut";

const defaults: KeybindingsFile = {
  version: 1,
  keybindings: [QUICK_COMPOSER_DEFAULT_BINDING],
};

describe("resolveQuickComposerAccelerators", () => {
  it.each([
    ["win32", "Ctrl+Alt+Space"],
    ["darwin", "Meta+Shift+Space"],
    ["linux", "Ctrl+Shift+Space"],
  ] as const)("uses the %s-specific binding", (platform, expected) => {
    expect(resolveQuickComposerAccelerators(defaults, platform)).toEqual([expected]);
  });

  it("supports multiple bindings and removes duplicates", () => {
    expect(
      resolveQuickComposerAccelerators(
        {
          version: 1,
          keybindings: [
            { command: QUICK_COMPOSER_COMMAND_ID, key: "Ctrl+Alt+Space" },
            { command: QUICK_COMPOSER_COMMAND_ID, key: "control+alt+space" },
            { command: QUICK_COMPOSER_COMMAND_ID, key: "Meta+Shift+K" },
          ],
        },
        "linux",
      ),
    ).toEqual(["Ctrl+Alt+Space", "Meta+Shift+K"]);
  });

  it("rejects bindings Electron cannot register", () => {
    expect(() =>
      resolveQuickComposerAccelerators(
        {
          version: 1,
          keybindings: [{ command: QUICK_COMPOSER_COMMAND_ID, key: "Ctrl+NotAKey" }],
        },
        "win32",
      ),
    ).toThrow(QuickComposerShortcutUnavailableError);
  });
});

describe("QuickComposerShortcutManager", () => {
  it("replaces the active shortcut and reports the effective tray binding", () => {
    const register = vi.fn<(accelerator: string, callback: () => void) => boolean>(() => true);
    const unregister = vi.fn<(accelerator: string) => void>();
    const onChanged = vi.fn<(accelerator: string | null) => void>();
    const onToggle = vi.fn<() => void>();
    const manager = new QuickComposerShortcutManager(
      { register, unregister },
      "win32",
      onToggle,
      onChanged,
    );

    manager.apply(defaults);
    manager.apply({
      version: 1,
      keybindings: [{ command: QUICK_COMPOSER_COMMAND_ID, key: "Ctrl+Shift+K" }],
    });

    expect(unregister).toHaveBeenCalledWith("Ctrl+Alt+Space");
    expect(manager.active).toEqual(["Ctrl+Shift+K"]);
    expect(onChanged).toHaveBeenLastCalledWith("Ctrl+Shift+K");
    register.mock.calls.at(-1)?.[1]();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("restores the previous shortcut when the replacement is unavailable", () => {
    const register = vi.fn<(accelerator: string, callback: () => void) => boolean>(
      (accelerator) => accelerator !== "Ctrl+Shift+K",
    );
    const unregister = vi.fn<(accelerator: string) => void>();
    const onChanged = vi.fn<(accelerator: string | null) => void>();
    const manager = new QuickComposerShortcutManager(
      { register, unregister },
      "win32",
      vi.fn<() => void>(),
      onChanged,
    );
    manager.apply(defaults);

    expect(() =>
      manager.apply({
        version: 1,
        keybindings: [{ command: QUICK_COMPOSER_COMMAND_ID, key: "Ctrl+Shift+K" }],
      }),
    ).toThrow(QuickComposerShortcutUnavailableError);

    expect(manager.active).toEqual(["Ctrl+Alt+Space"]);
    expect(register).toHaveBeenLastCalledWith("Ctrl+Alt+Space", expect.any(Function));
    expect(onChanged).toHaveBeenLastCalledWith("Ctrl+Alt+Space");
  });

  it("allows the shortcut to be unassigned", () => {
    const unregister = vi.fn<(accelerator: string) => void>();
    const onChanged = vi.fn<(accelerator: string | null) => void>();
    const manager = new QuickComposerShortcutManager(
      { register: () => true, unregister },
      "win32",
      vi.fn<() => void>(),
      onChanged,
    );
    manager.apply(defaults);

    manager.apply({ version: 1, keybindings: [] });

    expect(unregister).toHaveBeenCalledWith("Ctrl+Alt+Space");
    expect(manager.active).toEqual([]);
    expect(onChanged).toHaveBeenLastCalledWith(null);
  });
});
