import {
  bindingForPlatform,
  QUICK_COMPOSER_COMMAND_ID,
  QUICK_COMPOSER_SHORTCUT_UNAVAILABLE_CODE,
  type KeybindingsFile,
} from "@/shared/keybindings";

interface GlobalShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

const ELECTRON_PUNCTUATION_KEYS = new Set("`~!@#$%^&*()_+={}[]|\\:;\"'<>,.?/-");

const NAMED_ACCELERATOR_PARTS: Record<string, string> = {
  alt: "Alt",
  altgr: "AltGr",
  cmd: "Command",
  command: "Command",
  commandorcontrol: "CommandOrControl",
  control: "Ctrl",
  ctrl: "Ctrl",
  down: "Down",
  enter: "Enter",
  esc: "Escape",
  escape: "Escape",
  left: "Left",
  meta: "Meta",
  mod: "CommandOrControl",
  option: "Alt",
  pageup: "PageUp",
  pagedown: "PageDown",
  return: "Enter",
  right: "Right",
  shift: "Shift",
  space: "Space",
  super: "Meta",
  tab: "Tab",
  up: "Up",
};

export class QuickComposerShortcutUnavailableError extends Error {
  constructor(accelerator: string) {
    super(`${QUICK_COMPOSER_SHORTCUT_UNAVAILABLE_CODE}:${accelerator}`);
    this.name = "QuickComposerShortcutUnavailableError";
  }
}

export function resolveQuickComposerAccelerators(
  file: KeybindingsFile,
  platform: NodeJS.Platform,
): string[] {
  const accelerators = new Set<string>();
  for (const binding of file.keybindings) {
    if (binding.command !== QUICK_COMPOSER_COMMAND_ID) continue;
    const raw = bindingForPlatform(binding, platform);
    if (!raw) continue;
    const accelerator = toElectronAccelerator(raw);
    if (!accelerator) throw new QuickComposerShortcutUnavailableError(raw);
    accelerators.add(accelerator);
  }
  return [...accelerators];
}

export class QuickComposerShortcutManager {
  private activeAccelerators: string[] = [];

  constructor(
    private readonly registry: GlobalShortcutRegistry,
    private readonly platform: NodeJS.Platform,
    private readonly onToggle: () => void,
    private readonly onChanged: (accelerator: string | null) => void,
  ) {}

  get active(): readonly string[] {
    return this.activeAccelerators;
  }

  apply(file: KeybindingsFile): void {
    const next = resolveQuickComposerAccelerators(file, this.platform);
    if (
      next.length === this.activeAccelerators.length &&
      next.every((accelerator, index) => accelerator === this.activeAccelerators[index])
    ) {
      return;
    }

    const previous = this.activeAccelerators;
    this.unregister(previous);

    const registered: string[] = [];
    try {
      for (const accelerator of next) {
        if (!this.registry.register(accelerator, this.onToggle)) {
          throw new QuickComposerShortcutUnavailableError(accelerator);
        }
        registered.push(accelerator);
      }
    } catch (error) {
      this.unregister(registered);
      this.activeAccelerators = previous.filter((accelerator) =>
        this.registry.register(accelerator, this.onToggle),
      );
      this.onChanged(this.activeAccelerators[0] ?? null);
      throw error;
    }

    this.activeAccelerators = registered;
    this.onChanged(registered[0] ?? null);
  }

  dispose(): void {
    this.unregister(this.activeAccelerators);
    this.activeAccelerators = [];
    this.onChanged(null);
  }

  private unregister(accelerators: readonly string[]): void {
    for (const accelerator of accelerators) this.registry.unregister(accelerator);
  }
}

function toElectronAccelerator(raw: string): string | null {
  const modifiers: string[] = [];
  const mainKeys: string[] = [];
  for (const part of raw.split("+")) {
    const normalized = normalizeAcceleratorPart(part);
    if (!normalized) return null;
    if (isModifier(normalized)) {
      if (!modifiers.includes(normalized)) modifiers.push(normalized);
    } else {
      mainKeys.push(normalized);
    }
  }
  if (mainKeys.length !== 1) return null;
  return [...modifiers, mainKeys[0]!].join("+");
}

function normalizeAcceleratorPart(part: string): string | null {
  const trimmed = part.trim();
  const lower = trimmed.toLowerCase();
  const named = NAMED_ACCELERATOR_PARTS[lower];
  if (named) return named;
  if (/^[a-z0-9]$/u.test(lower)) return lower.toUpperCase();
  if (/^f(?:[1-9]|1\d|2[0-4])$/u.test(lower)) return lower.toUpperCase();
  if (trimmed.length === 1 && ELECTRON_PUNCTUATION_KEYS.has(trimmed)) return trimmed;
  return null;
}

function isModifier(part: string): boolean {
  return ["Alt", "AltGr", "Command", "CommandOrControl", "Ctrl", "Meta", "Shift"].includes(part);
}
