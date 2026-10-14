package com.poracode.app.ui.home

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.CompositeRemoteId
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.protocol.ThreadPresentationPolicy

internal data class HomeProjectFilterOption(
    val id: String,
    val connectionId: ClientConnectionId,
    val project: RemoteProject,
    val hostName: String,
    val threadCount: Int,
)

/** Host-owned Home project scope, including projects that do not have a thread yet. */
internal object HomeProjectFilterPresentation {
    fun options(
        hosts: List<HostRecord>,
        selectedConnectionId: ClientConnectionId?,
        selectedSnapshot: RemoteShellSnapshot?,
        hostSnapshots: Map<ClientConnectionId, RemoteShellSnapshot>,
        excludedProjectIds: Map<String, Set<String>> = emptyMap(),
    ): List<HomeProjectFilterOption> = hosts.flatMap { host ->
        val snapshot = snapshotFor(
            host.connectionId,
            selectedConnectionId,
            selectedSnapshot,
            hostSnapshots,
        ) ?: return@flatMap emptyList()
        val threadCounts = ThreadPresentationPolicy.filterChatThreads(
            snapshot.threads.filterNot { it.isArchived },
        ).groupingBy { it.projectId }.eachCount()
        snapshot.projects.mapNotNull { project ->
            if (project.disabled == true) return@mapNotNull null
            if (project.id in excludedProjectIds[host.connectionId.value].orEmpty()) {
                return@mapNotNull null
            }
            HomeProjectFilterOption(
                id = projectIdentity(host.connectionId, project.id),
                connectionId = host.connectionId,
                project = project,
                hostName = host.label,
                threadCount = threadCounts.getOrDefault(project.id, 0),
            )
        }
    }.sortedWith(
        compareBy<HomeProjectFilterOption> { it.project.name.lowercase() }
            .thenBy { it.hostName.lowercase() }
            .thenBy { it.id },
    )

    fun resolveProject(
        connectionId: ClientConnectionId,
        projectId: String,
        selectedConnectionId: ClientConnectionId?,
        selectedSnapshot: RemoteShellSnapshot?,
        hostSnapshots: Map<ClientConnectionId, RemoteShellSnapshot>,
    ): RemoteProject? = snapshotFor(
        connectionId,
        selectedConnectionId,
        selectedSnapshot,
        hostSnapshots,
    )?.projects?.firstOrNull { it.id == projectId }

    fun projectIdentity(connectionId: ClientConnectionId, projectId: String): String =
        CompositeRemoteId.of(connectionId, projectId).value

    private fun snapshotFor(
        connectionId: ClientConnectionId,
        selectedConnectionId: ClientConnectionId?,
        selectedSnapshot: RemoteShellSnapshot?,
        hostSnapshots: Map<ClientConnectionId, RemoteShellSnapshot>,
    ): RemoteShellSnapshot? = if (connectionId == selectedConnectionId) {
        selectedSnapshot ?: hostSnapshots[connectionId]
    } else {
        hostSnapshots[connectionId]
    }
}
