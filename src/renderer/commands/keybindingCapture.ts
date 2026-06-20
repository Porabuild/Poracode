/**
 * While the Shortcuts editor is recording a new chord, the global keybinding
 * hook must stand down — otherwise pressing an already-bound chord (e.g. Ctrl+P)
 * would fire its command instead of being captured. The recorder flips this flag
 * for the duration of a "Press shortcut…" capture.
 */
let capturing = false;

export function isCapturingKeybinding(): boolean {
  return capturing;
}

export function setCapturingKeybinding(value: boolean): void {
  capturing = value;
}
