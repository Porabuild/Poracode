package com.poracode.app.transport

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectSettings
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import kotlinx.serialization.KSerializer

/** Projects canonical generated snapshots into stable project-domain models. */
internal object ProjectRemoteV3Adapters {
    fun commandResult(raw: String): ProjectCommandResult = project(
        raw,
        ProjectCommandResult.serializer(),
        "project command",
    )

    fun settings(raw: String): ProjectSettings = project(
        raw,
        ProjectSettings.serializer(),
        "project settings",
    )

    fun notes(raw: String): ProjectNotesReadResult = project(
        raw,
        ProjectNotesReadResult.serializer(),
        "project notes",
    )

    fun directory(raw: String): BrowseHostDirectoryResult = project(
        raw,
        BrowseHostDirectoryResult.serializer(),
        "host directory",
    )

    fun setupScript(raw: String): DetectSetupScriptResult = project(
        raw,
        DetectSetupScriptResult.serializer(),
        "setup detection",
    )

    private fun <T> project(raw: String, serializer: KSerializer<T>, boundary: String): T = try {
        RemoteJson.decodeFromString(serializer, raw)
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse(
            "Remote project projection failed at $boundary.",
        )
    }
}
