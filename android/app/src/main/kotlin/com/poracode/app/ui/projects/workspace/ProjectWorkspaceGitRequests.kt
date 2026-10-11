package com.poracode.app.ui.projects.workspace

import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.GitRequests
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.git.GitProcedure
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Pure [GitOperationRequest] builders for [ProjectWorkspaceScreen]'s Git actions and the
 * branch/worktree overlays. Kept free of screen state so the call sites only wire up submission.
 */
internal fun gitStageRequest(location: ProjectLocation, filePath: String): GitOperationRequest =
    GitRequests.create(GitProcedure.Stage, location, mapOf("filePath" to JsonPrimitive(filePath)))

internal fun gitUnstageRequest(location: ProjectLocation, filePath: String): GitOperationRequest =
    GitRequests.create(
        GitProcedure.Unstage,
        location,
        mapOf("filePath" to JsonPrimitive(filePath)),
    )

internal fun gitRevertRequest(location: ProjectLocation, filePath: String): GitOperationRequest =
    GitRequests.create(GitProcedure.Revert, location, mapOf("filePath" to JsonPrimitive(filePath)))

internal fun gitSwitchBranchRequest(location: ProjectLocation, branch: String): GitOperationRequest =
    GitRequests.create(GitProcedure.SwitchBranch, location, mapOf("branch" to JsonPrimitive(branch)))

internal fun gitDeleteBranchRequest(location: ProjectLocation, branch: String): GitOperationRequest =
    GitRequests.create(GitProcedure.DeleteBranch, location, mapOf("branch" to JsonPrimitive(branch)))

// The gateway requires the worktreeLocation owner field to equal the main project location
// exactly (session/projects/GitOperationsGateway.kt requireCurrent), so pull/abort/finish always
// target the main checkout regardless of which worktree row was tapped. True per-worktree scoping
// needs a gateway change.
internal fun gitPullFromSourceRequest(
    location: ProjectLocation,
    sourceBranch: String,
): GitOperationRequest = GitRequests.create(
    GitProcedure.PullFromSource,
    location,
    mapOf("sourceBranch" to JsonPrimitive(sourceBranch)),
)

internal fun gitMergeToSourceRequest(
    location: ProjectLocation,
    worktree: GitWorktreeInfo,
    sourceBranch: String,
): GitOperationRequest = GitRequests.create(
    GitProcedure.MergeToSource,
    location,
    mapOf(
        "worktreeLocation" to RemoteJson.encodeToJsonElement(
            ProjectLocation.serializer(),
            worktreeScopedLocation(location, worktree.path),
        ),
        "worktreeBranch" to JsonPrimitive(worktree.branch),
        "sourceBranch" to JsonPrimitive(sourceBranch),
    ),
)

internal fun gitAbortMergeRequest(location: ProjectLocation): GitOperationRequest =
    GitRequests.create(GitProcedure.AbortMerge, location)

internal fun gitFinishMergeRequest(location: ProjectLocation): GitOperationRequest =
    GitRequests.create(GitProcedure.FinishMerge, location)

internal fun gitRemoveWorktreeRequest(location: ProjectLocation, path: String): GitOperationRequest =
    GitRequests.create(GitProcedure.RemoveWorktree, location, mapOf("path" to JsonPrimitive(path)))
