package com.poracode.app.ui.home

import com.poracode.app.model.RemoteProject
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.HostPresentation

internal sealed interface HomeThreadListEntry {
    val id: String

    data class Thread(
        val item: HostPresentation.UnifiedThreadItem,
    ) : HomeThreadListEntry {
        override val id: String = item.id
    }

    data class Worktree(
        override val id: String,
        val connectionId: String,
        val hostName: String,
        val project: RemoteProject,
        val path: String,
        val branch: String,
        val threads: List<HostPresentation.UnifiedThreadItem>,
    ) : HomeThreadListEntry {
        val updatedAt: String = threads.maxOfOrNull { it.thread.updatedAt }.orEmpty()
    }
}

internal data class HomeThreadLaunchDefaults(
    val agentKind: String,
    val agentInstanceId: String?,
    val config: ThreadConfig,
)

internal object HomeThreadListPresentation {
    private data class GroupKey(
        val connectionId: String,
        val projectId: String,
        val path: String,
    )

    fun entries(items: List<HostPresentation.UnifiedThreadItem>): List<HomeThreadListEntry> {
        val groups = items
            .filter { !it.thread.worktreePath.isNullOrBlank() }
            .groupBy {
                GroupKey(
                    it.connectionId.value,
                    it.project.id,
                    requireNotNull(it.thread.worktreePath),
                )
            }
            .filterValues { it.size >= 2 }
        val emitted = mutableSetOf<GroupKey>()
        return buildList {
            items.forEach { item ->
                val path = item.thread.worktreePath
                if (path.isNullOrBlank()) {
                    add(HomeThreadListEntry.Thread(item))
                    return@forEach
                }
                val key = GroupKey(item.connectionId.value, item.project.id, path)
                val members = groups[key]
                if (members == null) {
                    add(HomeThreadListEntry.Thread(item))
                } else if (emitted.add(key)) {
                    add(
                        HomeThreadListEntry.Worktree(
                            id = "worktree:${key.connectionId}:${key.projectId}:${key.path}",
                            connectionId = key.connectionId,
                            hostName = item.hostName,
                            project = item.project,
                            path = path,
                            branch = item.thread.worktreeBranch?.takeIf(String::isNotBlank) ?: path,
                            threads = members,
                        ),
                    )
                }
            }
        }
    }

    fun filter(
        items: List<HostPresentation.UnifiedThreadItem>,
        query: String,
        projectIds: Set<String>,
    ): List<HostPresentation.UnifiedThreadItem> {
        val normalized = query.trim()
        return items.filter { item ->
            (projectIds.isEmpty() || projectIdentity(item) in projectIds) &&
                (
                    normalized.isEmpty() ||
                        item.thread.title.contains(normalized, ignoreCase = true) ||
                        item.project.name.contains(normalized, ignoreCase = true) ||
                        item.hostName.contains(normalized, ignoreCase = true) ||
                        item.thread.worktreeBranch?.contains(normalized, ignoreCase = true) == true
                    )
        }
    }

    fun projectIdentity(item: HostPresentation.UnifiedThreadItem): String =
        "${item.connectionId.value}:${item.project.id}"

    fun launchDefaults(
        project: RemoteProject,
        threads: List<HostPresentation.UnifiedThreadItem>,
    ): HomeThreadLaunchDefaults? {
        project.lastDraftConfig?.let { draft ->
            return HomeThreadLaunchDefaults(
                agentKind = draft.agentKind,
                agentInstanceId = null,
                config = ThreadConfig(
                    model = draft.model.ifBlank { "default" },
                    effort = draft.effort,
                    contextSize = draft.contextSize,
                    fast = draft.fast,
                    thinking = draft.thinking,
                    mode = draft.mode,
                    approvalPolicy = draft.approvalPolicy,
                    approvalsReviewer = draft.approvalsReviewer,
                    sandboxMode = draft.sandboxMode,
                    browserMcp = draft.browserMcp,
                    crossagentMcp = draft.crossagentMcp,
                    computerUse = draft.computerUse,
                    chromeMcp = draft.chromeMcp,
                ),
            )
        }
        val latest = threads
            .asSequence()
            .map { it.thread }
            .filter { it.projectId == project.id }
            .maxByOrNull { it.updatedAt }
            ?: return null
        return HomeThreadLaunchDefaults(latest.agentKind, latest.agentInstanceId, latest.config)
    }
}
