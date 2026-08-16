package com.poracode.app.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.JsonClassDiscriminator

/** Collision-free identity for one project on one paired host. */
@Serializable
data class ProjectIdentity(
    val connectionId: ClientConnectionId,
    val projectId: String,
) {
    init {
        require(projectId.isNotEmpty()) { "projectId must not be empty" }
    }
}

enum class ProjectLocationKind { POSIX, WINDOWS, WSL }

/**
 * A server-owned filesystem location. Paths are opaque: none of these models
 * normalize separators, case, Unicode, or UNC spellings.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed interface ProjectLocation {
    /** Host-usable path. For WSL this is the UNC bridge path. */
    val path: String
    val remoteServerId: String?

    val kind: ProjectLocationKind
        get() = when (this) {
            is PosixProjectLocation -> ProjectLocationKind.POSIX
            is WindowsProjectLocation -> ProjectLocationKind.WINDOWS
            is WslProjectLocation -> ProjectLocationKind.WSL
        }

    companion object {
        /** Compatibility factory for callers that previously used the wire-shaped model. */
        operator fun invoke(
            kind: String,
            path: String,
            distro: String? = null,
            linuxPath: String? = null,
            uncPath: String? = null,
            remoteServerId: String? = null,
        ): ProjectLocation = when (kind) {
            "posix" -> PosixProjectLocation(path, remoteServerId)
            "windows" -> WindowsProjectLocation(path, remoteServerId)
            "wsl" -> WslProjectLocation(
                distro = requireNotNull(distro) { "WSL location requires distro" },
                linuxPath = requireNotNull(linuxPath) { "WSL location requires linuxPath" },
                uncPath = uncPath ?: path,
                remoteServerId = remoteServerId,
            )
            else -> throw IllegalArgumentException("Unknown project location kind")
        }
    }
}

@Serializable
@SerialName("posix")
data class PosixProjectLocation(
    override val path: String,
    override val remoteServerId: String? = null,
) : ProjectLocation {
    init {
        require(path.isNotEmpty()) { "POSIX path must not be empty" }
    }
}

@Serializable
@SerialName("windows")
data class WindowsProjectLocation(
    override val path: String,
    override val remoteServerId: String? = null,
) : ProjectLocation {
    init {
        require(path.isNotEmpty()) { "Windows path must not be empty" }
    }
}

@Serializable
@SerialName("wsl")
data class WslProjectLocation(
    val distro: String,
    val linuxPath: String,
    val uncPath: String,
    override val remoteServerId: String? = null,
) : ProjectLocation {
    @Transient
    override val path: String = uncPath

    init {
        require(distro.isNotEmpty()) { "WSL distro must not be empty" }
        require(linuxPath.isNotEmpty()) { "WSL Linux path must not be empty" }
        require(uncPath.isNotEmpty()) { "WSL UNC path must not be empty" }
    }
}

fun RemoteProject.identityOn(connectionId: ClientConnectionId): ProjectIdentity =
    ProjectIdentity(connectionId, id)
