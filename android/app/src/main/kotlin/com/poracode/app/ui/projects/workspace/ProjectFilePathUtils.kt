package com.poracode.app.ui.projects.workspace

/**
 * Joins a project's host-native root path with a project-relative [ProjectFileEntry][
 * com.poracode.app.model.ProjectFileEntry] `path` to produce an absolute, host-usable path for
 * the "copy absolute path" file action. Separator convention follows the root: a root that only
 * uses backslashes (Windows) joins with backslashes; anything else joins with forward slashes.
 *
 * [relativePath] is always project-relative, so a leading slash or backslash is separator noise
 * and is trimmed before joining — it does NOT mean "absolute". A leading Windows drive letter is
 * the one genuinely distinguishable absolute form, and those paths are returned unchanged.
 */
internal fun absoluteFilePath(rootPath: String, relativePath: String): String {
    if (relativePath.isBlank()) return rootPath
    if (relativePath.length > 1 && relativePath[1] == ':') return relativePath
    val usesBackslash = rootPath.contains('\\') && !rootPath.contains('/')
    val separator = if (usesBackslash) '\\' else '/'
    val trimmedRoot = rootPath.trimEnd('/', '\\')
    val trimmedRelative = relativePath.trim('/', '\\').let { trimmed ->
        if (usesBackslash) trimmed.replace('/', '\\') else trimmed.replace('\\', '/')
    }
    return if (trimmedRoot.isEmpty()) trimmedRelative else "$trimmedRoot$separator$trimmedRelative"
}
