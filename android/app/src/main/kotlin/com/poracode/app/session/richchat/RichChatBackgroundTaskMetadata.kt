package com.poracode.app.session.richchat

import com.poracode.app.protocol.BackgroundTask
import com.poracode.app.protocol.RuntimeEventReducer
import com.poracode.remote.v3.generated.RemoteBackgroundTaskReduce
import kotlinx.coroutines.flow.update

/**
 * One `background_tasks.changed` / `session.exited` level change. Only the
 * generated event type and the already-decoded task list travel here: no
 * wire field is re-declared and no opaque action payload is inspected.
 */
data class RichChatBackgroundTaskChange(
    val eventType: String,
    val tasks: List<BackgroundTask> = emptyList(),
)

internal fun RuntimeEventReducer.RuntimeEvent.asBackgroundTaskChange(): RichChatBackgroundTaskChange? = when (type) {
    "background_tasks.changed" -> tasks?.let { RichChatBackgroundTaskChange(type, it) }
    "session.exited" -> RichChatBackgroundTaskChange(type)
    else -> null
}

/** Folds a frame's changes through the generated reduce machine (V6 E.3). */
internal fun applyBackgroundTaskChanges(
    previous: List<BackgroundTask>?,
    changes: List<RichChatBackgroundTaskChange>,
): List<BackgroundTask>? {
    var next = previous
    for (change in changes) {
        next = RemoteBackgroundTaskReduce.apply(change.eventType, change.tasks, next)
    }
    return next
}

internal fun RichChatController.drainBackgroundTasksForThreadExit(
    threadId: String,
    sequence: Int?,
): Boolean = synchronized(this) {
    if (!lifecycle.isForeground) return@synchronized false
    val selected = selection.value ?: return@synchronized false
    if (selected.threadId != threadId || !session.isCurrent(selected.host)) return@synchronized false
    var accepted = false
    mutableState.update { current ->
        accepted = sequence?.let { incoming ->
            current.backgroundTaskSequence?.let { incoming >= it } ?: true
        } ?: true
        if (!accepted) {
            current
        } else {
            val nextSequence = sequence?.let { incoming ->
                current.backgroundTaskSequence?.let { maxOf(it, incoming) } ?: incoming
            } ?: current.backgroundTaskSequence
            current.copy(backgroundTasks = null, backgroundTaskSequence = nextSequence)
        }
    }
    accepted
}
