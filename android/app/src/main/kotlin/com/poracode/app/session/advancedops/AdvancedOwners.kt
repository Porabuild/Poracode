package com.poracode.app.session.advancedops

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectLocation
import com.poracode.app.protocol.advancedops.AdvancedOwnerKind

data class AdvancedHostLease(
    val clientConnectionId: ClientConnectionId,
    val desktopHostGeneration: Long,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
    val desktopId: String = "",
) {
    init {
        require(desktopHostGeneration > 0) { "Desktop host generation must be positive" }
    }

    val key = AdvancedHostKey(clientConnectionId, desktopId, desktopHostGeneration)
}

data class AdvancedHostKey(
    val clientConnectionId: ClientConnectionId,
    val desktopId: String,
    val desktopHostGeneration: Long,
)

sealed interface AdvancedOperationOwner {
    val host: AdvancedHostLease
    val kind: AdvancedOwnerKind
    val serializationKey: String
}

data class ThreadAdvancedOwner(
    override val host: AdvancedHostLease,
    val threadId: String,
    val threadGeneration: Long,
    val projectId: String,
    val projectGeneration: Long,
    val location: ProjectLocation,
    val locationGeneration: Long,
) : AdvancedOperationOwner {
    init {
        require(threadId.isNotEmpty() && projectId.isNotEmpty())
        require(threadGeneration > 0 && projectGeneration > 0 && locationGeneration > 0)
    }

    override val kind = AdvancedOwnerKind.Thread
    override val serializationKey = "${host.key}:thread:$threadId:$threadGeneration"
}

data class ProjectLocationAdvancedOwner(
    override val host: AdvancedHostLease,
    val projectId: String,
    val projectGeneration: Long,
    val location: ProjectLocation,
    val locationGeneration: Long,
) : AdvancedOperationOwner {
    init {
        require(projectId.isNotEmpty())
        require(projectGeneration > 0 && locationGeneration > 0)
    }

    override val kind = AdvancedOwnerKind.ProjectLocation
    override val serializationKey = "${host.key}:project:$projectId:$projectGeneration:$locationGeneration"
}

data class LocationAdvancedOwner(
    override val host: AdvancedHostLease,
    val location: ProjectLocation,
    val locationGeneration: Long,
) : AdvancedOperationOwner {
    init {
        require(locationGeneration > 0)
    }

    override val kind = AdvancedOwnerKind.Location
    override val serializationKey = "${host.key}:location:$locationGeneration"
}

/** The later UI integration updates this atomically whenever any selection generation changes. */
data class AdvancedOwnerSnapshot(
    val host: AdvancedHostLease? = null,
    val thread: ThreadAdvancedOwner? = null,
    val project: ProjectLocationAdvancedOwner? = null,
    val location: LocationAdvancedOwner? = null,
    val foreground: Boolean = true,
) {
    fun isCurrent(owner: AdvancedOperationOwner): Boolean {
        if (!foreground) return false
        val currentHost = host ?: return false
        if (currentHost.key != owner.host.key || !currentHost.online || !currentHost.ready) return false
        return isSelected(owner)
    }

    fun isSelected(owner: AdvancedOperationOwner): Boolean {
        return when (owner) {
            is ThreadAdvancedOwner -> thread == owner
            is ProjectLocationAdvancedOwner -> project == owner
            is LocationAdvancedOwner -> location == owner
        }
    }
}
