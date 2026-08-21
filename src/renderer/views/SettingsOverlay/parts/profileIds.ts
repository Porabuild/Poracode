export function slugifyProfileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "profile"
  );
}

/**
 * Ids are de-duplicated automatically, but two profiles sharing a display name
 * are indistinguishable in the sidebar, the settings list, and the model
 * picker — so the name is checked separately. `exceptId` lets a rename keep its
 * own current name.
 */
export function isDuplicateProfileName(
  name: string,
  instances: ReadonlyArray<{ id: string; displayName?: string | undefined }>,
  exceptId?: string,
): boolean {
  const candidate = name.trim().toLowerCase();
  if (!candidate) return false;
  return instances.some(
    (instance) =>
      instance.id !== exceptId && (instance.displayName ?? instance.id).toLowerCase() === candidate,
  );
}

export function uniqueProfileId(name: string, existing: Readonly<Record<string, unknown>>): string {
  const base = slugifyProfileName(name);
  let candidate = base;
  let index = 2;
  while (existing[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}
