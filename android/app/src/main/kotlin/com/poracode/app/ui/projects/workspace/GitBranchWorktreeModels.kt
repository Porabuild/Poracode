package com.poracode.app.ui.projects.workspace

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** One branch as returned by the `gitListBranches` procedure. */
@Serializable
internal data class GitBranchInfo(
    val name: String,
    val current: Boolean,
    val isRemote: Boolean,
    val commit: String,
    val remote: String? = null,
)

@Serializable
internal data class GitBranchListResult(
    val branches: List<GitBranchInfo>,
    val current: String,
)

/** One worktree as returned by the `gitListWorktrees` procedure. */
@Serializable
internal data class GitWorktreeInfo(
    val path: String,
    val branch: String,
    val commit: String,
    val isMain: Boolean,
)

@Serializable
internal data class GitWorktreeListResult(
    val worktrees: List<GitWorktreeInfo>,
)

/** Decodes the raw `gitListBranches` payload cached on [com.poracode.app.session.projects.GitOperationsEntry]. */
internal fun decodeGitBranchList(json: JsonElement?): GitBranchListResult? {
    if (json == null) return null
    return runCatching {
        RemoteJson.decodeFromJsonElement(GitBranchListResult.serializer(), json)
    }.getOrNull()
}

/** Decodes the raw `gitListWorktrees` payload cached on [com.poracode.app.session.projects.GitOperationsEntry]. */
internal fun decodeGitWorktreeList(json: JsonElement?): List<GitWorktreeInfo>? {
    if (json == null) return null
    return runCatching {
        RemoteJson.decodeFromJsonElement(GitWorktreeListResult.serializer(), json)
    }.getOrNull()?.worktrees
}

/**
 * The real, current worktree paths for `gitPruneWorktrees`. Passing an empty list here always
 * looked like "nothing to prune" to the host even when stale worktrees existed, because the
 * confirmation the host relies on to distinguish "gone from disk" from "gone from git" was never
 * populated from a decoded worktree list.
 */
internal fun activeWorktreePaths(worktrees: List<GitWorktreeInfo>?): List<String> =
    worktrees.orEmpty().map { it.path }

/**
 * Derives a [ProjectLocation] scoped to one worktree so per-worktree mutations (abort/finish
 * merge, pull-from-source) target that worktree's checkout rather than the main project
 * location. WSL bridge paths cannot be safely rederived from a bare Linux path without knowing
 * the exact UNC convention the host used, so WSL locations are left pointing at the main project
 * location (unchanged behavior) instead of guessing a possibly-wrong UNC path.
 */
internal fun worktreeScopedLocation(base: ProjectLocation, worktreePath: String): ProjectLocation =
    when (base) {
        is PosixProjectLocation -> base.copy(path = worktreePath)
        is WindowsProjectLocation -> base.copy(path = worktreePath)
        is WslProjectLocation -> base
    }
