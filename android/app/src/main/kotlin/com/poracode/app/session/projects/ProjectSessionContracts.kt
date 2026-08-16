package com.poracode.app.session.projects

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.ProjectSettings
import kotlinx.coroutines.flow.StateFlow

/** A lease is invalid as soon as the host session generation changes. */
data class ProjectHostLease(
    val connectionId: ClientConnectionId,
    val generation: Long,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
) {
    val key: ProjectSessionKey get() = ProjectSessionKey(connectionId, generation)
}

data class ProjectSessionKey(
    val connectionId: ClientConnectionId,
    val generation: Long,
)

enum class ProjectCapability(val scope: String) {
    Read("session:read"),
    Manage("projects:manage"),
    Operate("session:operate"),
}

/** Stable failures consumed by UI without parsing transport messages. */
sealed interface ProjectOperationFailure {
    data object NoSession : ProjectOperationFailure
    data object Offline : ProjectOperationFailure
    data object SessionNotReady : ProjectOperationFailure
    data object AuthenticationRequired : ProjectOperationFailure

    data class AuthorizationDenied(
        val requiredScope: String,
        val missingScope: Boolean,
    ) : ProjectOperationFailure

    data class Remote(
        val statusCode: Int?,
        val code: String?,
        val requestMayHaveCommitted: Boolean,
    ) : ProjectOperationFailure

    data object InvalidProjectIdentity : ProjectOperationFailure
    data object InvalidResponse : ProjectOperationFailure
}

/** Transport adapters throw this without exposing provider-specific exceptions to controllers. */
class ProjectGatewayException(
    val statusCode: Int?,
    val code: String?,
    val requestMayHaveCommitted: Boolean,
    cause: Throwable? = null,
) : Exception("Project request failed.", cause)

sealed interface ProjectOperationResult<out T> {
    data class Success<T>(val value: T) : ProjectOperationResult<T>
    data class Failed(val failure: ProjectOperationFailure) : ProjectOperationResult<Nothing>
    data object Stale : ProjectOperationResult<Nothing>
}

interface ProjectSessionGateway {
    suspend fun projectCommand(
        lease: ProjectHostLease,
        command: ProjectCommand,
    ): ProjectCommandResult

    suspend fun projectSettings(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
    ): ProjectSettings

    suspend fun browseHostDirectory(
        lease: ProjectHostLease,
        path: String,
    ): BrowseHostDirectoryResult

    suspend fun detectSetupScript(
        lease: ProjectHostLease,
        location: ProjectLocation,
    ): DetectSetupScriptResult

    suspend fun readProjectNotes(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
    ): ProjectNotesReadResult

    suspend fun writeProjectNotes(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        body: ProjectNotesWriteBody,
    )
}

fun interface ProjectRefreshScheduler {
    /** Implementations debounce authoritative shell refreshes. */
    fun request(lease: ProjectHostLease)
}

fun interface ProjectsChangedListener {
    fun onProjectsChanged(connectionId: ClientConnectionId)
}

internal fun StateFlow<ProjectHostLease?>.currentLease(
    capability: ProjectCapability,
): Pair<ProjectHostLease?, ProjectOperationFailure?> {
    val lease = value ?: return null to ProjectOperationFailure.NoSession
    if (!lease.online) return lease to ProjectOperationFailure.Offline
    if (!lease.ready) return lease to ProjectOperationFailure.SessionNotReady
    if (capability.scope !in lease.scopes) {
        return lease to ProjectOperationFailure.AuthorizationDenied(
            requiredScope = capability.scope,
            missingScope = true,
        )
    }
    return lease to null
}

internal fun StateFlow<ProjectHostLease?>.isCurrent(lease: ProjectHostLease): Boolean {
    val current = value ?: return false
    return current.connectionId == lease.connectionId &&
        current.generation == lease.generation &&
        current.online &&
        current.ready
}

internal fun Throwable.asProjectFailure(
    capability: ProjectCapability,
    defaultMayHaveCommitted: Boolean,
): ProjectOperationFailure {
    val gateway = this as? ProjectGatewayException
    return when (gateway?.statusCode) {
        401 -> ProjectOperationFailure.AuthenticationRequired
        403 -> ProjectOperationFailure.AuthorizationDenied(
            requiredScope = capability.scope,
            missingScope = gateway.code == "missing_scope",
        )
        else -> ProjectOperationFailure.Remote(
            statusCode = gateway?.statusCode,
            code = gateway?.code,
            requestMayHaveCommitted = gateway?.requestMayHaveCommitted
                ?: defaultMayHaveCommitted,
        )
    }
}
