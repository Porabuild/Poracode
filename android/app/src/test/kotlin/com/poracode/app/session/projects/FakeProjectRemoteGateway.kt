package com.poracode.app.session.projects

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectNotesWriteBody
import com.poracode.app.model.ProjectSettings
import com.poracode.app.transport.ProjectCommandDispatch
import com.poracode.app.transport.ProjectRemoteGateway

internal class FakeProjectRemoteGateway : ProjectRemoteGateway {
    var commandCalls = 0
    val commandDispatches = mutableListOf<ProjectCommandDispatch?>()
    val settingsIds = mutableListOf<String>()
    var commandHandler: suspend (ProjectCommand) -> ProjectCommandResult = {
        ProjectCommandResult.Complete(emptyList())
    }
    var settingsHandler: suspend (String) -> ProjectSettings = { ProjectSettings() }

    override suspend fun projectCommand(
        command: ProjectCommand,
        dispatch: ProjectCommandDispatch?,
    ): ProjectCommandResult {
        commandCalls += 1
        commandDispatches += dispatch
        return commandHandler(command)
    }

    override suspend fun projectSettings(projectId: String): ProjectSettings {
        settingsIds += projectId
        return settingsHandler(projectId)
    }

    override suspend fun projectNotes(projectId: String): ProjectNotesReadResult =
        ProjectNotesReadResult(null)

    override suspend fun writeProjectNotes(projectId: String, body: ProjectNotesWriteBody) = Unit

    override suspend fun browseHostDirectory(path: String): BrowseHostDirectoryResult =
        BrowseHostDirectoryResult(path, null, path, emptyList(), false)

    override suspend fun detectSetupScript(location: ProjectLocation): DetectSetupScriptResult =
        DetectSetupScriptResult()
}
