package com.poracode.app.ui.projects.workspace

import com.poracode.app.model.GitFileChange
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileReadStatus
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.session.projects.ProjectCapability
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectWorkspaceEntry

enum class ProjectWorkspaceSection { Files, Git, Github }

data class ProjectWorkspaceAccess(
    val exactHost: Boolean,
    val online: Boolean,
    val ready: Boolean,
    val canRead: Boolean,
    val canWrite: Boolean,
) {
    companion object {
        fun from(lease: ProjectHostLease?, identity: ProjectIdentity): ProjectWorkspaceAccess {
            val exactHost = lease?.connectionId == identity.connectionId
            val online = exactHost && lease?.online == true
            val ready = online && lease?.ready == true
            return ProjectWorkspaceAccess(
                exactHost = exactHost,
                online = online,
                ready = ready,
                canRead = ready && ProjectCapability.Read.scope in lease?.scopes.orEmpty(),
                canWrite = ready && ProjectCapability.Operate.scope in lease?.scopes.orEmpty(),
            )
        }
    }
}

data class ProjectWorkspaceActions(
    val canBrowse: Boolean,
    val canSearch: Boolean,
    val canOpenFile: Boolean,
    val canSaveFile: Boolean,
    val canRefreshGit: Boolean,
    val canLoadDiff: Boolean,
)

fun projectWorkspaceActions(
    access: ProjectWorkspaceAccess,
    entry: ProjectWorkspaceEntry,
    dirty: Boolean,
    diffLoading: Boolean,
): ProjectWorkspaceActions = ProjectWorkspaceActions(
    canBrowse = access.canRead && !entry.loadingTree,
    canSearch = access.canRead && !entry.searching,
    canOpenFile = access.canRead && !entry.loadingFile && !entry.savingFile,
    canSaveFile = access.canWrite && dirty && !entry.loadingFile && !entry.savingFile &&
        entry.openFile?.status == ProjectFileReadStatus.Ready,
    canRefreshGit = access.canRead && !entry.loadingGit,
    canLoadDiff = access.canRead && !entry.loadingGit && !diffLoading,
)

enum class ProjectFilePresentation { Empty, Text, Binary, TooLarge, Unsupported }

fun ProjectFileReadResult?.presentation(): ProjectFilePresentation = when (this?.status) {
    null -> ProjectFilePresentation.Empty
    ProjectFileReadStatus.Ready -> ProjectFilePresentation.Text
    ProjectFileReadStatus.Binary -> ProjectFilePresentation.Binary
    ProjectFileReadStatus.TooLarge -> ProjectFilePresentation.TooLarge
    ProjectFileReadStatus.Unsupported -> ProjectFilePresentation.Unsupported
}

fun isProjectFileDirty(file: ProjectFileReadResult?, draft: String): Boolean =
    file?.status == ProjectFileReadStatus.Ready && draft != file.content.orEmpty()

fun projectParentPath(path: String): String {
    val normalized = path.trim('/').trimEnd('/')
    val separator = normalized.lastIndexOf('/')
    return if (separator < 0) "" else normalized.substring(0, separator)
}

enum class GitChangeKind { Added, Modified, Deleted, Renamed, Untracked, Conflicted, Changed }

fun GitFileChange.kind(): GitChangeKind = when (status.lowercase()) {
    "a", "added" -> GitChangeKind.Added
    "m", "modified" -> GitChangeKind.Modified
    "d", "deleted" -> GitChangeKind.Deleted
    "r", "renamed" -> GitChangeKind.Renamed
    "?", "??", "untracked" -> GitChangeKind.Untracked
    "u", "conflict", "conflicted" -> GitChangeKind.Conflicted
    else -> GitChangeKind.Changed
}

enum class GitDiffLineKind { Header, Addition, Deletion, Context }

data class GitDiffLine(
    val text: String,
    val kind: GitDiffLineKind,
)

data class GitDiffDocument(
    val lines: List<GitDiffLine>,
    val truncated: Boolean,
)

fun parseGitDiff(diff: String, limit: Int = MAX_RENDERED_DIFF_LINES): GitDiffDocument {
    require(limit > 0)
    val rawLines = diff.lineSequence().take(limit + 1).toList()
    return GitDiffDocument(
        lines = rawLines.take(limit).map { line ->
            GitDiffLine(
                text = line,
                kind = when {
                    line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") ||
                        line.startsWith("diff ") || line.startsWith("index ") -> GitDiffLineKind.Header
                    line.startsWith('+') -> GitDiffLineKind.Addition
                    line.startsWith('-') -> GitDiffLineKind.Deletion
                    else -> GitDiffLineKind.Context
                },
            )
        },
        truncated = rawLines.size > limit,
    )
}

fun ProjectOperationFailure?.isAmbiguousSaveFailure(): Boolean =
    (this as? ProjectOperationFailure.Remote)?.requestMayHaveCommitted == true

const val MAX_RENDERED_DIFF_LINES = 10_000
