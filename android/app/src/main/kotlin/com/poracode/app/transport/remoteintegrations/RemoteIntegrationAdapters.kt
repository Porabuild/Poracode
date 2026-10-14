package com.poracode.app.transport.remoteintegrations

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.remoteintegrations.AutomationsSnapshot
import com.poracode.app.model.remoteintegrations.ScheduleRunCommandResult
import com.poracode.app.model.remoteintegrations.AgentConfiguration
import com.poracode.app.model.remoteintegrations.HostUpdateState
import com.poracode.app.model.remoteintegrations.HostUpdateStatus
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduleDraft
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.model.remoteintegrations.ScheduleRunStatus
import com.poracode.app.model.remoteintegrations.ScheduleHistoryStatus
import com.poracode.app.model.remoteintegrations.ScheduleRun
import com.poracode.app.model.remoteintegrations.ScheduledTask
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

internal object RemoteIntegrationAdapters {
    fun hostUpdate(value: JsonObject): HostUpdateState = protect {
        val status = value.objOrNull("status")?.let(::updateStatus) ?: HostUpdateStatus.Idle
        HostUpdateState(value.requiredString("currentVersion"), status)
    }

    fun schedules(value: JsonObject): List<ScheduledTask> = protect {
        value.requiredArray("schedules").map { schedule(it as JsonObject) }
    }

    fun scheduleRuns(value: JsonObject): List<ScheduleRun> = protect {
        value.requiredArray("runs").map { run ->
            val item = run as JsonObject
            ScheduleRun(
                id = item.requiredString("id"),
                scheduleId = item.requiredString("scheduleId"),
                threadId = item.requiredString("threadId"),
                startedAt = item.requiredString("startedAt"),
                completedAt = item.optionalString("completedAt"),
                status = when (item.requiredString("status")) {
                    "running" -> ScheduleHistoryStatus.Running
                    "waiting-for-approval" -> ScheduleHistoryStatus.Waiting
                    "cancelled" -> ScheduleHistoryStatus.Cancelled
                    "skipped" -> ScheduleHistoryStatus.Skipped
                    "succeeded" -> ScheduleHistoryStatus.Succeeded
                    "failed" -> ScheduleHistoryStatus.Failed
                    "interrupted" -> ScheduleHistoryStatus.Interrupted
                    else -> invalid()
                },
                hasError = item.optionalString("error") != null,
                summary = item.optionalString("summary"),
                attempt = (item["attempt"] as? JsonPrimitive)?.longOrNull?.toInt() ?: 1,
                iteration = (item["iteration"] as? JsonPrimitive)?.longOrNull?.toInt() ?: 1,
                result = item.objOrNull("result"),
            )
        }
    }

    fun automations(value: JsonObject): AutomationsSnapshot = protect {
        AutomationsSnapshot(schedules(value), scheduleRuns(value), value.requiredLong("unreadCount").toInt())
    }

    fun runCommand(value: JsonObject): ScheduleRunCommandResult = protect {
        val run = value.objOrNull("run")?.let { item ->
            scheduleRuns(buildJsonObject { put("runs", JsonArray(listOf(item))) }).single()
        }
        ScheduleRunCommandResult(run, value.optionalBoolean("cancelled"))
    }

    fun prWatch(value: JsonObject): PrWatch? = protect {
        val watch = value["watch"]
        if (watch == null || watch is JsonNull) null else projectPrWatch(watch as JsonObject)
    }

    private fun updateStatus(value: JsonObject): HostUpdateStatus = when (value.requiredString("type")) {
        "checking" -> HostUpdateStatus.Checking
        "update-available" -> HostUpdateStatus.Available(value.requiredString("version"))
        "update-not-available" -> HostUpdateStatus.Current
        "downloading" -> HostUpdateStatus.Downloading(
            value.requiredDouble("percent").coerceIn(0.0, 100.0),
        )
        "downloaded" -> HostUpdateStatus.Downloaded(value.requiredString("version"))
        "error" -> HostUpdateStatus.Failed
        else -> invalid()
    }

