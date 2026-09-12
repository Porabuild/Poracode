package com.poracode.app.ui.projects

/**
 * Derives a project/folder name from a Git clone URL, matching the mobile web clone flow and
 * iOS's `ProjectCloneNaming.folderName(from:)` (ios/App/App/Features/Projects/ProjectManagementDrafts.swift):
 * the destination folder is derived from the repository URL instead of asking for a second,
 * redundant project name.
 *
 * Handles `https://host/owner/repo.git`, `git@host:owner/repo.git`, `ssh://user@host/owner/repo`,
 * trailing `.git` suffixes, trailing slashes, and query/fragment suffixes. Returns an empty
 * string for input that has no derivable segment.
 */
internal fun projectNameFromCloneUrl(rawUrl: String): String {
    var value = rawUrl.trim()
    val suffixStart = value.indexOfFirst { it == '?' || it == '#' }
    if (suffixStart >= 0) value = value.substring(0, suffixStart)
    if (value.endsWith(".git", ignoreCase = true)) {
        value = value.substring(0, value.length - 4)
    }
    while (value.isNotEmpty() && (value.last() == '/' || value.last() == '\\')) {
        value = value.substring(0, value.length - 1)
    }
    if (value.isEmpty()) return ""
    val separatorIndex = value.indexOfLast { it == '/' || it == ':' || it == '\\' }
    return if (separatorIndex >= 0) value.substring(separatorIndex + 1) else value
}
