// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Background-task reduce machine rendered from the declarative spec in
// src/shared/remote/contract/backgroundTaskReduceSpec.ts (spec version 3).
package com.poracode.remote.v3.generated

import kotlinx.serialization.Serializable

data class RemoteBackgroundTaskStopAction(val id: String, val payload: Map<String, String>)

@Serializable
data class RemoteBackgroundTaskOutput(
    val output: String,
    val totalBytes: Double,
    val truncated: Boolean,
) {
    val isValid: Boolean
        get() = output.length <= MAX_OUTPUT_UTF16_LENGTH &&
            totalBytes.isFinite() &&
            totalBytes >= 0.0 &&
            totalBytes % 1.0 == 0.0 &&
            totalBytes <= MAX_TOTAL_BYTES

    companion object {
        const val MAX_OUTPUT_UTF16_LENGTH = 16384
        const val MAX_TOTAL_BYTES = 9007199254740991.0
    }
}

data class RemoteBackgroundTaskIdentity(
    val taskId: String,
    val kind: String,
    val description: String,
    val startedAt: Double? = null,
    val lastProgressAt: Double? = null,
    val progress: String? = null,
    val stopAction: RemoteBackgroundTaskStopAction? = null,
    val category: String? = null,
    val command: String? = null,
    val outputAction: RemoteBackgroundTaskStopAction? = null,
)

enum class RemoteBackgroundTaskReduceAction { Replace, Drain, Noop }

object RemoteBackgroundTaskReduce {
    fun action(
        eventType: String,
        incoming: List<RemoteBackgroundTaskIdentity>?,
        previous: List<RemoteBackgroundTaskIdentity>?,
    ): RemoteBackgroundTaskReduceAction {
        if (eventType == "session.exited") return RemoteBackgroundTaskReduceAction.Drain
        if (eventType == "background_tasks.changed" && incoming == null) return RemoteBackgroundTaskReduceAction.Noop
        if (eventType == "background_tasks.changed" && incoming?.isEmpty() == true) return RemoteBackgroundTaskReduceAction.Drain
        if (eventType == "background_tasks.changed" && incoming == previous) return RemoteBackgroundTaskReduceAction.Noop
        if (eventType == "background_tasks.changed") return RemoteBackgroundTaskReduceAction.Replace
        return RemoteBackgroundTaskReduceAction.Noop
    }

    fun apply(
        eventType: String,
        incoming: List<RemoteBackgroundTaskIdentity>?,
        previous: List<RemoteBackgroundTaskIdentity>?,
    ): List<RemoteBackgroundTaskIdentity>? = when (
        action(eventType, incoming, previous)
    ) {
        RemoteBackgroundTaskReduceAction.Drain -> null
        RemoteBackgroundTaskReduceAction.Noop -> previous
        RemoteBackgroundTaskReduceAction.Replace -> incoming
    }
}
