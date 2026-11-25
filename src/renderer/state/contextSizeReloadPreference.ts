import { removeStoredKey, writeStoredString } from "@/renderer/utils/localStorage";

// Renderer-local opt-out for the "context size change reloads the session"
// confirmation. Absent (the default for every existing profile) means ask;
// the only stored value is the explicit opt-out, so no migration is needed.
const PREF_KEY = "poracode-confirm-context-size-reload";
const OPT_OUT = "never";

export function shouldConfirmContextSizeReload(): boolean {
  return localStorage.getItem(PREF_KEY) !== OPT_OUT;
}

export function setConfirmContextSizeReload(confirm: boolean): void {
  if (confirm) removeStoredKey(PREF_KEY);
  else writeStoredString(PREF_KEY, OPT_OUT);
}
