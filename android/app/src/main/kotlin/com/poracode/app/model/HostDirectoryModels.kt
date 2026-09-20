package com.poracode.app.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class BrowseHostDirectoryRequest(val path: String)

@Serializable
enum class HostDirectoryEntryType {
    @SerialName("directory")
    DIRECTORY,

    @SerialName("file")
    FILE,
}

@Serializable
data class HostDirectoryEntry(
    val name: String,
    val path: String,
    val type: HostDirectoryEntryType,
)

@Serializable
data class BrowseHostDirectoryResult(
    val path: String,
    val parentPath: String?,
    val homePath: String,
    val entries: List<HostDirectoryEntry>,
    val truncated: Boolean,
) {
    val isDrivePseudoRoot: Boolean get() = path == DRIVE_PSEUDO_ROOT

    companion object {
        const val DRIVE_PSEUDO_ROOT = "::drives::"
    }
}

@Serializable
data class DetectSetupScriptRequest(val projectLocation: ProjectLocation)

@Serializable
data class DetectSetupScriptResult(val setupScript: String? = null)
