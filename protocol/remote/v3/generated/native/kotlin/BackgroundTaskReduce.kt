// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Background-task reduce machine rendered from the declarative spec in
// src/shared/remote/contract/backgroundTaskReduceSpec.ts (spec version 2).
package com.poracode.remote.v3.generated

data class RemoteBackgroundTaskIdentity(
    val taskId: String,
    val kind: String,
    val description: String,
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
