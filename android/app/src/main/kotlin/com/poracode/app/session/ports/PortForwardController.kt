package com.poracode.app.session.ports

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.ports.PortForwardFailure
import com.poracode.app.model.ports.PortForwardUiState
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.ports.PortForwardRemoteGateway
import com.poracode.app.transport.ports.PortForwardRemoteGatewayProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PortForwardController(
    private val lease: StateFlow<ProjectHostLease?>,
    private val provider: PortForwardRemoteGatewayProvider,
    private val scope: CoroutineScope,
) {
    private val mutableState = MutableStateFlow(PortForwardUiState())
    val state: StateFlow<PortForwardUiState> = mutableState.asStateFlow()
    private var refreshJob: Job? = null
    private var startJob: Job? = null
    private val forwardJobs = mutableMapOf<String, Job>()

    fun refresh() = refresh(preserveFailure = false)

    private fun refresh(preserveFailure: Boolean) {
        refreshJob?.cancel()
        val captured = requireLease() ?: return
        refreshJob = scope.launch {
            val retainedFailure = mutableState.value.failure.takeIf { preserveFailure }
            mutableState.value = mutableState.value.copy(
                loading = true,
                failure = retainedFailure,
            )
            try {
                val snapshot = resolve(captured).snapshot()
                if (!isCurrent(captured)) {
                    // Same-generation capability changes do not move the lease
                    // key, so no external reset clears this state.
                    mutableState.value = mutableState.value.copy(loading = false)
                    return@launch
                }
                mutableState.value = mutableState.value.copy(
                    loading = false,
                    detected = snapshot.detected,
                    forwards = snapshot.forwards,
                    failure = retainedFailure,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (isSameGeneration(captured)) {
                    mutableState.value = mutableState.value.copy(
                        loading = false,
                        failure = error.asFailure(mutation = false),
                    )
                }
            }
        }
    }

    fun start(targetPort: Int, openBrowser: (String) -> Unit) {
        if (targetPort !in 1..65_535) {
            mutableState.value = mutableState.value.copy(failure = PortForwardFailure.InvalidInput)
            return
        }
        startJob?.cancel()
        val captured = requireLease() ?: return
        startJob = scope.launch {
            mutableState.value = mutableState.value.copy(starting = true, failure = null)
            try {
                val remote = resolve(captured)
                val started = remote.start(targetPort)
                if (!isCurrent(captured)) {
                    // Same-generation capability changes do not move the lease
                    // key, so no external reset clears this state.
                    mutableState.value = mutableState.value.copy(starting = false)
                    return@launch
                }
                // Raw creation is allowed on every host; only the browser entry is
                // capability-gated. Never use an entry URL from a host that does
                // not advertise the isolated origin-bound entry — older hosts still
                // return a successful shared-origin enterPath here.
                val entry = if (captured.browserEntrySupported) {
                    started.browserEntryUrl ?: remote.browserEntry(started.forward.id)
                } else {
                    null
                }
                if (!isCurrent(captured)) {
                    mutableState.value = mutableState.value.copy(starting = false)
                    return@launch
                }
                if (entry == null) {
                    // The forward exists on the host: keep it visible and report the
                    // definite configuration error instead of an uncertain result.
                    mutableState.value = mutableState.value.copy(
                        starting = false,
                        failure = PortForwardFailure.BrowserUnavailable,
                    )
                    refresh(preserveFailure = true)
                    return@launch
                }
                mutableState.value = mutableState.value.copy(starting = false, failure = null)
                openBrowser(entry)
                refresh()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (isSameGeneration(captured)) {
                    val failure = error.asFailure(mutation = true)
                    mutableState.value = mutableState.value.copy(
                        starting = false,
                        failure = failure,
                    )
                    if (
                        failure == PortForwardFailure.AmbiguousDelivery ||
                        failure == PortForwardFailure.BrowserUnavailable
                    ) {
                        // Both mean the creation committed: re-read the list while
                        // keeping the failure card visible.
                        refresh(preserveFailure = true)
                    }
                }
            }
        }
    }

    fun open(forwardId: String, openBrowser: (String) -> Unit) {
        if (forwardId.isBlank() || forwardId in forwardJobs) return
        val captured = requireLease() ?: return
        if (!captured.browserEntrySupported) {
            // Refuse locally instead of opening a shared-origin URL from an
            // older host or calling a route it cannot serve.
            mutableState.value =
                mutableState.value.copy(failure = PortForwardFailure.BrowserUnavailable)
            return
        }
        setBusy(forwardId, true)
        forwardJobs[forwardId] = scope.launch {
            try {
                val entry = resolve(captured).browserEntry(forwardId)
                if (!isCurrent(captured)) return@launch
                openBrowser(entry)
                mutableState.value = mutableState.value.copy(failure = null)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (isSameGeneration(captured)) {
                    mutableState.value = mutableState.value.copy(
                        failure = error.asFailure(mutation = false),
                    )
                }
            } finally {
                forwardJobs.remove(forwardId)
                if (isSameGeneration(captured)) setBusy(forwardId, false)
            }
        }
    }

    fun stop(forwardId: String) {
        if (forwardId.isBlank() || forwardId in forwardJobs) return
        val captured = requireLease() ?: return
        setBusy(forwardId, true)
        forwardJobs[forwardId] = scope.launch {
            try {
                resolve(captured).stop(forwardId)
                if (!isCurrent(captured)) return@launch
                mutableState.value = mutableState.value.copy(failure = null)
                refresh()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (isSameGeneration(captured)) {
                    val failure = error.asFailure(mutation = true)
                    mutableState.value = mutableState.value.copy(
                        failure = failure,
                    )
                    if (failure == PortForwardFailure.AmbiguousDelivery) {
                        refresh(preserveFailure = true)
                    }
                }
            } finally {
                forwardJobs.remove(forwardId)
                if (isSameGeneration(captured)) setBusy(forwardId, false)
            }
        }
    }

    fun clearFailure() {
        mutableState.value = mutableState.value.copy(failure = null)
    }

    fun resetForHostChange() {
        cancelTransientWork()
        mutableState.value = PortForwardUiState()
    }

    fun cancelTransientWork() {
        refreshJob?.cancel()
        startJob?.cancel()
        forwardJobs.values.forEach(Job::cancel)
        refreshJob = null
        startJob = null
        forwardJobs.clear()
        mutableState.value = mutableState.value.copy(
            loading = false,
            starting = false,
            busyForwardIds = emptySet(),
        )
    }

    private fun requireLease(): ProjectHostLease? {
        val current = lease.value
        val failure = when {
            current == null || !current.online || !current.ready -> PortForwardFailure.Offline
            REQUIRED_SCOPE !in current.scopes -> PortForwardFailure.MissingScope
            else -> null
        }
        if (failure != null) mutableState.value = mutableState.value.copy(failure = failure)
        return current?.takeIf { failure == null }
    }

    private suspend fun resolve(captured: ProjectHostLease): PortForwardRemoteGateway {
        checkCurrent(captured)
        val gateway = provider.gatewayFor(captured)
            ?: throw RemoteClientException("Host session unavailable.", 409, "stale_lease")
        checkCurrent(captured)
        return gateway
    }

    private fun checkCurrent(captured: ProjectHostLease) {
        if (!isCurrent(captured)) throw CancellationException("Port host lease changed")
    }

    private fun isCurrent(captured: ProjectHostLease): Boolean {
        val current = lease.value ?: return false
        return current.connectionId == captured.connectionId &&
            current.generation == captured.generation &&
            current.online && current.ready && REQUIRED_SCOPE in current.scopes &&
            // Capability is part of the gate: generation only moves on a
            // binding change or an observed readiness downgrade, so a reconnect
            // whose transient offline state was conflated away can change
            // browserForwardVersions within one generation. The gate decision
            // must follow the live lease, not the pre-reconnect capture.
            current.browserForwardVersions == captured.browserForwardVersions
    }

    private fun isSameGeneration(captured: ProjectHostLease): Boolean {
        val current = lease.value ?: return false
        return current.connectionId == captured.connectionId &&
            current.generation == captured.generation
    }

    private fun setBusy(id: String, busy: Boolean) {
        val ids = mutableState.value.busyForwardIds.toMutableSet()
        if (busy) ids += id else ids -= id
        mutableState.value = mutableState.value.copy(busyForwardIds = ids)
    }

    companion object {
        const val REQUIRED_SCOPE = "ports:forward"
    }
}

private fun Throwable.asFailure(mutation: Boolean): PortForwardFailure {
    val remote = this as? RemoteClientException
    return when {
        // Definite host-configuration error: the body was received and parsed, so
        // it must be classified before the >=500 mutation-ambiguity rule can
        // misreport a deterministic, retry-identical failure as "result uncertain".
        remote?.code == "forward_browser_unavailable" -> PortForwardFailure.BrowserUnavailable
        remote?.status == 401 -> PortForwardFailure.Unauthorized
        remote?.status == 403 || remote?.code == "missing_scope" -> PortForwardFailure.MissingScope
        remote?.status == 404 -> PortForwardFailure.NotFound
        remote?.status == 400 -> PortForwardFailure.InvalidInput
        mutation && (
            remote == null || RemoteMutationClassification.requestMayHaveCommitted(remote, true)
        ) -> PortForwardFailure.AmbiguousDelivery
        remote?.code == "invalid_response" -> PortForwardFailure.InvalidResponse
        else -> PortForwardFailure.Unavailable
    }
}
