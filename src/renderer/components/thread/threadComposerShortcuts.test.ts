import { describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import type { PlatformName } from "@/renderer/commands/keybindingMatcher";
import type { ComposerControl } from "./ThreadComposer";
import { handleComposerControlShortcut } from "./threadComposerShortcuts";

const KB = DEFAULT_KEYBINDINGS.keybindings;

type ShortcutModifiers = Partial<{
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}>;

function shortcutEvent(key: string, modifiers: ShortcutModifiers = {}) {
  return {
    key,
    shiftKey: false,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    ...modifiers,
    preventDefault: vi.fn<() => void>(),
  };
}

/** Run the handler against the real default keybindings so each test exercises
 * the chord → action resolution, not just the action dispatch. */
function dispatch(
  event: ReturnType<typeof shortcutEvent>,
  input: {
    controls: readonly ComposerControl[];
    onOpenModelPicker: () => void;
    onStartDictation?: () => boolean;
  },
  platform: PlatformName = "win32",
): boolean {
  return handleComposerControlShortcut(event, { ...input, keybindings: KB, platform });
}

describe("handleComposerControlShortcut", () => {
  it("toggles Work/Plan with Shift+Tab", () => {
    const onChange = vi.fn<(value: boolean) => void>();
    const event = shortcutEvent("Tab", { shiftKey: true, ctrlKey: false });

    const handled = dispatch(event, {
      controls: [
        {
          kind: "toggle",
          label: "Work",
          isSelected: false,
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("cycles effort with Ctrl+T", () => {
    const onEffortChange = vi.fn<(value: string) => void>();
    const event = shortcutEvent("T");

    dispatch(event, {
      controls: [
        {
          kind: "effort-context",
          efforts: [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium" },
            { id: "high", label: "High" },
          ],
          effortValue: "medium",
          onEffortChange,
          contextSizes: [],
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onEffortChange).toHaveBeenCalledWith("high");
  });

  it("toggles Fast with Ctrl+Shift+F", () => {
    const onChange = vi.fn<(value: boolean) => void>();
    const event = shortcutEvent("f", { shiftKey: true });

    dispatch(event, {
      controls: [
        {
          kind: "toggle",
          label: "Fast",
          isSelected: true,
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("cycles menu permissions with Ctrl+P", () => {
    const onChange = vi.fn<(value: string) => void>();
    const event = shortcutEvent("p");

    dispatch(event, {
      controls: [
        {
          iconKind: "permission",
          value: "default-permissions",
          options: [
            { id: "default-permissions", label: "Default permissions" },
            { id: "auto-review", label: "Auto-review" },
            { id: "full-access", label: "Full access" },
          ],
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("auto-review");
  });

  it("toggles permission toggles with Ctrl+P", () => {
    const onChange = vi.fn<(value: boolean) => void>();
    const event = shortcutEvent("p");

    dispatch(event, {
      controls: [
        {
          kind: "toggle",
          label: "Supervised",
          iconKind: "permission",
          isSelected: false,
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("opens the model picker with Ctrl+M", () => {
    const onOpenModelPicker = vi.fn<() => void>();
    const event = shortcutEvent("m");

    dispatch(event, {
      controls: [
        {
          kind: "provider-model",
          providers: [],
          currentAgentKind: "codex",
          currentModel: "gpt-5.4",
          onChange: () => undefined,
        },
      ],
      onOpenModelPicker,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onOpenModelPicker).toHaveBeenCalledOnce();
  });

  it("starts dictation with Ctrl+Shift+D", () => {
    const onStartDictation = vi.fn<() => boolean>(() => true);
    const event = shortcutEvent("d", { shiftKey: true });

    const handled = dispatch(event, {
      controls: [],
      onOpenModelPicker: () => undefined,
      onStartDictation,
    });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onStartDictation).toHaveBeenCalledOnce();
  });

  it("lets Ctrl+Shift+D fall through when dictation is unavailable", () => {
    const onStartDictation = vi.fn<() => boolean>(() => false);
    const event = shortcutEvent("d", { shiftKey: true });

    const handled = dispatch(event, {
      controls: [],
      onOpenModelPicker: () => undefined,
      onStartDictation,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onStartDictation).toHaveBeenCalledOnce();
  });

  it("supports Meta as the platform command modifier", () => {
    const onOpenModelPicker = vi.fn<() => void>();
    const event = shortcutEvent("m", { ctrlKey: false, metaKey: true });

    const handled = dispatch(
      event,
      {
        controls: [
          {
            kind: "provider-model",
            providers: [],
            currentAgentKind: "codex",
            currentModel: "gpt-5.4",
            onChange: () => undefined,
          },
        ],
        onOpenModelPicker,
      },
      "darwin",
    );

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onOpenModelPicker).toHaveBeenCalledOnce();
  });

  it("does not consume Shift+letter typing", () => {
    const onOpenModelPicker = vi.fn<() => void>();
    const event = shortcutEvent("m", { shiftKey: true, ctrlKey: false });

    const handled = dispatch(event, {
      controls: [
        {
          kind: "provider-model",
          providers: [],
          currentAgentKind: "codex",
          currentModel: "gpt-5.4",
          onChange: () => undefined,
        },
      ],
      onOpenModelPicker,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onOpenModelPicker).not.toHaveBeenCalled();
  });

  it("does not consume unhandled shortcut keys", () => {
    const event = shortcutEvent("x");

    const handled = dispatch(event, {
      controls: [] satisfies ComposerControl[],
      onOpenModelPicker: () => undefined,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
