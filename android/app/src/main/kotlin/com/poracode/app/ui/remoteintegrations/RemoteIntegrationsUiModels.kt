package com.poracode.app.ui.remoteintegrations

import com.poracode.app.model.remoteintegrations.AgentConfiguration
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.session.remoteintegrations.IntegrationHostLease

enum class RemoteIntegrationsSection { Update, Schedules, PrWatches }

data class RemoteIntegrationsAccess(
    val hasHost: Boolean,
    val compatible: Boolean,
    val online: Boolean,
    val ready: Boolean,
    val canRead: Boolean,
    val canOperate: Boolean,
    val canManageProjects: Boolean,
) {
    companion object {
        fun from(lease: IntegrationHostLease?): RemoteIntegrationsAccess {
            val compatible = lease?.protocolVersion == 8
            val ready = lease?.ready == true
            val online = lease?.online == true
            fun scope(value: String) = compatible && ready && online && value in lease!!.scopes
            return RemoteIntegrationsAccess(
                hasHost = lease != null,
                compatible = compatible,
                online = online,
                ready = ready,
                canRead = scope("session:read"),
                canOperate = scope("session:operate"),
                canManageProjects = scope("projects:manage"),
            )
        }
    }
}

data class ScheduleEditorDraft(
    val id: String? = null,
    val name: String = "",
    val prompt: String = "",
    val agentKind: String = "codex",
    val model: String = "",
    val effort: String = "",
    val fast: Boolean = false,
    val recurrenceKind: String = "hourly",
    val minute: String = "0",
    val days: String = "1",
    val time: String = "09:00",
    val runAt: String = "",
    val enabled: Boolean = true,
    val projectId: String = "",
) {
    fun domain(): ScheduleDraft? {
        val recurrence = when (recurrenceKind) {
            "hourly" -> minute.toIntOrNull()?.let(ScheduleRecurrence::Hourly)
            "weekly" -> {
                val parsed = days.split(',').mapNotNull { it.trim().toIntOrNull() }.toSet()
                ScheduleRecurrence.Weekly(parsed, time.trim())
            }
            "once" -> ScheduleRecurrence.Once(runAt.trim())
            else -> null
        } ?: return null
        val draft = ScheduleDraft(
            name,
            prompt,
            agentKind,
            AgentConfiguration(model, effort.trim().ifEmpty { null }, fast),
            recurrence,
            enabled,
            projectId.trim().ifEmpty { null },
        )
        return draft.takeIf { it.isValid }
    }

    companion object {
        fun from(task: ScheduledTask): ScheduleEditorDraft {
            val recurrence = task.draft.recurrence
            return ScheduleEditorDraft(
                id = task.id,
                name = task.draft.name,
                prompt = task.draft.prompt,
                agentKind = task.draft.agentKind,
                model = task.draft.configuration.model,
                effort = task.draft.configuration.effort.orEmpty(),
                fast = task.draft.configuration.fast == true,
                recurrenceKind = when (recurrence) {
                    is ScheduleRecurrence.Hourly -> "hourly"
                    is ScheduleRecurrence.Weekly -> "weekly"
                    is ScheduleRecurrence.Once -> "once"
                },
                minute = (recurrence as? ScheduleRecurrence.Hourly)?.minute?.toString() ?: "0",
                days = (recurrence as? ScheduleRecurrence.Weekly)?.days?.sorted()?.joinToString()
                    ?: "1",
                time = (recurrence as? ScheduleRecurrence.Weekly)?.time ?: "09:00",
                runAt = (recurrence as? ScheduleRecurrence.Once)?.runAt.orEmpty(),
                enabled = task.draft.enabled,
                projectId = task.draft.projectId.orEmpty(),
            )
        }
    }
}

data class PrWatchEditorDraft(
    val projectId: String = "",
    val prNumber: String = "",
    val headBranch: String = "",
    val worktreePath: String = "",
    val watchEnabled: Boolean = true,
    val autoMerge: Boolean = false,
    val agentKind: String = "codex",
    val model: String = "",
    val effort: String = "",
    val fast: Boolean = false,
) {
    fun domain(): PrWatchDraft? {
        val number = prNumber.toLongOrNull() ?: return null
        val draft = PrWatchDraft(
            PrWatchKey(projectId.trim(), number),
            headBranch.trim(),
            worktreePath.trim().ifEmpty { null },
            watchEnabled,
            autoMerge,
            agentKind.trim().ifEmpty { null },
            AgentConfiguration(model.trim(), effort.trim().ifEmpty { null }, fast),
        )
        return draft.takeIf { it.isValid }
    }

    companion object {
        fun from(value: com.poracode.app.model.remoteintegrations.PrWatch) = PrWatchEditorDraft(
            projectId = value.draft.key.projectId,
            prNumber = value.draft.key.prNumber.toString(),
            headBranch = value.draft.headBranch,
            worktreePath = value.draft.worktreePath.orEmpty(),
            watchEnabled = value.draft.watchEnabled,
            autoMerge = value.draft.autoMerge,
            agentKind = value.draft.agentKind.orEmpty(),
            model = value.draft.configuration?.model.orEmpty(),
            effort = value.draft.configuration?.effort.orEmpty(),
            fast = value.draft.configuration?.fast == true,
        )
    }
}
