package com.poracode.app.session.projects

import com.poracode.app.model.GitDiffBatchResult
import com.poracode.app.model.GitDiffResult
import com.poracode.app.model.GitFileContentResult
import com.poracode.app.model.GitProjectSnapshotResult
import com.poracode.app.model.GitStatusDetail
import com.poracode.app.model.GitStatusResult
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileReadStatus
import com.poracode.app.model.ProjectFileSearchResult
import com.poracode.app.model.ProjectFileWriteResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.ProjectTreeResult
import com.poracode.app.model.ProjectTreeSearchResult
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.transport.ProjectWorkspaceRemoteGateway
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GeneratedProjectWorkspaceSessionGatewayTest {
    @Test
    fun exactHostAndScopesAreRequiredBeforeTransport() = runTest {
        val active = lease(connectionA, generation = 4, scopes = setOf("session:read"))
        val state = MutableStateFlow<ProjectHostLease?>(active)
        var providerCalls = 0
        val gateway = GeneratedProjectWorkspaceSessionGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider {
                providerCalls += 1
                FakeWorkspaceRemote()
            },
        )

        val wrongHost = runCatching {
            gateway.readFile(active, target(connectionB), "README.md")
        }.exceptionOrNull() as ProjectGatewayException
        assertEquals("invalid_project_identity", wrongHost.code)
        assertEquals(0, providerCalls)

        val mutation = runCatching {
            gateway.writeFile(active, target(connectionA), "README.md", "value", 1.0)
        }.exceptionOrNull() as ProjectGatewayException
        assertEquals("missing_scope", mutation.code)
        assertEquals(0, providerCalls)

        val read = gateway.readFile(active, target(connectionA), "README.md")
        assertEquals("README.md", read.path)
        assertEquals(1, providerCalls)
    }

    @Test
    fun hostSwitchDuringReadRejectsStaleResponse() = runTest {
        val hostA = lease(connectionA, generation = 4)
        val state = MutableStateFlow<ProjectHostLease?>(hostA)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val remote = FakeWorkspaceRemote().apply {
            readHandler = { _, path ->
                started.complete(Unit)
                release.await()
                file(path)
            }
        }
        val gateway = GeneratedProjectWorkspaceSessionGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val outcome = CompletableDeferred<Throwable?>()
        backgroundScope.launch {
            outcome.complete(
                runCatching {
                    gateway.readFile(hostA, target(connectionA), "README.md")
                }.exceptionOrNull(),
            )
        }
        runCurrent()
        started.await()
        state.value = lease(connectionB, generation = 1)
        release.complete(Unit)

        val error = outcome.await() as ProjectGatewayException
        assertEquals("stale_lease", error.code)
    }

    @Test
    fun transportFailureMarksOnlyFileWriteAsAmbiguous() = runTest {
        val active = lease(connectionA, generation = 4)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val remote = FakeWorkspaceRemote().apply {
            readHandler = { _, _ -> error("network") }
            writeHandler = { _, _, _, _ -> error("network") }
        }
        val gateway = GeneratedProjectWorkspaceSessionGateway(
            state,
            ProjectWorkspaceRemoteGatewayProvider { remote },
        )
        val read = runCatching {
            gateway.readFile(active, target(connectionA), "README.md")
        }.exceptionOrNull() as ProjectGatewayException
        val write = runCatching {
            gateway.writeFile(active, target(connectionA), "README.md", "value", 1.0)
        }.exceptionOrNull() as ProjectGatewayException

        assertFalse(read.requestMayHaveCommitted)
        assertTrue(write.requestMayHaveCommitted)
        assertEquals(1, remote.readCalls)
        assertEquals(1, remote.writeCalls)
    }

    private fun target(connectionId: com.poracode.app.model.ClientConnectionId) =
        ProjectWorkspaceTarget(ProjectIdentity(connectionId, "project"), PosixProjectLocation("/repo"))
}

private class FakeWorkspaceRemote : ProjectWorkspaceRemoteGateway {
    var readCalls = 0
    var writeCalls = 0
    var readHandler: suspend (ProjectLocation, String) -> ProjectFileReadResult = { _, path -> file(path) }
    var writeHandler: suspend (ProjectLocation, String, String, Double) -> ProjectFileWriteResult =
        { _, _, _, modifiedAt -> ProjectFileWriteResult(modifiedAt + 1) }

    override suspend fun readProjectFile(location: ProjectLocation, path: String): ProjectFileReadResult {
        readCalls += 1
        return readHandler(location, path)
    }

    override suspend fun writeProjectFile(
        location: ProjectLocation,
        path: String,
        content: String,
        baseModifiedAtMs: Double,
    ): ProjectFileWriteResult {
        writeCalls += 1
        return writeHandler(location, path, content, baseModifiedAtMs)
    }

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

    override suspend fun getGitStatus(location: ProjectLocation, detail: GitStatusDetail?) =
        GitStatusResult(
            detail = detail,
            isRepo = false,
            branch = "",
            tracking = "",
            hasRemote = false,
            remoteInfo = null,
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

private fun file(path: String) = ProjectFileReadResult(
    path = path,
    status = ProjectFileReadStatus.Ready,
    modifiedAtMs = 1.0,
    content = "value",
)
