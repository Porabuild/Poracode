package com.poracode.app.session.environments

import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentProjection
import com.poracode.app.model.RemoteEnvironmentTrustProbeResult
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.ConcurrentLinkedQueue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Reads the whole catalog's environment records for per-row pair/use actions.
 * Off-main by construction; a store failure reports null and leaves the last
 * known records untouched.
 */
internal suspend fun readLocalEnvironmentRecords(
    repository: MultiHostCredentialRepository,
    ioDispatcher: CoroutineDispatcher,
): List<EnvironmentManagementController.LocalEnvironmentRecord>? = runCatching {
    withContext(ioDispatcher) { repository.catalogSnapshot() }
}.getOrNull()?.hosts?.mapNotNull { host ->
    host.environment?.let {
        EnvironmentManagementController.LocalEnvironmentRecord(host.connectionId, it)
    }
}

/** Runs a suspending environment call; cancellation is never swallowed into an error state. */
internal suspend fun <T> environmentCall(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (error: kotlinx.coroutines.CancellationException) {
    throw error
} catch (error: Exception) {
    Result.failure(error)
}

/**
 * Tracks in-flight environment actions so a genuine session change can cancel
 * them; callers fence discarded results with a revision bump.
 */
internal class EnvironmentActionTracker(private val scope: CoroutineScope) {
    private val activeJobs = ConcurrentLinkedQueue<Job>()

    fun track(block: suspend CoroutineScope.() -> Unit) {
        val job = scope.launch(block = block)
        activeJobs += job
        job.invokeOnCompletion { activeJobs.remove(job) }
    }

    fun cancelAll() {
        activeJobs.forEach(Job::cancel)
        activeJobs.clear()
    }
}

/**
 * State-free helpers for [EnvironmentManagementController], kept in their own
 * file so the controller stays under the production size gate.
 */

/** Scope-derived action access (R4): read, use, and manage never imply each other. */
internal fun environmentAccessFor(
    scopes: List<String>,
): EnvironmentManagementController.EnvironmentAccess {
    val set = scopes.toSet()
    return EnvironmentManagementController.EnvironmentAccess(
        canRead = "session:read" in set,
        canUse = "session:operate" in set && "ports:forward" in set,
        canManage = "projects:manage" in set &&
            "session:operate" in set &&
            "ports:forward" in set,
    )
}

/** Stable UI error mapping: the pane localizes by closure-owned code, never by message. */
internal fun environmentCallError(
    error: Throwable,
): EnvironmentManagementController.EnvironmentCallError = when (error) {
    is RemoteClientException -> EnvironmentManagementController.EnvironmentCallError(
        code = error.code,
        status = error.status,
        fingerprint = null,
    )
    else -> EnvironmentManagementController.EnvironmentCallError(code = "environment/transport-error")
}

/**
 * Applies one completed mutation projection to the environment list: null
 * removes the environment, an existing projection replaces in place, and a new
 * projection is appended. Releasing the busy owner belongs here because the
 * mutation that owned the pane has completed under current custody.
 */
internal fun EnvironmentManagementController.EnvironmentUiState.withMutationProjection(
    environmentId: String?,
    projection: RemoteEnvironmentProjection?,
): EnvironmentManagementController.EnvironmentUiState {
    val environments = if (projection == null) {
        environments.filterNot { it.environmentId == environmentId }
    } else {
        val replaced = environments.map {
            if (it.environmentId == projection.environmentId) projection else it
        }
        if (replaced.any { it.environmentId == projection.environmentId }) {
            replaced
        } else {
            replaced + projection
        }
    }
    return copy(
        busy = null,
        busyEnvironmentId = null,
        environments = environments,
        actionNotice = "environment_action_applied",
    )
}

/** Releases the busy owner with the stable localized code for [error]. */
internal fun EnvironmentManagementController.EnvironmentUiState.withActionFailure(
    error: Throwable,
): EnvironmentManagementController.EnvironmentUiState = copy(
    busy = null,
    busyEnvironmentId = null,
    actionError = environmentCallError(error),
)

/** Opens the acceptance dialog for a successful trust probe under current custody. */
internal fun EnvironmentManagementController.EnvironmentUiState.withTrustProbe(
    environmentId: String,
    probe: RemoteEnvironmentTrustProbeResult,
): EnvironmentManagementController.EnvironmentUiState {
    val projection = environments.firstOrNull { it.environmentId == environmentId }
    return copy(
        busy = null,
        busyEnvironmentId = null,
        pendingTrust = EnvironmentManagementController.PendingTrust(
            environmentId = environmentId,
            revision = projection?.revision ?: 1,
            fingerprint = probe.fingerprint,
            keyType = probe.keyType,
        ),
    )
}

/** Settles a pairing attempt: notice on success, stable localized failure otherwise. */
internal fun EnvironmentManagementController.EnvironmentUiState.withPairingOutcome(
    outcome: EnvironmentPairingCoordinator.Outcome,
): EnvironmentManagementController.EnvironmentUiState = when (outcome) {
    is EnvironmentPairingCoordinator.Outcome.Paired -> copy(
        busy = null,
        busyEnvironmentId = null,
        actionNotice = "environment_paired",
    )
    is EnvironmentPairingCoordinator.Outcome.Failed -> copy(
        busy = null,
        busyEnvironmentId = null,
        actionError = EnvironmentManagementController.EnvironmentCallError(
            code = environmentPairingFailureCode(outcome.reason),
        ),
    )
}

internal fun environmentPairingFailureCode(
    reason: EnvironmentPairingCoordinator.Failure,
): String = when (reason) {
    EnvironmentPairingCoordinator.Failure.ParentNotPaired -> "environment_parent_missing"
    EnvironmentPairingCoordinator.Failure.ParentIsEnvironment ->
        "environment_nested_parent_unsupported"
    EnvironmentPairingCoordinator.Failure.ChildIdentityMismatch -> "environment/identity-changed"
    EnvironmentPairingCoordinator.Failure.ProtocolMismatch -> "protocol_version_mismatch"
    EnvironmentPairingCoordinator.Failure.NoScopes -> "no_known_scopes"
    EnvironmentPairingCoordinator.Failure.CredentialRejected -> "pairing_failed"
    EnvironmentPairingCoordinator.Failure.CommitFailed -> "environment_commit_failed"
}

/**
 * Builds the management client for the bound record through the credential
 * repository, so an environment record always dials the endpoint derived from
 * the CURRENT parent and a missing/aliased parent fails locally (null) without
 * a dial.
 */
internal class EnvironmentClientFactory(
    private val repository: MultiHostCredentialRepository,
    private val ioDispatcher: CoroutineDispatcher,
) {
    suspend fun clientFor(record: HostRecord): RemoteApiClient? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(record.connectionId)
        } ?: return null
        return RemoteApiClient(credentials.profile.httpBaseUrl, credentials.accessToken)
    }
}
