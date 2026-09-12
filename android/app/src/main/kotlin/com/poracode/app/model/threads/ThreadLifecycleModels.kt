package com.poracode.app.model.threads

import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@JvmInline
value class ThreadCommandId(val value: String) {
    init {
        require(value.isNotBlank()) { "Thread command id must not be blank." }
    }
}

enum class ThreadPresentationMode(val wireValue: String) {
    Terminal("terminal"),
    Gui("gui"),
}

data class ThreadTerminalSize(val columns: Int, val rows: Int) {
    init {
        require(columns in 20..400) { "Terminal columns must be between 20 and 400." }
        require(rows in 5..200) { "Terminal rows must be between 5 and 200." }
    }

    internal fun wireObject(): JsonObject = buildJsonObject {
        put("cols", columns)
        put("rows", rows)
    }
}

/** Starts the runtime for an existing server-owned thread through `/api/threads/start`. */
data class ExistingThreadStartRequest(
    val threadId: String,
    val projectLocation: ProjectLocation,
    val agentKind: String,
    val config: ThreadConfig,
    val initialSize: ThreadTerminalSize,
    val commandId: ThreadCommandId,
    val prompt: String = "",
    val agentInstanceId: String? = null,
    val segments: JsonArray? = null,
    val sessionRef: JsonObject? = null,
    val presentationMode: ThreadPresentationMode? = null,
    val mcpServers: JsonArray? = null,
    val disabledBuiltInMcpServerIds: List<String>? = null,
    val invariantDisabledBuiltInMcpServerIds: List<String>? = null,
    val disabledBuiltInMcpTools: JsonObject? = null,
    val userMessageItemId: String? = null,
) {
    init {
        require(threadId.isNotEmpty()) { "Thread id must not be empty." }
        require(agentKind.isNotEmpty()) { "Agent kind must not be empty." }
    }

    internal fun wireObject(): JsonObject = buildJsonObject {
        put("threadId", threadId)
        put(
            "projectLocation",
            RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), projectLocation),
        )
        put("agentKind", agentKind)
        agentInstanceId?.let { put("agentInstanceId", it) }
        put("config", config.toJsonObject())
        put("prompt", prompt)
        segments?.let { put("segments", it) }
        put("initialSize", initialSize.wireObject())
        sessionRef?.let { put("sessionRef", it) }
        presentationMode?.let { put("presentationMode", it.wireValue) }
        mcpServers?.let { put("mcpServers", it) }
        disabledBuiltInMcpServerIds?.let { put("disabledBuiltInMcpServerIds", JsonArray(it.strings())) }
        invariantDisabledBuiltInMcpServerIds?.let {
            put("invariantDisabledBuiltInMcpServerIds", JsonArray(it.strings()))
        }
        disabledBuiltInMcpTools?.let { put("disabledBuiltInMcpTools", it) }
        userMessageItemId?.let { put("userMessageItemId", it) }
    }
}

/** Path-scoped lifecycle command. The body intentionally omits [threadId]. */
sealed interface ThreadLifecycleCommand {
    val threadId: String
    val commandId: ThreadCommandId? get() = null
    fun wireBody(): JsonObject

    data class PrepareWorktree(
        override val threadId: String,
        val projectId: String,
        val worktreePath: String,
    ) : ThreadLifecycleCommand {
        override fun wireBody() = body("prepare-worktree") {
            put("projectId", projectId)
            put("worktreePath", worktreePath)
        }
    }

    data class Start(
        override val threadId: String,
        val projectId: String,
        val agentKind: String,
        val config: ThreadConfig,
        val prompt: String,
        override val commandId: ThreadCommandId,
        val agentInstanceId: String? = null,
        val title: String? = null,
        val segments: JsonArray? = null,
        val presentationMode: ThreadPresentationMode? = null,
        val userMessageItemId: String? = null,
        val worktreePath: String? = null,
        val worktreeBranch: String? = null,
        val pullRequestNumber: Int? = null,
        val isNewWorktree: Boolean? = null,
        val launchRuntime: Boolean? = null,
        val focus: Boolean? = null,
        val parentThreadId: String? = null,
        val groupId: String? = null,
        val groupName: String? = null,
    ) : ThreadLifecycleCommand {
        override fun wireBody() = body("start") {
            put("projectId", projectId)
            put("agentKind", agentKind)
            agentInstanceId?.let { put("agentInstanceId", it) }
            put("config", config.toJsonObject())
            put("prompt", prompt)
            title?.let { put("title", it) }
            segments?.let { put("segments", it) }
            presentationMode?.let { put("presentationMode", it.wireValue) }
            userMessageItemId?.let { put("userMessageItemId", it) }
            worktreePath?.let { put("worktreePath", it) }
            worktreeBranch?.let { put("worktreeBranch", it) }
            pullRequestNumber?.let { put("prNumber", it) }
            isNewWorktree?.let { put("isNewWorktree", it) }
            launchRuntime?.let { put("launchRuntime", it) }
            focus?.let { put("focus", it) }
            parentThreadId?.let { put("parentThreadId", it) }
            groupId?.let { put("groupId", it) }
            groupName?.let { put("groupName", it) }
        }
    }

    data class SetGroup(
        override val threadId: String,
        val groupId: String,
        val groupName: String,
    ) : ThreadLifecycleCommand {
        override fun wireBody() = body("set-group") {
            put("groupId", groupId)
            put("groupName", groupName)
        }
    }

    data class Rename(override val threadId: String, val title: String) : ThreadLifecycleCommand {
        override fun wireBody() = body("rename") { put("title", title) }
    }

    data class Acknowledge(override val threadId: String) : ThreadLifecycleCommand {
        override fun wireBody() = body("acknowledge")
    }

    data class SetDone(override val threadId: String, val done: Boolean) : ThreadLifecycleCommand {
        override fun wireBody() = body("set-done") { put("done", done) }
    }

    data class SetStarred(
        override val threadId: String,
        val starred: Boolean,
    ) : ThreadLifecycleCommand {
        override fun wireBody() = body("set-starred") { put("starred", starred) }
    }

    data class SetWorktree(
        override val threadId: String,
        val worktreePath: String,
        val worktreeBranch: String? = null,
        val isNewWorktree: Boolean? = null,
    ) : ThreadLifecycleCommand {
        override fun wireBody() = body("set-worktree") {
            put("worktreePath", worktreePath)
            worktreeBranch?.let { put("worktreeBranch", it) }
            isNewWorktree?.let { put("isNewWorktree", it) }
        }
    }

    data class DeleteWorktreeGroup(
        override val threadId: String,
        val projectId: String,
        val worktreePath: String,
        val threadIds: List<String>,
    ) : ThreadLifecycleCommand {
        override fun wireBody() = body("delete-worktree-group") {
            put("projectId", projectId)
            put("worktreePath", worktreePath)
            put("threadIds", JsonArray(threadIds.strings()))
        }
    }

    data class Archive(override val threadId: String) : ThreadLifecycleCommand {
        override fun wireBody() = body("archive")
    }

    data class Unarchive(override val threadId: String) : ThreadLifecycleCommand {
        override fun wireBody() = body("unarchive")
    }

    data class Delete(override val threadId: String) : ThreadLifecycleCommand {
        override fun wireBody() = body("delete")
    }
}

private fun body(kind: String, fields: JsonObjectBuilder.() -> Unit = {}): JsonObject =
    buildJsonObject {
        put("kind", kind)
        fields()
    }

private typealias JsonObjectBuilder = kotlinx.serialization.json.JsonObjectBuilder

private fun List<String>.strings() = map { value -> JsonPrimitive(value) }
