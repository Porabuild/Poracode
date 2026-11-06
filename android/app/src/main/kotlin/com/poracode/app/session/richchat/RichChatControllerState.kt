package com.poracode.app.session.richchat

import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.BackgroundTask

enum class RichChatLoadPhase {
    Idle,
    Loading,
    Empty,
    Loaded,
    Failed,
}

data class RichChatControllerState(
    val selection: RichChatThreadLease? = null,
    val transcript: RichThreadState? = null,
    val snapshotSeq: Int? = null,
    val olderCursor: Int? = null,
    /** `ct1.` continuation for older completed turns; null ends the walk. */
    val olderTurnsCursor: String? = null,
    val config: ThreadConfig? = null,
    val terminalScrollback: String? = null,
    val loadPhase: RichChatLoadPhase = RichChatLoadPhase.Idle,
    val loadingOlder: Boolean = false,
    val activeOperations: Set<String> = emptySet(),
    val failure: RichChatOperationFailure? = null,
    /** Required after an ambiguous mutation or lifecycle interruption. */
    val needsAuthoritativeRefresh: Boolean = false,
    /** B1 durable history notice / recovery; selection-scoped metadata owner. */
    val historyNotice: RichChatHistoryNoticeState = RichChatHistoryNoticeState(),
    /**
     * Authoritative live background work for the selected thread, kept outside
     * [transcript] so task progress never invalidates the timeline projection.
     * Null means the host reports no live tasks (drain/empty are equivalent).
     */
    val backgroundTasks: List<BackgroundTask>? = null,
    /**
     * Sequence of the last accepted valid background-task level change
     * (`background_tasks.changed` or `session.exited`/thread-exited), outside
     * the transcript. Only background metadata advances it so a newer
     * unrelated text/status event can never block an authoritative drain.
     */
    val backgroundTaskSequence: Int? = null,
)
