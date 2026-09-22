package com.poracode.app.transport

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.ProjectSettings
import com.poracode.app.session.projects.ProjectHostLease

/**
 * One project-command dispatch negotiated from the live lease.
 *
 * [commandId] is the caller's per-operation idempotency identity; the host
 * requires it under the bounded declaration and replays the recorded result
 * only for an identical body under the same id. [boundedResult] declares
 * `x-poracode-project-command-result: bounded-v1` and may only be set when the
 * connection advertised `capabilities.projectCommandResults` v1 (the caller
 * gates on [ProjectHostLease.projectCommandResultsSupported]).
 *
 * No retry surface exists today; if a same-operation retry is ever exposed it
 * MUST reuse the exact dispatch (same id, same body, same mode), and a new
 * user action mints a new id. Nothing in this client replays a command
 * automatically.
 */
data class ProjectCommandDispatch(
    val commandId: String,
    val boundedResult: Boolean,
) {
    init {
        require(commandId.isNotBlank()) {
            "A project-command dispatch requires an explicit per-operation command id."
        }
    }
}

/** Stable project-only HTTP surface; generated names never escape its implementation. */
interface ProjectRemoteGateway {
    /**
     * Executes one project command. [dispatch] is null for the historical
     * undeclared complete-result request; a non-null dispatch adds the
     * command-id (and, when declared, the bounded-result) headers.
     */
    suspend fun projectCommand(
        command: ProjectCommand,
        dispatch: ProjectCommandDispatch? = null,
    ): ProjectCommandResult

    suspend fun projectSettings(projectId: String): ProjectSettings

    suspend fun projectNotes(projectId: String): ProjectNotesReadResult

    suspend fun writeProjectNotes(projectId: String, body: ProjectNotesWriteBody)

    suspend fun browseHostDirectory(path: String): BrowseHostDirectoryResult

    suspend fun detectSetupScript(location: ProjectLocation): DetectSetupScriptResult
}

fun interface ProjectRemoteGatewayProvider {
    suspend fun gatewayFor(lease: ProjectHostLease): ProjectRemoteGateway?
}

fun interface ProjectRemoteGatewayFactory {
    fun create(endpoint: String, accessToken: String): ProjectRemoteGateway
}

internal fun ProjectIdentity.requireConnection(lease: ProjectHostLease) {
    require(connectionId == lease.connectionId) { "Project belongs to another host." }
}
