package com.poracode.app.session.projects

import com.poracode.app.model.GitProjectSnapshotResult
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileSearchResult
import com.poracode.app.model.ProjectFileWriteResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.ProjectTreeResult
import com.poracode.app.model.ProjectWorkspaceTarget
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class ProjectWorkspaceEntry(
    val directoryPath: String = "",
    val tree: ProjectTreeResult? = null,
    val searchQuery: String = "",
    val searchResult: ProjectFileSearchResult? = null,
    val openFile: ProjectFileReadResult? = null,
    val gitSnapshot: GitProjectSnapshotResult? = null,
    val loadingTree: Boolean = false,
    val searching: Boolean = false,
    val loadingFile: Boolean = false,
    val savingFile: Boolean = false,
    val loadingGit: Boolean = false,
    val failure: ProjectOperationFailure? = null,
)

data class ProjectWorkspaceState(
    val entries: Map<ProjectIdentity, ProjectWorkspaceEntry> = emptyMap(),
)

private enum class WorkspaceChannel { Tree, Search, File, Git }

private data class WorkspaceOperationKey(
    val identity: ProjectIdentity,
    val channel: WorkspaceChannel,
)

/** Owns newest-request-wins workspace state without allowing cross-host installs. */
class ProjectWorkspaceController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: ProjectWorkspaceGateway,
) : ProjectsChangedListener {
    private val revisions = ConcurrentHashMap<WorkspaceOperationKey, AtomicLong>()
    private val saveMutexes = ConcurrentHashMap<ProjectIdentity, Mutex>()
    private val mutableState = MutableStateFlow(ProjectWorkspaceState())
    val state: StateFlow<ProjectWorkspaceState> = mutableState.asStateFlow()

    suspend fun loadTree(
        target: ProjectWorkspaceTarget,
        directoryPath: String = "",
    ): ProjectOperationResult<ProjectTreeResult> = perform(
        target = target,
        channel = WorkspaceChannel.Tree,
        capability = ProjectCapability.Read,
        begin = { it.copy(directoryPath = directoryPath, loadingTree = true, failure = null) },
        finish = { entry, value -> entry.copy(tree = value, loadingTree = false) },
        cancel = { it.copy(loadingTree = false) },
        fail = { entry, failure -> entry.copy(loadingTree = false, failure = failure) },
    ) { lease -> gateway.listTree(lease, target, directoryPath) }

    suspend fun searchFiles(
        target: ProjectWorkspaceTarget,
        query: String,
        limit: Int = 50,
        config: ProjectSearchConfig? = null,
    ): ProjectOperationResult<ProjectFileSearchResult> = perform(
        target = target,
        channel = WorkspaceChannel.Search,
        capability = ProjectCapability.Read,
        begin = { it.copy(searchQuery = query, searching = true, failure = null) },
        finish = { entry, value -> entry.copy(searchResult = value, searching = false) },
        cancel = { it.copy(searching = false) },
        fail = { entry, failure -> entry.copy(searching = false, failure = failure) },
    ) { lease -> gateway.searchFiles(lease, target, query, limit, config) }

    suspend fun openFile(
        target: ProjectWorkspaceTarget,
        path: String,
    ): ProjectOperationResult<ProjectFileReadResult> = perform(
        target = target,
        channel = WorkspaceChannel.File,
        capability = ProjectCapability.Read,
        begin = { it.copy(loadingFile = true, failure = null) },
        finish = { entry, value -> entry.copy(openFile = value, loadingFile = false) },
        cancel = { it.copy(loadingFile = false) },
        fail = { entry, failure -> entry.copy(loadingFile = false, failure = failure) },
    ) { lease -> gateway.readFile(lease, target, path) }

    suspend fun saveFile(
        target: ProjectWorkspaceTarget,
        content: String,
    ): ProjectOperationResult<ProjectFileWriteResult> = saveMutexes
        .getOrPut(target.identity) { Mutex() }
        .withLock {
            val current = state.value.entries[target.identity]?.openFile
                ?: return@withLock ProjectOperationResult.Failed(
                    ProjectOperationFailure.InvalidResponse,
                )
            perform(
                target = target,
                channel = WorkspaceChannel.File,
                capability = ProjectCapability.Operate,
                begin = { it.copy(savingFile = true, failure = null) },
                finish = { entry, value ->
                    entry.copy(
                        openFile = current.copy(
                            modifiedAtMs = value.modifiedAtMs,
                            content = content,
                        ),
                        savingFile = false,
                    )
                },
                cancel = { it.copy(savingFile = false) },
                fail = { entry, failure -> entry.copy(savingFile = false, failure = failure) },
                mutation = true,
            ) { lease ->
                gateway.writeFile(
                    lease,
                    target,
                    current.path,
                    content,
                    current.modifiedAtMs,
                )
            }
        }

    suspend fun refreshGit(
        target: ProjectWorkspaceTarget,
        includeGhCheck: Boolean = false,
    ): ProjectOperationResult<GitProjectSnapshotResult> = perform(
        target = target,
        channel = WorkspaceChannel.Git,
        capability = ProjectCapability.Read,
        begin = { it.copy(loadingGit = true, failure = null) },
        finish = { entry, value -> entry.copy(gitSnapshot = value, loadingGit = false) },
        cancel = { it.copy(loadingGit = false) },
        fail = { entry, failure -> entry.copy(loadingGit = false, failure = failure) },
    ) { lease -> gateway.gitSnapshot(lease, target, includeGhCheck) }

    fun close(identity: ProjectIdentity) {
        revisions.entries.filter { it.key.identity == identity }.forEach {
            it.value.incrementAndGet()
        }
        mutableState.update { it.copy(entries = it.entries - identity) }
    }

    override fun onProjectsChanged(connectionId: com.poracode.app.model.ClientConnectionId) {
        revisions.entries.filter { it.key.identity.connectionId == connectionId }.forEach {
            it.value.incrementAndGet()
        }
        mutableState.update { current ->
            current.copy(entries = current.entries.filterKeys { it.connectionId != connectionId })
        }
    }

    private suspend fun <T> perform(
        target: ProjectWorkspaceTarget,
        channel: WorkspaceChannel,
        capability: ProjectCapability,
        begin: (ProjectWorkspaceEntry) -> ProjectWorkspaceEntry,
        finish: (ProjectWorkspaceEntry, T) -> ProjectWorkspaceEntry,
        cancel: (ProjectWorkspaceEntry) -> ProjectWorkspaceEntry,
        fail: (ProjectWorkspaceEntry, ProjectOperationFailure) -> ProjectWorkspaceEntry,
        mutation: Boolean = false,
        operation: suspend (ProjectHostLease) -> T,
    ): ProjectOperationResult<T> {
        val (captured, gateFailure) = session.currentLease(capability)
        if (captured == null) return ProjectOperationResult.Failed(requireNotNull(gateFailure))
        val lease = captured
        if (target.identity.connectionId != lease.connectionId) {
            return ProjectOperationResult.Failed(ProjectOperationFailure.InvalidProjectIdentity)
        }
        val key = WorkspaceOperationKey(target.identity, channel)
        val revision = revisions.computeIfAbsent(key) { AtomicLong() }.incrementAndGet()
        if (gateFailure != null) return ProjectOperationResult.Failed(gateFailure)
        update(target.identity, begin)
        try {
            val result = operation(lease)
            if (!isCurrent(lease, key, revision)) return ProjectOperationResult.Stale
            update(target.identity) { finish(it, result) }
            return ProjectOperationResult.Success(result)
        } catch (error: CancellationException) {
            if (isCurrent(lease, key, revision)) update(target.identity, cancel)
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, key, revision)) return ProjectOperationResult.Stale
            val failure = error.asProjectFailure(capability, mutation)
            update(target.identity) { fail(it, failure) }
            return ProjectOperationResult.Failed(failure)
        }
    }

    private fun isCurrent(
        lease: ProjectHostLease,
        key: WorkspaceOperationKey,
        revision: Long,
    ): Boolean = session.isCurrent(lease) && revisions[key]?.get() == revision

    private fun update(
        identity: ProjectIdentity,
        transform: (ProjectWorkspaceEntry) -> ProjectWorkspaceEntry,
    ) {
        mutableState.update { current ->
            val prior = current.entries[identity] ?: ProjectWorkspaceEntry()
            current.copy(entries = current.entries + (identity to transform(prior)))
        }
    }
}
