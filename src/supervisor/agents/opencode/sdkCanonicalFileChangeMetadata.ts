interface NormalizedOpenCodeChange {
  path?: string;
  kind: { type: string; move_path: string | null };
  diff: string;
}

export function normalizeOpenCodeFileChangeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const changes = readOpenCodeMetadataChanges(metadata);
  if (changes.length === 0) return undefined;
  return { ...metadata, changes };
}

function readOpenCodeMetadataChanges(
  metadata: Record<string, unknown>,
): NormalizedOpenCodeChange[] {
  const existing = normalizeExistingChanges(metadata.changes);
  if (existing.length > 0) return existing;

  const fileChanges = normalizeOpenCodeFileEntries(metadata.files);
  if (fileChanges.length > 0) return fileChanges;

  const diff = readStringField(metadata, "diff", "patch");
  if (!diff) return [];
  const path = readOpenCodeMetadataPath(metadata);
  return [createNormalizedOpenCodeChange({ path, diff, type: readStringField(metadata, "type") })];
}

function normalizeExistingChanges(changes: unknown): NormalizedOpenCodeChange[] {
  if (!Array.isArray(changes)) return [];
  return changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const record = change as Record<string, unknown>;
    const diff = readStringField(record, "diff", "patch");
    if (!diff) return [];
    const kind = record.kind && typeof record.kind === "object" ? record.kind : undefined;
    const kindRecord = kind as Record<string, unknown> | undefined;
    const type = readStringField(kindRecord, "type") ?? readStringField(record, "type");
    return [
      createNormalizedOpenCodeChange({
        path: readOpenCodeMetadataPath(record),
        diff,
        type,
        movePath: readStringField(kindRecord, "move_path", "movePath"),
      }),
    ];
  });
}

function normalizeOpenCodeFileEntries(files: unknown): NormalizedOpenCodeChange[] {
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) => {
    if (!file || typeof file !== "object") return [];
    const record = file as Record<string, unknown>;
    const diff = readStringField(record, "patch", "diff");
    if (!diff) return [];
    return [
      createNormalizedOpenCodeChange({
        path: readOpenCodeMetadataPath(record),
        diff,
        type: readStringField(record, "type"),
      }),
    ];
  });
}

function createNormalizedOpenCodeChange(input: {
  path: string | undefined;
  diff: string;
  type: string | undefined;
  movePath?: string | undefined;
}): NormalizedOpenCodeChange {
  return {
    ...(input.path ? { path: input.path } : {}),
    kind: {
      type: normalizeOpenCodeChangeType(input.type),
      move_path: input.movePath ?? null,
    },
    diff: input.diff,
  };
}

function normalizeOpenCodeChangeType(type: string | undefined): string {
  switch (type?.toLowerCase()) {
    case "add":
    case "create":
      return "add";
    case "delete":
    case "remove":
      return "delete";
    default:
      return "update";
  }
}

function readOpenCodeMetadataPath(record: Record<string, unknown>): string | undefined {
  return readStringField(record, "relativePath", "relative_path", "path", "filePath", "file_path");
}

function readStringField(
  input: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!input) return undefined;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}
