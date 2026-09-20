// Shared keybindings write with global-shortcut rollback. One implementation
// for the managed local handler and the standalone-attach device handler,
// which previously carried the same body verbatim (V5 plan 1.4 / H8).

import type { KeybindingsFile } from "@/shared/keybindings";
import { readKeybindingsFile, writeKeybindingsFile } from "./keybindingsFile";

export interface ApplyKeybindingsWriteInput {
  /** Device-local keybindings file (managed root or attach profile root). */
  readonly path: string;
  readonly file: KeybindingsFile;
  /**
   * Re-applies the device shortcut registration. Called with the incoming
   * file before the write and with the on-disk file after a failed write,
   * so the registered shortcuts always match the persisted state.
   */
  onKeybindingsChanged?(file: KeybindingsFile): void;
}

/**
 * Un-suspend capture, re-apply the device shortcuts, then persist; on write
 * failure roll the shortcuts back to the file still on disk (the write is
 * atomic). Returns the written config, exactly like the procedure contract.
 */
export function applyKeybindingsWrite(input: ApplyKeybindingsWriteInput) {
  input.onKeybindingsChanged?.(input.file);
  try {
    return writeKeybindingsFile(input.path, input.file);
  } catch (error) {
    try {
      // The write is atomic, so on failure the file still holds the
      // previous bindings — re-apply them to roll the shortcuts back.
      input.onKeybindingsChanged?.(readKeybindingsFile(input.path).file);
    } catch (restoreError) {
      console.error("[poracode] failed to restore global shortcuts:", restoreError);
    }
    throw error;
  }
}
