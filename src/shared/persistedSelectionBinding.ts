import { isRecognizedSelectionBinding } from "./selectionBinding";

/**
 * Inspect one known selection-bearing persisted object, never arbitrary plugin
 * data. A projection is not write authority: callers must recheck the original
 * authoritative value before replacement, even when the replacement omits it.
 */
export function hasUnsupportedSelectionBinding(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "selectionBinding");
  if (!descriptor) return false;
  return !("value" in descriptor) || !isRecognizedSelectionBinding(descriptor.value);
}

/**
 * Conservative persisted-read projection: remove only unsupported metadata.
 * Every actual control remains exact, and the original object is untouched.
 * Wire validators remain strict. This function never repairs stored bytes or
 * authorizes a write of its projection.
 */
export function projectPersistedSelectionBinding(value: unknown): unknown {
  if (!hasUnsupportedSelectionBinding(value)) return value;
  const projected = Object.getOwnPropertyDescriptors(value);
  delete projected.selectionBinding;
  return Object.defineProperties({}, projected);
}
