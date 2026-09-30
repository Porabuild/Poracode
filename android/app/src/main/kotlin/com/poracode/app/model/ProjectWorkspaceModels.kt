package com.poracode.app.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ProjectFileEntryType {
    @SerialName("file")
    File,

    @SerialName("directory")
    Directory,
}

@Serializable
data class ProjectFileEntry(
    val path: String,
    val name: String,
    val type: ProjectFileEntryType,
    val hasChildren: Boolean? = null,
)

@Serializable
data class ProjectSearchConfig(
    val useIgnoreFiles: Boolean,
    val excludePatterns: List<String>,
)

@Serializable
data class ProjectFileSearchResult(
    val entries: List<ProjectFileEntry>,
    val totalIndexed: Long,
)

@Serializable
data class ProjectTreeResult(
    val directoryPath: String,
    val entries: List<ProjectFileEntry>,
)

@Serializable
data class ProjectTreeSearchResult(
    val entries: List<ProjectFileEntry>,
)

@Serializable
enum class ProjectFileReadStatus {
    @SerialName("ready")
    Ready,

    @SerialName("binary")
    Binary,

    @SerialName("too_large")
    TooLarge,

    @SerialName("unsupported")
    Unsupported,
}

@Serializable
enum class ProjectLineEnding {
    @SerialName("lf")
    Lf,

    @SerialName("crlf")
    Crlf,
}

@Serializable
data class ProjectFileReadResult(
    val path: String,
    val status: ProjectFileReadStatus,
    val modifiedAtMs: Double,
    val content: String? = null,
    val contentBase64: String? = null,
    val lineEnding: ProjectLineEnding? = null,
    val hasBom: Boolean? = null,
)

@Serializable
data class ProjectFileWriteResult(
    val modifiedAtMs: Double,
)

@Serializable
enum class GitStatusDetail {
    @SerialName("summary")
    Summary,

    @SerialName("full")
    Full,
}

@Serializable
enum class GitRemotePlatform {
    @SerialName("github")
    GitHub,

    @SerialName("gitlab")
    GitLab,

    @SerialName("bitbucket")
    Bitbucket,

    @SerialName("unknown")
    Unknown,
}

@Serializable
data class GitRemoteInfo(
    val url: String,
    val platform: GitRemotePlatform,
    val owner: String,
    val repo: String,
)

@Serializable
data class GitFileChange(
    val path: String,
    val oldPath: String? = null,
    val status: String,
    val staged: Boolean,
    val insertions: Long,
    val deletions: Long,
)

@Serializable
data class GitStatusResult(
    val detail: GitStatusDetail? = null,
    val isRepo: Boolean,
    val branch: String,
    val headSha: String? = null,
    val tracking: String,
    val hasRemote: Boolean,
    val remoteInfo: GitRemoteInfo? = null,
    val ahead: Long,
    val behind: Long,
    val staged: List<GitFileChange>,
    val unstaged: List<GitFileChange>,
    val totalInsertions: Long,
    val totalDeletions: Long,
    val mergeInProgress: Boolean? = null,
    val mergeMessage: String? = null,
    val conflictFiles: List<GitFileChange>? = null,
)

@Serializable
data class GitDiffResult(
    val diff: String,
)

@Serializable
data class GitDiffBatchResult(
    val staged: Map<String, String>,
    val unstaged: Map<String, String>,
)

@Serializable
data class GitFileContentResult(
    val oldContent: String,
    val newContent: String,
)

@Serializable
data class GitBranchInfo(
    val name: String,
    val current: Boolean,
    val commit: String,
    val isRemote: Boolean,
    val remote: String? = null,
)

@Serializable
data class GitBranchListResult(
    val current: String,
    val branches: List<GitBranchInfo>,
)

@Serializable
data class GitWorktreeInfo(
    val path: String,
    val branch: String,
    val commit: String,
    val isMain: Boolean,
)

@Serializable
data class GitProjectSnapshotResult(
    val status: GitStatusResult?,
    val branches: GitBranchListResult?,
    val worktrees: List<GitWorktreeInfo>?,
    val ghAvailable: Boolean?,
)

data class ProjectWorkspaceTarget(
    val identity: ProjectIdentity,
    val location: ProjectLocation,
)
