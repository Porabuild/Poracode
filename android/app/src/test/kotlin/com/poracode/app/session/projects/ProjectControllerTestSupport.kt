package com.poracode.app.session.projects

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectNotes
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.ProjectSettings
import com.poracode.app.model.RemoteProject

internal val connectionA = ClientConnectionId("10000000-0000-4000-8000-000000000001")
internal val connectionB = ClientConnectionId("20000000-0000-4000-8000-000000000002")

internal fun lease(
    connectionId: ClientConnectionId = connectionA,
    generation: Long = 1,
    scopes: Set<String> = setOf("session:read", "session:operate", "projects:manage"),
    online: Boolean = true,
    ready: Boolean = true,
) = ProjectHostLease(connectionId, generation, scopes, online, ready)

internal fun project(
    id: String,
    name: String = id,
    path: String = "/workspace/$id",
) = RemoteProject(
    id = id,
    name = name,
    location = PosixProjectLocation(path),
    createdAt = "2026-08-12T00:00:00.000Z",
)

internal fun notes(projectId: String, text: String, updatedAt: String): ProjectNotes =
    ProjectNotes(
        projectId = projectId,
        todos = listOf(
            com.poracode.app.model.ProjectTodo("todo-$text", text, false, updatedAt),
        ),
        updatedAt = updatedAt,
    )

internal class FakeProjectGateway : ProjectSessionGateway {
    val commands = mutableListOf<Pair<ProjectHostLease, ProjectCommand>>()
    val settingsReads = mutableListOf<Pair<ProjectHostLease, ProjectIdentity>>()
    val directoryReads = mutableListOf<Pair<ProjectHostLease, String>>()
    val setupReads = mutableListOf<Pair<ProjectHostLease, ProjectLocation>>()
    val notesReads = mutableListOf<Pair<ProjectHostLease, ProjectIdentity>>()
    val notesWrites = mutableListOf<Triple<ProjectHostLease, ProjectIdentity, ProjectNotesWriteBody>>()

    var commandHandler: suspend (ProjectHostLease, ProjectCommand) -> ProjectCommandResult =
        { _, _ -> ProjectCommandResult(emptyList()) }
    var settingsHandler: suspend (ProjectHostLease, ProjectIdentity) -> ProjectSettings =
        { _, _ -> ProjectSettings() }
    var directoryHandler: suspend (ProjectHostLease, String) -> BrowseHostDirectoryResult =
        { _, path -> BrowseHostDirectoryResult(path, null, path, emptyList(), false) }
    var setupHandler: suspend (ProjectHostLease, ProjectLocation) -> DetectSetupScriptResult =
        { _, _ -> DetectSetupScriptResult() }
    var notesReadHandler: suspend (ProjectHostLease, ProjectIdentity) -> ProjectNotesReadResult =
        { _, _ -> ProjectNotesReadResult(null) }
    var notesWriteHandler:
        suspend (ProjectHostLease, ProjectIdentity, ProjectNotesWriteBody) -> Unit = { _, _, _ -> }

    override suspend fun projectCommand(
        lease: ProjectHostLease,
        command: ProjectCommand,
    ): ProjectCommandResult {
        commands += lease to command
        return commandHandler(lease, command)
    }

    override suspend fun projectSettings(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
    ): ProjectSettings {
        settingsReads += lease to identity
        return settingsHandler(lease, identity)
    }

    override suspend fun browseHostDirectory(
        lease: ProjectHostLease,
        path: String,
    ): BrowseHostDirectoryResult {
        directoryReads += lease to path
        return directoryHandler(lease, path)
    }

    override suspend fun detectSetupScript(
        lease: ProjectHostLease,
        location: ProjectLocation,
    ): DetectSetupScriptResult {
        setupReads += lease to location
        return setupHandler(lease, location)
    }

    override suspend fun readProjectNotes(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
    ): ProjectNotesReadResult {
        notesReads += lease to identity
        return notesReadHandler(lease, identity)
    }

    override suspend fun writeProjectNotes(
        lease: ProjectHostLease,
        identity: ProjectIdentity,
        body: ProjectNotesWriteBody,
    ) {
        notesWrites += Triple(lease, identity, body)
        notesWriteHandler(lease, identity, body)
    }
}
