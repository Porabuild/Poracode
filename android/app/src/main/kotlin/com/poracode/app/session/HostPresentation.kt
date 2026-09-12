package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.CompositeRemoteId
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.ThreadPresentationPolicy

object HostPresentation {
    data class UnifiedThreadItem(
        val connectionId: ClientConnectionId,
        val hostName: String,
        val project: RemoteProject,
        val thread: RemoteThread,
    ) {
        val id: String = CompositeRemoteId.of(connectionId, thread.id).value
    }

    fun projects(state: AppSession.UiState): List<RemoteProject> {
        val connection = state.hostCatalog.selectedConnectionId
        return state.snapshot?.projects.orEmpty()
            .filter { it.disabled != true }
            .sortedBy { it.name.lowercase() }
            .map { project ->
                if (connection == null) project
                else project.copy(id = CompositeRemoteId.of(connection, project.id).value)
            }
    }

    fun threads(state: AppSession.UiState, presentedProjectId: String): List<RemoteThread> {
        val connection = state.hostCatalog.selectedConnectionId
        val remoteProjectId = decodeFor(connection, presentedProjectId) ?: return emptyList()
        return ThreadPresentationPolicy.filterChatThreads(
            state.snapshot?.threads.orEmpty()
                .filter { it.projectId == remoteProjectId && !it.isArchived },
        ).sortedWith(
            compareByDescending<RemoteThread> { it.isStarred }.thenByDescending { it.updatedAt },
        ).map { thread ->
            if (connection == null) thread else thread.copy(
                id = CompositeRemoteId.of(connection, thread.id).value,
                projectId = CompositeRemoteId.of(connection, thread.projectId).value,
            )
        }
    }

    fun unifiedThreads(state: AppSession.UiState): List<UnifiedThreadItem> =
        state.hostCatalog.hosts.flatMap { host ->
            val snapshot = if (host.connectionId == state.hostCatalog.selectedConnectionId) {
                state.snapshot ?: state.hostSnapshots[host.connectionId]
            } else {
                state.hostSnapshots[host.connectionId]
            } ?: return@flatMap emptyList()
            val projects = snapshot.projects
                .filter { it.disabled != true }
                .associateBy { it.id }
            ThreadPresentationPolicy.filterChatThreads(
                snapshot.threads.filter { !it.isArchived },
            ).mapNotNull { thread ->
                val project = projects[thread.projectId] ?: return@mapNotNull null
                UnifiedThreadItem(host.connectionId, host.label, project, thread)
            }
        }.sortedWith(
            compareByDescending<UnifiedThreadItem> { it.thread.isStarred }
                .thenByDescending { it.thread.updatedAt }
                .thenBy { it.id },
        )

    fun remoteId(connection: ClientConnectionId?, presentedId: String): String? =
        decodeFor(connection, presentedId)

    fun presentedId(connection: ClientConnectionId?, remoteId: String?): String? =
        remoteId?.let { if (connection == null) it else CompositeRemoteId.of(connection, it).value }

    private fun decodeFor(connection: ClientConnectionId?, presentedId: String): String? {
        if (connection == null) return presentedId
        val parts = CompositeRemoteId(presentedId).decode() ?: return null
        return parts.remoteId.takeIf { parts.connectionId == connection }
    }
}
