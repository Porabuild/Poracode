package com.poracode.app.session.projects

import com.poracode.app.model.GitDiffBatchResult
import com.poracode.app.model.GitDiffResult
import com.poracode.app.model.GitFileContentResult
import com.poracode.app.model.GitProjectSnapshotResult
import com.poracode.app.model.GitStatusDetail
import com.poracode.app.model.GitStatusResult
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileReadStatus
import com.poracode.app.model.ProjectFileSearchResult
import com.poracode.app.model.ProjectFileWriteResult
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.ProjectTreeResult
import com.poracode.app.model.ProjectTreeSearchResult
import com.poracode.app.transport.ProjectWorkspaceRemoteGateway

internal abstract class FakeWorkspaceRemoteBase : ProjectWorkspaceRemoteGateway {
    override suspend fun searchProjectFiles(
        location: ProjectLocation,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ) = ProjectFileSearchResult(emptyList(), 0)

    override suspend fun listProjectTree(location: ProjectLocation, directoryPath: String) =
        ProjectTreeResult(directoryPath, emptyList())

    override suspend fun searchProjectTree(
        location: ProjectLocation,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ) = ProjectTreeSearchResult(emptyList())

    override suspend fun readProjectFile(location: ProjectLocation, path: String) =
        ProjectFileReadResult(path, ProjectFileReadStatus.Ready, 1.0, content = "")

    override suspend fun writeProjectFile(
        location: ProjectLocation,
        path: String,
        content: String,
        baseModifiedAtMs: Double,
    ) = ProjectFileWriteResult(baseModifiedAtMs)

    override suspend fun getGitStatus(location: ProjectLocation, detail: GitStatusDetail?) =
        GitStatusResult(
            detail = detail,
            isRepo = true,
            branch = "main",
            tracking = "origin/main",
            hasRemote = true,
            ahead = 0,
            behind = 0,
            staged = emptyList(),
            unstaged = emptyList(),
            totalInsertions = 0,
            totalDeletions = 0,
        )

    override suspend fun getGitDiff(location: ProjectLocation, filePath: String?, staged: Boolean) =
        GitDiffResult("")

    override suspend fun getGitDiffBatch(location: ProjectLocation, untrackedPaths: List<String>) =
        GitDiffBatchResult(emptyMap(), emptyMap())

    override suspend fun getGitFileContent(
        location: ProjectLocation,
        filePath: String,
        staged: Boolean,
    ) = GitFileContentResult("", "")

    override suspend fun gitProjectSnapshot(location: ProjectLocation, includeGhCheck: Boolean) =
        GitProjectSnapshotResult(null, null, null, null)
}
