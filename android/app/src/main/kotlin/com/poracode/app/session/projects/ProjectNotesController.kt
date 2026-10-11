package com.poracode.app.session.projects

import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectNotes
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.ProjectTodo
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement

class ProjectNotesController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: ProjectSessionGateway,
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher,
    private val clock: ProjectNotesClock,
    private val saveDebounceMs: Long = SAVE_DEBOUNCE_MS,
) {
    init {
        require(saveDebounceMs >= 0) { "saveDebounceMs must not be negative" }
    }

    private val changeEpochs = ConcurrentHashMap<ProjectIdentity, AtomicLong>()
    private val revisions = ConcurrentHashMap<ProjectIdentity, AtomicLong>()
    private val writeMutexes = ConcurrentHashMap<ProjectIdentity, Mutex>()
    private val debounceJobs = ConcurrentHashMap<ProjectIdentity, Job>()
    private val debounceRevisions = ConcurrentHashMap<ProjectIdentity, Long>()
    private val mutableState = MutableStateFlow(ProjectNotesState())
    val state: StateFlow<ProjectNotesState> = mutableState.asStateFlow()

    suspend fun load(identity: ProjectIdentity): ProjectOperationResult<ProjectNotes?> {
        val (captured, gateFailure) = session.currentLease(ProjectCapability.Read)
        if (captured == null) return ProjectOperationResult.Failed(requireNotNull(gateFailure))
        val lease = captured
        if (identity.connectionId != lease.connectionId) return invalidIdentity()
        cancelDebounce(identity)
        val changeEpoch = nextChangeEpoch(identity)
        val revision = nextRevision(identity)
        if (gateFailure != null) return failed(identity, gateFailure)
        update(identity) {
            it.copy(
                loading = true,
                pendingSave = false,
                changeEpoch = changeEpoch,
                failure = null,
            )
        }
        try {
            val notes = gateway.readProjectNotes(lease, identity).notes
            if (notes != null && notes.projectId != identity.projectId) {
                if (isCurrent(lease, identity, changeEpoch, revision)) {
                    return failed(identity, ProjectOperationFailure.InvalidResponse)
                }
                return ProjectOperationResult.Stale
            }
            if (!isCurrent(lease, identity, changeEpoch, revision)) {
                return ProjectOperationResult.Stale
            }
            update(identity) {
                ProjectNotesEntry(
                    notes = notes,
                    lastConfirmed = notes,
                    localRevision = revision,
                    confirmedRevision = revision,
                    changeEpoch = changeEpoch,
                )
            }
            return ProjectOperationResult.Success(notes)
        } catch (error: CancellationException) {
            if (isCurrent(lease, identity, changeEpoch, revision)) {
                update(identity) { it.copy(loading = false) }
            }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, identity, changeEpoch, revision)) {
                return ProjectOperationResult.Stale
            }
            return failed(identity, error.asProjectFailure(ProjectCapability.Read, false))
        }
    }

    fun edit(
        identity: ProjectIdentity,
        doc: JsonElement?,
        todos: List<ProjectTodo>,
    ): ProjectOperationResult<ProjectNotes> {
        val (captured, gateFailure) = session.currentLease(ProjectCapability.Operate)
        if (captured == null) return ProjectOperationResult.Failed(requireNotNull(gateFailure))
        val lease = captured
        if (identity.connectionId != lease.connectionId) return invalidIdentity()
        if (gateFailure != null) return failed(identity, gateFailure)
        val changeEpoch = currentChangeEpoch(identity)
        val revision = nextRevision(identity)
        val notes = ProjectNotes(
            projectId = identity.projectId,
            doc = doc,
            todos = todos,
            updatedAt = clock.nowIso8601(),
        )
        update(identity) {
            it.copy(
                notes = notes,
                loading = false,
                pendingSave = true,
                localRevision = revision,
                changeEpoch = changeEpoch,
                failure = null,
            )
        }
        scheduleWrite(lease, identity, changeEpoch, revision, notes)
        return ProjectOperationResult.Success(notes)
    }

    fun invalidate(identity: ProjectIdentity) {
        cancelDebounce(identity)
        nextChangeEpoch(identity)
        nextRevision(identity)
        mutableState.update { current ->
            current.copy(entries = current.entries - identity)
        }
    }

    fun close() {
        debounceJobs.values.forEach(Job::cancel)
        debounceJobs.clear()
        debounceRevisions.clear()
        changeEpochs.values.forEach { it.incrementAndGet() }
    }

    private fun scheduleWrite(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        changeEpoch: Long,
        revision: Long,
        notes: ProjectNotes,
    ) {
        cancelDebounce(identity)
        debounceRevisions[identity] = revision
        val job = scope.launch(dispatcher) {
            delay(saveDebounceMs)
            if (!debounceRevisions.remove(identity, revision)) return@launch
            debounceJobs.remove(identity)
            performWrite(lease, identity, changeEpoch, revision, notes)
        }
        debounceJobs[identity] = job
    }

    private suspend fun performWrite(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        changeEpoch: Long,
        revision: Long,
        notes: ProjectNotes,
    ) = writeMutexes.computeIfAbsent(identity) { Mutex() }.withLock {
        performWriteLocked(lease, identity, changeEpoch, revision, notes)
    }

    private suspend fun performWriteLocked(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        changeEpoch: Long,
        revision: Long,
        notes: ProjectNotes,
    ) {
        if (!isCurrent(lease, identity, changeEpoch, revision)) return
        update(identity) { it.copy(pendingSave = false, saving = true) }
        val body = ProjectNotesWriteBody(notes.doc, notes.todos, notes.updatedAt)
        try {
            gateway.writeProjectNotes(lease, identity, body)
        } catch (error: CancellationException) {
            if (isCurrent(lease, identity, changeEpoch, revision)) {
                update(identity) { it.copy(saving = false) }
            }
            throw error
        } catch (error: Throwable) {
            if (isCurrent(lease, identity, changeEpoch, revision)) {
                val failure = error.asProjectFailure(ProjectCapability.Operate, true)
                update(identity) {
                    it.copy(
                        notes = it.lastConfirmed,
                        pendingSave = false,
                        saving = false,
                        failure = failure,
                    )
                }
            }
            return
        }
        if (!session.isCurrent(lease) || currentChangeEpoch(identity) != changeEpoch) return
        updateExisting(identity, changeEpoch) { current ->
            if (revision < current.confirmedRevision) return@updateExisting current
            val isLatest = revisions[identity]?.get() == revision
            current.copy(
                notes = if (isLatest) notes else current.notes,
                lastConfirmed = notes,
                pendingSave = if (isLatest) false else current.pendingSave,
                saving = if (isLatest) false else current.saving,
                confirmedRevision = revision,
                failure = if (isLatest) null else current.failure,
            )
        }
    }

    private fun cancelDebounce(identity: ProjectIdentity) {
        debounceRevisions.remove(identity)
        debounceJobs.remove(identity)?.cancel()
    }

    private fun isCurrent(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        changeEpoch: Long,
        revision: Long,
    ): Boolean = session.isCurrent(lease) &&
        currentChangeEpoch(identity) == changeEpoch &&
        revisions[identity]?.get() == revision

    private fun currentChangeEpoch(identity: ProjectIdentity): Long =
        changeEpochs.computeIfAbsent(identity) { AtomicLong(1) }.get()

    private fun nextChangeEpoch(identity: ProjectIdentity): Long =
        changeEpochs.computeIfAbsent(identity) { AtomicLong() }.incrementAndGet()

    private fun nextRevision(identity: ProjectIdentity): Long =
        revisions.computeIfAbsent(identity) { AtomicLong() }.incrementAndGet()

    private fun <T> invalidIdentity(): ProjectOperationResult<T> =
        ProjectOperationResult.Failed(ProjectOperationFailure.InvalidProjectIdentity)

    private fun <T> failed(
        identity: ProjectIdentity,
        failure: ProjectOperationFailure,
    ): ProjectOperationResult<T> {
        update(identity) { it.copy(loading = false, failure = failure) }
        return ProjectOperationResult.Failed(failure)
    }

    private fun update(
        identity: ProjectIdentity,
        transform: (ProjectNotesEntry) -> ProjectNotesEntry,
    ) {
        mutableState.update { current ->
            val prior = current.entries[identity] ?: ProjectNotesEntry()
            current.copy(entries = current.entries + (identity to transform(prior)))
        }
    }

    private fun updateExisting(
        identity: ProjectIdentity,
        changeEpoch: Long,
        transform: (ProjectNotesEntry) -> ProjectNotesEntry,
    ) {
        mutableState.update { current ->
            val prior = current.entries[identity] ?: return@update current
            if (prior.changeEpoch != changeEpoch) return@update current
            current.copy(entries = current.entries + (identity to transform(prior)))
        }
    }

    companion object {
        const val SAVE_DEBOUNCE_MS = 600L
    }
}
