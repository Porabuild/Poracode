import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  BACKFILL_COMMAND_IDS,
  DEFAULT_KEYBINDINGS,
  type KeybindingsConfig,
  type KeybindingsFile,
  keybindingsFileSchema,
  serializeDefaultKeybindings,
  TOGGLE_FAST_DEFAULT,
  TOGGLE_FAST_LEGACY_DEFAULT,
} from "@/shared/keybindings";

export function readKeybindingsFile(keybindingsPath: string): KeybindingsConfig {
  if (!existsSync(keybindingsPath)) {
    writeFileAtomic(keybindingsPath, serializeDefaultKeybindings(), { encoding: "utf8" });
  }

  const raw = readFileSync(keybindingsPath, "utf8");
  const parsed = keybindingsFileSchema.parse(JSON.parse(raw));
  const migrated = migrateToggleFastOffFind(backfillNewDefaults(parsed));
  if (migrated !== parsed) {
    writeFileAtomic(keybindingsPath, `${JSON.stringify(migrated, null, 2)}\n`, {
      encoding: "utf8",
    });
  }
  return { path: keybindingsPath, file: migrated };
}

/**
 * Additive migration: backfill default bindings for newly-introduced commands
 * into keybinding files that predate them. Only commands with zero existing
 * entries are added, so user customizations are never touched — and because
 * these ids never shipped a default before, no file could have deliberately
 * cleared them, so nothing is resurrected.
 */
function backfillNewDefaults(file: KeybindingsFile): KeybindingsFile {
  const present = new Set(file.keybindings.map((binding) => binding.command));
  const missing = new Set<string>(BACKFILL_COMMAND_IDS.filter((id) => !present.has(id)));
  if (missing.size === 0) return file;

  const additions = DEFAULT_KEYBINDINGS.keybindings.filter((binding) =>
    missing.has(binding.command),
  );
  if (additions.length === 0) return file;

  return { ...file, keybindings: [...file.keybindings, ...additions] };
}

/**
 * One-time rekey: `composer.toggle-fast` used to default to Ctrl+F / ⌘F, which
 * `find.open` (Find) now owns. Any pre-existing entry still sitting on that old
 * default is moved to the new default (Ctrl+Shift+F / ⌘⇧F) so existing installs
 * don't keep a Ctrl+F collision. Entries the user deliberately rebound to some
 * other chord don't match the legacy default and are left untouched.
 */
function migrateToggleFastOffFind(file: KeybindingsFile): KeybindingsFile {
  let changed = false;
  const keybindings = file.keybindings.map((binding) => {
    if (
      binding.command === "composer.toggle-fast" &&
      binding.key === TOGGLE_FAST_LEGACY_DEFAULT.key &&
      binding.mac === TOGGLE_FAST_LEGACY_DEFAULT.mac
    ) {
      changed = true;
      return { ...binding, key: TOGGLE_FAST_DEFAULT.key, mac: TOGGLE_FAST_DEFAULT.mac };
    }
    return binding;
  });
  return changed ? { ...file, keybindings } : file;
}

export function writeKeybindingsFile(
  keybindingsPath: string,
  file: KeybindingsFile,
): KeybindingsConfig {
  const parsed = keybindingsFileSchema.parse(file);
  writeFileAtomic(keybindingsPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8" });
  return { path: keybindingsPath, file: parsed };
}
