package com.poracode.app.protocol

import com.poracode.app.model.asObjectOrNull
import com.poracode.app.protocol.RuntimeEventValidators.strictString
import com.poracode.remote.v3.generated.RemoteBackgroundTaskStopAction
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/**
 * Decodes the `background_tasks.changed` task list, including the optional
 * timing, progress and opaque Stop descriptor. Every entry must pass
 * [RuntimeEventValidators.validateBackgroundTask]; one invalid entry rejects
 * the whole list, so the caller drops the event (Zod parity).
 */
internal object RuntimeBackgroundTaskDecoder {
    fun decode(tasks: JsonArray): List<BackgroundTask>? = tasks.map { task ->
        if (!RuntimeEventValidators.validateBackgroundTask(task)) return null
        val obj = task.asObjectOrNull()!!
        BackgroundTask(
            taskId = obj.strictString("taskId")!!,
            kind = obj.strictString("kind")!!,
            description = obj.strictString("description")!!,
            startedAt = (obj["startedAt"] as? JsonPrimitive)?.doubleOrNull,
            lastProgressAt = (obj["lastProgressAt"] as? JsonPrimitive)?.doubleOrNull,
            progress = obj.strictString("progress"),
            stopAction = (obj["stopAction"] as? JsonObject)?.let(::decodeStopAction),
        )
    }

    private fun decodeStopAction(action: JsonObject) = RemoteBackgroundTaskStopAction(
        action.strictString("id")!!,
        (action["payload"] as JsonObject).mapValues { (_, value) -> (value as JsonPrimitive).content },
    )
}
