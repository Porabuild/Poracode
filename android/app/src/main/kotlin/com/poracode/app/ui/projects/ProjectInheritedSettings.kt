package com.poracode.app.ui.projects

import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.model.settings.HostSettingsSnapshot
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** Narrow redacted settings projection used only to explain project inheritance. */
internal data class ProjectInheritedSettings(
    val connectionId: ClientConnectionId? = null,
    val worktreeStorageMode: String = "global",
    val worktreeBasePath: String = "",
    val wslWorktreeBasePath: String = "",
    val searchUseIgnoreFiles: Boolean = true,
    val searchExclude: Map<String, Boolean> = emptyMap(),
) {
    fun basePath(location: ProjectLocation): String {
        val configured = if (location is WslProjectLocation) {
            wslWorktreeBasePath
        } else {
            worktreeBasePath
        }
        return configured.trim().ifEmpty { "~/.poracode/worktrees" }
    }

    companion object {
        fun from(
            connectionId: ClientConnectionId?,
            snapshot: HostSettingsSnapshot?,
        ): ProjectInheritedSettings {
            val settings = snapshot?.settings ?: return ProjectInheritedSettings()
            return ProjectInheritedSettings(
                connectionId = connectionId,
                worktreeStorageMode = settings.string("worktreeStorageMode") ?: "global",
                worktreeBasePath = settings.string("worktreeBasePath").orEmpty(),
                wslWorktreeBasePath = settings.string("wslWorktreeBasePath").orEmpty(),
                searchUseIgnoreFiles = settings.boolean("searchUseIgnoreFiles") ?: true,
                searchExclude = (settings["searchExclude"] as? JsonObject).orEmpty()
                    .mapNotNull { (pattern, value) ->
                        (value as? JsonPrimitive)?.booleanOrNull?.let { pattern to it }
                    }.toMap(),
            )
        }
    }
}

private fun JsonObject.string(key: String): String? =
    (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

private fun JsonObject.boolean(key: String): Boolean? =
    (get(key) as? JsonPrimitive)?.booleanOrNull
