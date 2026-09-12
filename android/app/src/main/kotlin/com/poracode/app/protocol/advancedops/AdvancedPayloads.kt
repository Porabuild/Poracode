package com.poracode.app.protocol.advancedops

import com.poracode.app.model.ProjectLocation
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object AdvancedPayloads {
    fun checkpoint(location: ProjectLocation, threadId: String, checkpointItemId: String) =
        owned(location, "projectLocation") {
            put("threadId", threadId)
            put("checkpointItemId", checkpointItemId)
        }

    fun finalizeCheckpoint(
        location: ProjectLocation,
        threadId: String,
        checkpointItemId: String,
        baseCheckpointItemId: String,
    ) = owned(location, "projectLocation") {
        put("threadId", threadId)
        put("checkpointItemId", checkpointItemId)
        put("baseCheckpointItemId", baseCheckpointItemId)
    }

    fun subscription(threadId: String, parentItemId: String) = buildJsonObject {
        put("threadId", threadId)
        put("parentItemId", parentItemId)
    }

    fun stagedInput(threadId: String, prompt: String, segments: JsonArray?) = buildJsonObject {
        put("threadId", threadId)
        put("prompt", prompt)
        segments?.let { put("segments", it) }
    }

    fun workflowRun(
        location: ProjectLocation,
        manifestPath: String,
        transcriptDir: String?,
        includeAgentChats: Boolean?,
    ) = owned(location, "location") {
        put("manifestPath", manifestPath)
        transcriptDir?.let { put("transcriptDir", it) }
        includeAgentChats?.let { put("includeAgentChats", it) }
    }

    fun workflowChat(
        location: ProjectLocation,
        threadId: String,
        transcriptDir: String,
        agentId: String,
        agentFinished: Boolean,
    ) = owned(location, "location") {
        put("threadId", threadId)
        put("transcriptDir", transcriptDir)
        put("agentId", agentId)
        put("agentFinished", agentFinished)
    }

    fun externalRead(location: ProjectLocation, absolutePath: String) =
        owned(location, "projectLocation") { put("absolutePath", absolutePath) }

    fun externalWrite(
        location: ProjectLocation,
        absolutePath: String,
        content: String,
        baseModifiedAtMs: Double,
    ) = owned(location, "projectLocation") {
        put("absolutePath", absolutePath)
        put("content", content)
        put("baseModifiedAtMs", baseModifiedAtMs)
    }

    fun projectEntry(
        location: ProjectLocation,
        path: String,
        type: String? = null,
        nextName: String? = null,
        nextParentPath: String? = null,
    ) = owned(location, "projectLocation") {
        put("path", path)
        type?.let { put("type", it) }
        nextName?.let { put("nextName", it) }
        nextParentPath?.let { put("nextParentPath", it) }
    }

    fun generation(
        location: ProjectLocation,
        agentKind: String,
        model: String?,
        effort: String?,
        fast: Boolean?,
        language: String?,
        prompt: String? = null,
        branch: String? = null,
        baseBranch: String? = null,
    ) = owned(location, "projectLocation") {
        put("agentKind", agentKind)
        model?.let { put("model", it) }
        effort?.let { put("effort", it) }
        fast?.let { put("fast", it) }
        language?.let { put("language", it) }
        prompt?.let { put("prompt", it) }
        branch?.let { put("branch", it) }
        baseBranch?.let { put("baseBranch", it) }
    }

    private fun owned(
        location: ProjectLocation,
        field: String,
        content: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit,
    ): JsonObject = buildJsonObject {
        put(field, location.toAdvancedWireLocation())
        content()
    }
}
