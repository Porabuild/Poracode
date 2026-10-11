/**
 * Canonical domain message thrown when an editor save loses an mtime
 * baseline race. Producers import this constant verbatim: the native writer
 * (`projectFileWrites.writeNativeEditorFile`) and the projectTree WSL paths.
 * The standalone WSL bridge itself reports a different error (code `EMTIME`);
 * projectTree normalizes that commit-time failure to this canonical error
 * while unrelated bridge errors keep their identity. The message crosses the
 * supervisor IPC boundary as a plain string and is matched by exact equality
 * in the remote procedure passthrough to answer with an actionable
 * `409 file_save_conflict`. Do not fork this string — every producer and the
 * remote matcher must share it.
 */
export const FILE_SAVE_CONFLICT_MESSAGE = "The file changed on disk. Reload it before saving.";
