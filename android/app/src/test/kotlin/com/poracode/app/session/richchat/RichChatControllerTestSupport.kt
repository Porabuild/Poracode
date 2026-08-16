package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCheckpoint
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.BinaryRequestPlan
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.RichChatAuthKind
import com.poracode.app.transport.richchat.RichChatBodyKind
import com.poracode.app.transport.richchat.RuntimeImagePathSegment
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.richchat.ThreadGoalUpdate
import com.poracode.app.transport.richchat.ThreadSteerInput
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

internal val richConnectionA = ClientConnectionId("30000000-0000-4000-8000-000000000003")
internal val richConnectionB = ClientConnectionId("40000000-0000-4000-8000-000000000004")

internal fun richLease(
    connectionId: ClientConnectionId = richConnectionA,
    generation: Long = 1L,
    scopes: Set<String> = setOf(
        "session:read",
        "session:operate",
        "requests:resolve",
        "terminal:read",
        "terminal:operate",
    ),
    online: Boolean = true,
    ready: Boolean = true,
) = RichChatHostLease(connectionId, generation, scopes, online, ready)

internal fun richSnapshot(
    lease: RichChatHostLease = richLease(),
    threadId: String = "thread-a",
    items: List<RichRuntimeItem> = emptyList(),
    seq: Int = 1,
) = RichChatHistorySnapshot(
    key = RichThreadKey(lease.connectionId, threadId),
    snapshotSeq = seq,
    state = RichThreadState.hydrate(RichThreadKey(lease.connectionId, threadId), items),
    olderCursor = null,
    config = ThreadConfig(model = "gpt-5"),
    terminalScrollback = null,
    updatedAt = "2026-08-12T00:00:00.000Z",
)

internal class FakeRichChatSessionGateway : RichChatSessionGateway {
    val calls = mutableListOf<String>()
    var historyHandler: suspend (RichChatHostLease, String) -> RichChatHistorySnapshot =
        { lease, threadId -> richSnapshot(lease, threadId) }
    var olderHandler: suspend (RichChatHostLease, String, Int) -> RichChatHistoryPage =
        { _, _, _ -> RichChatHistoryPage(emptyList(), null) }
    var unitHandler: suspend (String) -> Unit = {}
    var checkpointHandler: suspend (String) -> RichCheckpoint = {
        RichCheckpoint("thread-a", "item-a", "refs/a", "abc", "2026-08-12T00:00:00Z")
    }
    var checkpointCollection = RichCheckpointCollection(emptyList(), emptyList())
    var uploadHandler: suspend (String, AttachmentUploadBody) -> String = { _, _ -> "/tmp/file" }

    override suspend fun history(
        lease: RichChatHostLease,
        threadId: String,
        targetTimelineEntryCount: Int,
    ): RichChatHistorySnapshot {
        calls += "history"
        return historyHandler(lease, threadId)
    }

    override suspend fun olderItems(
        lease: RichChatHostLease,
        threadId: String,
        beforePosition: Int,
        limit: Int,
        targetTimelineEntryCount: Int,
    ): RichChatHistoryPage {
        calls += "older"
        return olderHandler(lease, threadId, beforePosition)
    }

    override suspend fun send(
        lease: RichChatHostLease,
        threadId: String,
        prompt: String,
        config: ThreadConfig,
        segments: JsonArray?,
        userMessageItemId: String?,
    ) = call("send")

    override suspend fun interrupt(lease: RichChatHostLease, threadId: String) = call("interrupt")
    override suspend fun truncate(lease: RichChatHostLease, threadId: String, itemId: String) =
        call("truncate")

    override suspend fun updateGoal(
        lease: RichChatHostLease,
        threadId: String,
        update: ThreadGoalUpdate,
    ) = call("goal")

    override suspend fun setSteer(
        lease: RichChatHostLease,
        threadId: String,
        input: ThreadSteerInput,
    ) = call("steer-set")

    override suspend fun clearSteer(lease: RichChatHostLease, threadId: String) = call("steer-clear")
    override suspend fun threadCommand(
        lease: RichChatHostLease,
        threadId: String,
        command: JsonObject,
    ) = call("command")

    override suspend fun closeThread(lease: RichChatHostLease, threadId: String) = call("thread-close")

    override suspend fun resolveRequest(
        lease: RichChatHostLease,
        threadId: String,
        resolution: RequestResolution,
    ) = call("resolve")

    override suspend fun rollback(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = call("rollback")

    override suspend fun createCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpoint {
        calls += "checkpoint-create"
        return checkpointHandler("checkpoint-create")
    }

    override suspend fun finalizeCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpoint {
        calls += "checkpoint-finalize"
        return checkpointHandler("checkpoint-finalize")
    }

    override suspend fun listCheckpoints(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpointCollection {
        calls += "checkpoint-list"
        return checkpointCollection
    }

    override suspend fun restoreCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = call("checkpoint-restore")

    override suspend fun stageInput(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = call("stage")

    override suspend fun uploadAttachment(
        lease: RichChatHostLease,
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): String {
        calls += "upload"
        return uploadHandler(name, body)
    }

    override suspend fun localImagePlan(lease: RichChatHostLease, path: String): BinaryRequestPlan {
        calls += "local-image"
        return imagePlan("/api/files/image")
    }

    override suspend fun runtimeImagePlan(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): BinaryRequestPlan {
        calls += "runtime-image"
        return imagePlan("/api/threads/$threadId/items/$itemId/image")
    }

    override suspend fun startTerminal(lease: RichChatHostLease, input: TerminalStartInput) =
        call("terminal-start")

    override suspend fun watchTerminal(
        lease: RichChatHostLease,
        request: RichTerminalWatchRequest,
    ) = call("terminal-watch")

    override suspend fun unwatchTerminal(lease: RichChatHostLease, terminalId: String) =
        call("terminal-unwatch")

    override suspend fun writeTerminal(
        lease: RichChatHostLease,
        threadId: String,
        data: String,
    ) = call("terminal-write")

    override suspend fun resizeTerminal(
        lease: RichChatHostLease,
        threadId: String,
        columns: Int,
        rows: Int,
    ) = call("terminal-resize")

    override suspend fun closeTerminal(lease: RichChatHostLease, threadId: String) =
        call("terminal-close")

    private suspend fun call(name: String) {
        calls += name
        unitHandler(name)
    }

    private fun imagePlan(path: String) = BinaryRequestPlan(
        method = "GET",
        path = path,
        query = emptyList(),
        authKind = RichChatAuthKind.BEARER_OR_QUERY,
        bodyKind = RichChatBodyKind.EMPTY,
    )
}

internal fun fixture(name: String): String = checkNotNull(
    RichChatControllerTestSupport::class.java.classLoader?.getResource("fixtures/$name"),
) { "missing fixture $name" }.readText()

private object RichChatControllerTestSupport
