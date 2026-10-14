package com.poracode.app.ui.remoteintegrations

import kotlinx.serialization.json.put
import com.poracode.app.model.remoteintegrations.AgentConfiguration
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.remoteintegrations.IntegrationHostLease

enum class RemoteIntegrationsSection { Update, Schedules, PrWatches }

data class ScheduleRunThreadTarget(
    val threadId: String,
    val presentedId: String,
    val title: String,
    val model: String,
    val projectId: String? = null,
    val agentKind: String? = null,
    val archived: Boolean = false,
    val gui: Boolean = true,
)

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
            val compatible = lease?.protocolVersion == ProtocolConstants.REMOTE_PROTOCOL_VERSION
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
    val timeZone: String = "",
    val every: String = "1",
    val intervalUnit: String = "hours",
    val cronExpression: String = "0 9 * * *",
    val automation: ScheduleAutomationDraft = ScheduleAutomationDraft(),
    val originalConfiguration: AgentConfiguration? = null,
    val originalAgentKind: String? = null,
) {
    fun domain(): ScheduleDraft? {
        val recurrence = when (recurrenceKind) {
            "hourly" -> minute.toIntOrNull()?.let(ScheduleRecurrence::Hourly)
            "weekly" -> {
                val parsed = days.split(',').mapNotNull { it.trim().toIntOrNull() }.toSet()
                ScheduleRecurrence.Weekly(parsed, time.trim(), timeZone.trim().ifEmpty { null })
            }
            "once" -> ScheduleRecurrence.Once(runAt.trim())
            "interval" -> every.toIntOrNull()?.let { ScheduleRecurrence.Interval(it, intervalUnit) }
            "cron" -> ScheduleRecurrence.Cron(cronExpression, timeZone)
            else -> null
        } ?: return null
        val draft = ScheduleDraft(
            name,
            prompt,
            agentKind,
            originalConfiguration?.takeIf { originalAgentKind == agentKind && it.model == model && it.effort.orEmpty() == effort && (it.fast == true) == fast } ?: AgentConfiguration(model, effort.trim().ifEmpty { null }, fast),
            recurrence,
            enabled,
            projectId.trim().ifEmpty { null },
            automation.value() ?: return null,
        )
        return draft.takeIf { it.isValid && runCatching {
            com.poracode.app.protocol.remoteintegrations.RemoteV3IntegrationsContract.scheduleCommandRequest(
                kotlinx.serialization.json.buildJsonObject { put("kind", "create"); put("task", it.wireObject()) }.toString())
        }.isSuccess }
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
                    is ScheduleRecurrence.Interval -> "interval"
                    is ScheduleRecurrence.Cron -> "cron"
                },
                minute = (recurrence as? ScheduleRecurrence.Hourly)?.minute?.toString() ?: "0",
                days = (recurrence as? ScheduleRecurrence.Weekly)?.days?.sorted()?.joinToString()
                    ?: "1",
                time = (recurrence as? ScheduleRecurrence.Weekly)?.time ?: "09:00",
                runAt = (recurrence as? ScheduleRecurrence.Once)?.runAt.orEmpty(),
                enabled = task.draft.enabled,
                projectId = task.draft.projectId.orEmpty(),
                timeZone = (recurrence as? ScheduleRecurrence.Weekly)?.timeZone ?: (recurrence as? ScheduleRecurrence.Cron)?.timeZone.orEmpty(),
                every = (recurrence as? ScheduleRecurrence.Interval)?.every?.toString() ?: "1",
                intervalUnit = (recurrence as? ScheduleRecurrence.Interval)?.unit ?: "hours",
                cronExpression = (recurrence as? ScheduleRecurrence.Cron)?.expression ?: "0 9 * * *",
                automation = ScheduleAutomationDraft.from(task.draft.automation),
                originalConfiguration = task.draft.configuration,
                originalAgentKind = task.draft.agentKind,
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
