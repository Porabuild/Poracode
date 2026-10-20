package com.poracode.app.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class RemoteThread(
    val id: String,
    val remoteServerId: String? = null,
    val remoteId: String? = null,
    val projectId: String,
    val title: String,
    val agentKind: String,
    val agentInstanceId: String? = null,
    val config: ThreadConfig = ThreadConfig(),
    val status: String,
    val attention: String,
    val canResumeWithConfig: Boolean? = null,
    val worktreePath: String? = null,
    val worktreeBranch: String? = null,
    val archived: Boolean? = null,
    val done: Boolean? = null,
    val starred: Boolean? = null,
    val presentationMode: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val activeTurnStartedAt: String? = null,
    val lastTurnStartedAt: String? = null,
    val lastTurnEndedAt: String? = null,
    val errorMessage: String? = null,
    val slashCommands: List<RemoteSlashCommand>? = null,
    /** Live negotiated session controls (`RemoteSessionConfigOption`); null/absent keeps static fallback. */
    val sessionConfigOptions: List<RemoteSessionConfigOption>? = null,
    val parentThreadId: String? = null,
    /** Live structured-session identity; absent on older hosts. */
    val sessionRef: RemoteSessionRef? = null,
    /** Readonly host projection; absence is unknown, never launch or mutation authority. */
    @Serializable(with = WorkspaceDirectoryProjectionSerializer::class)
    val additionalDirectories: List<ProjectLocation>? = null,
    @Serializable(with = WorkspaceGrantRevisionProjectionSerializer::class)
    val workspaceGrantRevision: Long? = null,
    val forkedFrom: JsonObject? = null,
) {
    val isArchived: Boolean get() = archived == true
    val isDone: Boolean get() = done == true
    val isStarred: Boolean get() = starred == true
}

