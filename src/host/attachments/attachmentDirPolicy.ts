/**
 * Naming policy for attachment directories under one attachments root.
 * Shared by the upload writers (through `attachmentStorage`) and the
 * reclamation service, so both passes classify entries identically.
 */

const PERSISTED_STAGING_ATTACHMENT_PREFIXES = ["draft-", "remote-", "handoff-", "picker-"] as const;

/**
 * Directory entries whose id is a pre-creation staging id (`draft:…`, projected
 * `remote:…`, `handoff:…`, browser `picker-…`) rather than a durable thread id.
 * Their directories are kept by every reclamation pass because persisted
 * messages keep referencing the original absolute file paths.
 */
export function isPersistedStagingAttachmentDirName(entry: string): boolean {
  return PERSISTED_STAGING_ATTACHMENT_PREFIXES.some((prefix) => entry.startsWith(prefix));
}

/**
 * A derived attachment directory name must be a single safe path segment
 * before it is ever joined onto the root: non-empty (an empty name would
 * target the root itself), not `.`/`..`, and free of separators and NUL.
 * Trailing dots/spaces can collapse a component to the root on Windows.
 * Keep the writer's legacy naming format, but refuse such cleanup targets on
 * every platform rather than assuming the current volume's path semantics.
 */
export function isSafeAttachmentDirName(dirName: string): boolean {
  return (
    dirName.replace(/[. ]+$/u, "").length > 0 &&
    dirName !== "." &&
    dirName !== ".." &&
    !dirName.includes("/") &&
    !dirName.includes("\\") &&
    !dirName.includes("\0")
  );
}

/**
 * Alias forms under which one directory name can denote the same directory:
 * exact, NFC/NFD normalizations, their case-folded forms, and — because
 * Windows strips them from the last path segment — the forms with trailing
 * dots and spaces removed. A directory is only reclaimable when NONE of its
 * forms is live, so a case-insensitive volume can never detach (steal) a
 * surviving thread's directory through an alias.
 */
export function attachmentDirNameAliases(dirName: string): string[] {
  const forms = new Set<string>();
  // The writer truncates UTF-16 code units. If that splits a surrogate pair,
  // Node's filesystem encoding writes U+FFFD, which readdir returns. Retain
  // both spellings so a startup scan never mistakes a live directory for an orphan.
  const spellings = new Set([dirName, dirName.toWellFormed()]);
  for (const spelling of spellings) {
    for (const base of new Set([spelling, spelling.normalize("NFC"), spelling.normalize("NFD")])) {
      const trailingStripped = base.replace(/[. ]+$/u, "");
      for (const form of new Set([base, trailingStripped])) {
        forms.add(form);
        forms.add(form.toLowerCase());
        // Lowercase alone misses aliases such as Greek σ/ς and SS/ß. Keeping
        // upper and upper-then-lower forms is deliberately conservative.
        forms.add(form.toUpperCase());
        forms.add(form.toUpperCase().toLowerCase());
      }
    }
  }
  return [...forms];
}