    private fun schedule(value: JsonObject): ScheduledTask = ScheduledTask(
        id = value.requiredString("id"),
        draft = ScheduleDraft(
            name = value.requiredString("name"),
            prompt = value.requiredString("prompt"),
            agentKind = value.requiredString("agentKind"),
            configuration = configuration(value.requiredObject("config")),
            recurrence = recurrence(value.requiredObject("recurrence")),
            enabled = value.requiredBoolean("enabled"),
            projectId = value.optionalString("projectId"),
            automation = value.objOrNull("automation"),
        ),
        nextRunAt = value.optionalString("nextRunAt"),
        lastRunAt = value.optionalString("lastRunAt"),
        lastStatus = when (value.requiredString("lastStatus")) {
            "never" -> ScheduleRunStatus.Never
            "running" -> ScheduleRunStatus.Running
            "waiting-for-approval" -> ScheduleRunStatus.Waiting
            "cancelled" -> ScheduleRunStatus.Cancelled
            "interrupted" -> ScheduleRunStatus.Interrupted
            "skipped" -> ScheduleRunStatus.Skipped
            "succeeded" -> ScheduleRunStatus.Succeeded
            "failed" -> ScheduleRunStatus.Failed
            else -> invalid()
        },
        hasLastError = value.optionalString("lastError") != null,
    )

    private fun recurrence(value: JsonObject): ScheduleRecurrence = when (value.requiredString("kind")) {
        "hourly" -> ScheduleRecurrence.Hourly(value.requiredLong("minute").toInt())
        "weekly" -> ScheduleRecurrence.Weekly(
            value.requiredArray("days").map {
                ((it as JsonPrimitive).longOrNull ?: error("invalid")).toInt()
            }.toSet(),
            value.requiredString("time"),
            value.optionalString("timeZone"),
        )
        "once" -> ScheduleRecurrence.Once(value.requiredString("runAt"))
        "interval" -> ScheduleRecurrence.Interval(value.requiredLong("every").toInt(), value.requiredString("unit"))
        "cron" -> ScheduleRecurrence.Cron(value.requiredString("expression"), value.requiredString("timeZone"))
        else -> invalid()
    }

    private fun projectPrWatch(value: JsonObject): PrWatch = PrWatch(
        draft = PrWatchDraft(
            key = PrWatchKey(value.requiredString("projectId"), value.requiredLong("prNumber")),
            headBranch = value.requiredString("headBranch"),
            worktreePath = value.optionalString("worktreePath"),
            watchEnabled = value.requiredBoolean("watchEnabled"),
            autoMerge = value.requiredBoolean("autoMerge"),
            agentKind = value.optionalString("agentKind"),
            configuration = value.objOrNull("config")?.let(::configuration),
        ),
        isChecking = value.optionalString("activeThreadId") != null,
        hasError = value.optionalString("lastError") != null,
    )

    private fun configuration(value: JsonObject) = AgentConfiguration(
        model = value.requiredString("model"),
        effort = value.optionalString("effort"),
        fast = value.optionalBoolean("fast"),
        preservedSelection = value,
    )

    private inline fun <T> protect(block: () -> T): T = try {
        block()
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        invalid()
    }

    private fun invalid(): Nothing = throw RemoteClientException.invalidResponse(
        "Remote integrations response projection failed.",
    )
}

private fun JsonObject.requiredString(name: String): String =
    (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content ?: error("invalid")

private fun JsonObject.optionalString(name: String): String? =
    (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.requiredBoolean(name: String): Boolean =
    (get(name) as? JsonPrimitive)?.booleanOrNull ?: error("invalid")

private fun JsonObject.optionalBoolean(name: String): Boolean? =
    (get(name) as? JsonPrimitive)?.booleanOrNull

private fun JsonObject.requiredDouble(name: String): Double =
    (get(name) as? JsonPrimitive)?.doubleOrNull ?: error("invalid")

private fun JsonObject.requiredLong(name: String): Long =
    (get(name) as? JsonPrimitive)?.longOrNull ?: error("invalid")

private fun JsonObject.requiredObject(name: String): JsonObject = get(name) as? JsonObject
    ?: error("invalid")

private fun JsonObject.objOrNull(name: String): JsonObject? = get(name) as? JsonObject

private fun JsonObject.requiredArray(name: String): JsonArray = get(name) as? JsonArray
    ?: error("invalid")
