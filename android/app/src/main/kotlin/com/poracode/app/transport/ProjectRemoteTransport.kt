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

/** Stable project-only HTTP surface; generated names never escape its implementation. */
interface ProjectRemoteGateway {
    suspend fun projectCommand(command: ProjectCommand): ProjectCommandResult

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
