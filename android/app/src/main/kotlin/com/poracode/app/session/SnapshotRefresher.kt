package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.GlobalCursorPolicy
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.transport.RemoteApiGateway
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Applies an authoritative shell snapshot; see [LiveConnectionController.applyShellSnapshot]. */
internal fun interface ShellSnapshotApplier {
    fun apply(snap: RemoteShellSnapshot, advanceGlobalCursor: Boolean, recoveryAttemptSeq: Long?)
}

/**
 * Foreground shell refresh and the connection-recovery evidence pipeline:
 * every snapshot attempt takes a seq at start ([ConnectionEventSequencer]),
 * applies the shell, and on success retires the connection scope's failure
 * claim — but only claims published before the attempt began, so completion
 * of an older request can never retire a newer failure. Failures route back
 * through [LiveConnectionController.handleApiException] (transport failures
 * become claims; host domain failures stay on the shared global error).
 */
internal class SnapshotRefresher(
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val lifecycleGate: AppLifecycleGate,
    private val ioDispatcher: CoroutineDispatcher,
    private val api: () -> RemoteApiGateway?,
    private val readScopes: () -> List<String>,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val applyShellSnapshot: ShellSnapshotApplier,
    private val handleApiException: (RemoteClientException) -> Unit,
    private val events: ConnectionEventSequencer,
) {
    fun refresh(onResult: ((Boolean) -> Unit)? = null): kotlinx.coroutines.Job? {
        val client = api() ?: return null
        if (!RemoteAccessScopes.canRead(readScopes())) {
            updateState { it.copy(globalError = SessionPolicies.MISSING_SCOPE_READ_MESSAGE) }
            return null
        }
        val job = scope.launch {
            val attemptSeq = events.next()
            var success = false
            try {
                val snap = withContext(ioDispatcher) { client.snapshot() }
                if (!lifecycleGate.isForeground) return@launch
                applyShellSnapshot.apply(
                    snap,
                    advanceGlobalCursor =
                        GlobalCursorPolicy.ordinaryShellRefreshAdvancesGlobalCursor(),
                    recoveryAttemptSeq = attemptSeq,
                )
                success = true
            } catch (e: CancellationException) {
                throw e
            } catch (e: RemoteClientException) {
                if (!lifecycleGate.isForeground) return@launch
                handleApiException(e)
            } catch (e: Exception) {
                if (!lifecycleGate.isForeground) return@launch
                events.publishFailure(e.message)
            } finally {
                onResult?.invoke(success)
            }
        }
        jobs.replace(SessionLifecycleJobs.SNAPSHOT, job)
        return job
    }
}
