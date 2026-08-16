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
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.ProjectTreeResult
import com.poracode.app.model.ProjectTreeSearchResult
import com.poracode.app.model.ProjectWorkspaceTarget
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectWorkspaceControllerTest {
    @Test
    fun newerTreeRequestWinsWhenEarlierResponseArrivesLast() = runTest {
        val active = lease(connectionA, generation = 7)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val remote = FakeWorkspaceGateway().apply {
            treeHandler = { _, directory ->
                if (directory == "first") {
                    firstStarted.complete(Unit)
                    releaseFirst.await()
                }
                ProjectTreeResult(directory, emptyList())
            }
        }
        val controller = ProjectWorkspaceController(state, remote)
        val target = target(connectionA)

        val first = async { controller.loadTree(target, "first") }
        runCurrent()
        firstStarted.await()
        val second = async { controller.loadTree(target, "second") }
        runCurrent()
        assertTrue(second.await() is ProjectOperationResult.Success)
        releaseFirst.complete(Unit)

        assertEquals(ProjectOperationResult.Stale, first.await())
        val entry = controller.state.value.entries.getValue(target.identity)
        assertEquals("second", entry.directoryPath)
        assertEquals("second", entry.tree?.directoryPath)
        assertFalse(entry.loadingTree)
    }

    @Test
    fun treeAndGitChannelsCanCompleteIndependently() = runTest {
        val active = lease(connectionA, generation = 7)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val remote = FakeWorkspaceGateway()
        val controller = ProjectWorkspaceController(state, remote)
        val target = target(connectionA)

        val tree = async { controller.loadTree(target, "src") }
        val git = async { controller.refreshGit(target, includeGhCheck = true) }
        runCurrent()

        assertTrue(tree.await() is ProjectOperationResult.Success)
        assertTrue(git.await() is ProjectOperationResult.Success)
        val entry = controller.state.value.entries.getValue(target.identity)
        assertEquals("src", entry.tree?.directoryPath)
        assertEquals(false, entry.gitSnapshot?.ghAvailable)
    }

    @Test
    fun saveUsesAuthoritativeMtimeAndSerializesWrites() = runTest {
        val active = lease(connectionA, generation = 7)
        val state = MutableStateFlow<ProjectHostLease?>(active)
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val remote = FakeWorkspaceGateway().apply {
            writeHandler = { _, _, content, base ->
                writeBases += base
                if (content == "first") {
                    firstStarted.complete(Unit)
                    releaseFirst.await()
                }
                ProjectFileWriteResult(base + 1)
            }
        }
        val controller = ProjectWorkspaceController(state, remote)
        val target = target(connectionA)
        assertTrue(controller.openFile(target, "README.md") is ProjectOperationResult.Success)

        val first = async { controller.saveFile(target, "first") }
        runCurrent()
        firstStarted.await()
        val second = async { controller.saveFile(target, "second") }
        runCurrent()
        assertEquals(1, remote.writeCalls)
        releaseFirst.complete(Unit)

        assertTrue(first.await() is ProjectOperationResult.Success)
        assertTrue(second.await() is ProjectOperationResult.Success)
        assertEquals(listOf(10.5, 11.5), remote.writeBases)
        val open = controller.state.value.entries.getValue(target.identity).openFile
        assertEquals("second", open?.content)
        assertEquals(12.5, open?.modifiedAtMs ?: 0.0, 0.0)
    }

    @Test
    fun hostSwitchSuppressesResponseAndClearingProjectInvalidatesState() = runTest {
        val hostA = lease(connectionA, generation = 7)
        val state = MutableStateFlow<ProjectHostLease?>(hostA)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val remote = FakeWorkspaceGateway().apply {
            readHandler = { _, path ->
                started.complete(Unit)
                release.await()
                file(path)
            }
        }
        val controller = ProjectWorkspaceController(state, remote)
        val target = target(connectionA)
        val pending = async { controller.openFile(target, "README.md") }
        runCurrent()
        started.await()
        state.value = lease(connectionB, generation = 1)
        release.complete(Unit)

        assertEquals(ProjectOperationResult.Stale, pending.await())
        assertNull(controller.state.value.entries[target.identity]?.openFile)
        controller.onProjectsChanged(connectionA)
        assertFalse(target.identity in controller.state.value.entries)
    }
}

private class FakeWorkspaceGateway : ProjectWorkspaceGateway {
    var writeCalls = 0
    val writeBases = mutableListOf<Double>()
    var treeHandler: suspend (ProjectWorkspaceTarget, String) -> ProjectTreeResult =
        { _, path -> ProjectTreeResult(path, emptyList()) }
    var readHandler: suspend (ProjectWorkspaceTarget, String) -> ProjectFileReadResult =
        { _, path -> file(path) }
    var writeHandler: suspend (
        ProjectWorkspaceTarget,
        String,
        String,
        Double,
    ) -> ProjectFileWriteResult = { _, _, _, base -> ProjectFileWriteResult(base + 1) }

    override suspend fun listTree(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        directoryPath: String,
    ) = treeHandler(target, directoryPath)

    override suspend fun searchFiles(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ) = ProjectFileSearchResult(emptyList(), 0)

    override suspend fun searchTree(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        query: String,
        limit: Int,
        searchConfig: ProjectSearchConfig?,
    ) = ProjectTreeSearchResult(emptyList())

    override suspend fun readFile(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        path: String,
    ) = readHandler(target, path)

    override suspend fun writeFile(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        path: String,
        content: String,
        baseModifiedAtMs: Double,
    ): ProjectFileWriteResult {
        writeCalls += 1
        return writeHandler(target, path, content, baseModifiedAtMs)
    }

    override suspend fun gitStatus(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        detail: GitStatusDetail?,
    ) = emptyStatus()

    override suspend fun gitDiff(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        filePath: String?,
        staged: Boolean,
    ) = GitDiffResult("")

    override suspend fun gitDiffBatch(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        untrackedPaths: List<String>,
    ) = GitDiffBatchResult(emptyMap(), emptyMap())

    override suspend fun gitFileContent(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        filePath: String,
        staged: Boolean,
    ) = GitFileContentResult("", "")

    override suspend fun gitSnapshot(
        lease: ProjectHostLease,
        target: ProjectWorkspaceTarget,
        includeGhCheck: Boolean,
    ) = GitProjectSnapshotResult(emptyStatus(), null, null, false)
}

private fun target(connectionId: com.poracode.app.model.ClientConnectionId) =
    ProjectWorkspaceTarget(ProjectIdentity(connectionId, "project"), PosixProjectLocation("/repo"))

private fun file(path: String) = ProjectFileReadResult(
    path = path,
    status = ProjectFileReadStatus.Ready,
    modifiedAtMs = 10.5,
    content = "initial",
)

private fun emptyStatus() = GitStatusResult(
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
