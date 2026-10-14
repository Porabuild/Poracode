package com.poracode.app.model.remoteintegrations

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

sealed interface HostUpdateStatus {
    data object Idle : HostUpdateStatus
    data object Checking : HostUpdateStatus
    data class Available(val version: String) : HostUpdateStatus
    data object Current : HostUpdateStatus
    data class Downloading(val percent: Double) : HostUpdateStatus
    data class Downloaded(val version: String) : HostUpdateStatus
    /** Server diagnostics are deliberately discarded at the transport boundary. */
    data object Failed : HostUpdateStatus
}

data class HostUpdateState(
    val currentVersion: String,
    val status: HostUpdateStatus,
)

data class AgentConfiguration(
    val model: String,
    val effort: String? = null,
    val fast: Boolean? = null,
    val preservedSelection: JsonObject? = null,
) {
    fun wireObject(): JsonObject = buildJsonObject {
        preservedSelection?.forEach { (key, value) -> put(key, value) }
        put("model", model.trim())
        effort?.trim()?.takeIf(String::isNotEmpty)?.let { put("effort", it) }
        fast?.let { put("fast", it) }
    }
}

sealed interface ScheduleRecurrence {
    data class Hourly(val minute: Int) : ScheduleRecurrence
    data class Weekly(val days: Set<Int>, val time: String, val timeZone: String? = null) : ScheduleRecurrence
    data class Once(val runAt: String) : ScheduleRecurrence
    data class Interval(val every: Int, val unit: String) : ScheduleRecurrence
    data class Cron(val expression: String, val timeZone: String) : ScheduleRecurrence

    fun wireObject(): JsonObject = buildJsonObject {
        when (this@ScheduleRecurrence) {
            is Hourly -> {
                put("kind", "hourly")
                put("minute", minute)
            }
            is Weekly -> {
                put("kind", "weekly")
                put("days", JsonArray(days.sorted().map { JsonPrimitive(it) }))
                put("time", time)
                timeZone?.let { put("timeZone", it) }
            }
            is Once -> {
                put("kind", "once")
                put("runAt", runAt)
            }
            is Interval -> { put("kind", "interval"); put("every", every); put("unit", unit) }
            is Cron -> { put("kind", "cron"); put("expression", expression); put("timeZone", timeZone) }
        }
    }
}

data class ScheduleDraft(
    val name: String,
    val prompt: String,
    val agentKind: String,
    val configuration: AgentConfiguration,
    val recurrence: ScheduleRecurrence,
    val enabled: Boolean,
    val projectId: String? = null,
    val automation: JsonObject? = null,
) {
    val isValid: Boolean
        get() = name.trim().length in 1..120 && prompt.trim().length in 1..50_000 &&
            agentKind.isNotBlank() && configuration.model.isNotBlank() && recurrence.isValid()

    fun wireObject(): JsonObject {
        require(isValid)
        return buildJsonObject {
            put("name", name.trim())
            put("prompt", prompt.trim())
            put("agentKind", agentKind.trim())
            put("config", configuration.wireObject())
            put("recurrence", recurrence.wireObject())
            put("enabled", enabled)
            automation?.let { put("automation", it) }
            if (projectId == null) put("projectId", JsonNull) else put("projectId", projectId)
        }
    }
}

data class ScheduledTask(
    val id: String,
    val draft: ScheduleDraft,
    val nextRunAt: String?,
    val lastRunAt: String?,
    val lastStatus: ScheduleRunStatus,
    /** Only presence is retained; raw host output and diagnostics never reach UI state. */
    val hasLastError: Boolean,
)

enum class ScheduleRunStatus { Never, Running, Waiting, Succeeded, Failed, Interrupted, Cancelled, Skipped }

enum class ScheduleHistoryStatus { Running, Waiting, Succeeded, Failed, Interrupted, Cancelled, Skipped }

data class ScheduleRun(
    val id: String,
    val scheduleId: String,
    val threadId: String,
    val startedAt: String,
    val completedAt: String?,
    val status: ScheduleHistoryStatus,
    /** Raw host diagnostics are discarded before this model is constructed. */
    val hasError: Boolean,
    val summary: String? = null,
    val attempt: Int = 1,
    val iteration: Int = 1,
    val result: JsonObject? = null,
) {
    val unread: Boolean get() = result?.get("unread") == JsonPrimitive(true)
    val archived: Boolean get() = result?.get("archivedAt") is JsonPrimitive && result.getValue("archivedAt") != JsonNull
    val stopReason: String? get() = (result?.get("stopReason") as? JsonPrimitive)?.takeIf { it.isString }?.content
    val canCancel: Boolean get() = status == ScheduleHistoryStatus.Running || status == ScheduleHistoryStatus.Waiting || stopReason == "retry-pending"
}

data class AutomationsSnapshot(val schedules: List<ScheduledTask>, val runs: List<ScheduleRun>, val unreadCount: Int)
data class ScheduleRunCommandResult(val run: ScheduleRun?, val cancelled: Boolean?)

private fun ScheduleRecurrence.isValid(): Boolean = when (this) {
    is ScheduleRecurrence.Hourly -> minute in 0..59
    is ScheduleRecurrence.Weekly -> days.isNotEmpty() && days.all { it in 0..6 } &&
        Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(time)
    is ScheduleRecurrence.Once -> runAt.isNotBlank()
    is ScheduleRecurrence.Interval -> every in 1..999 && unit in setOf("minutes", "hours", "days")
    is ScheduleRecurrence.Cron -> expression.isNotBlank() && timeZone.isNotBlank()
}

data class PrWatchKey(val projectId: String, val prNumber: Long) {
    val isValid: Boolean get() = projectId.isNotBlank() && prNumber >= 1

    fun wireObject(): JsonObject {
        require(isValid)
        return buildJsonObject {
            put("projectId", projectId.trim())
            put("prNumber", prNumber)
        }
    }
}

data class PrWatchDraft(
    val key: PrWatchKey,
    val headBranch: String,
    val worktreePath: String? = null,
    val watchEnabled: Boolean,
    val autoMerge: Boolean,
    val agentKind: String? = null,
    val configuration: AgentConfiguration? = null,
) {
    val isValid: Boolean
        get() = key.isValid && headBranch.isNotBlank() &&
            (!watchEnabled || (!agentKind.isNullOrBlank() && !configuration?.model.isNullOrBlank()))

    fun wireObject(): JsonObject {
        require(isValid)
        return buildJsonObject {
            put("projectId", key.projectId.trim())
            put("prNumber", key.prNumber)
            put("headBranch", headBranch.trim())
            worktreePath?.trim()?.takeIf(String::isNotEmpty)?.let { put("worktreePath", it) }
            put("watchEnabled", watchEnabled)
            put("autoMerge", autoMerge)
            agentKind?.trim()?.takeIf(String::isNotEmpty)?.let { put("agentKind", it) }
            configuration?.let { put("config", it.wireObject()) }
        }
    }
}

data class PrWatch(
    val draft: PrWatchDraft,
    val isChecking: Boolean,
    val hasError: Boolean,
)
