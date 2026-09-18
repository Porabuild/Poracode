package com.poracode.app.session.richchat

import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ThreadConfig

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
    val config: ThreadConfig? = null,
    val terminalScrollback: String? = null,
    val loadPhase: RichChatLoadPhase = RichChatLoadPhase.Idle,
    val loadingOlder: Boolean = false,
    val activeOperations: Set<String> = emptySet(),
    val failure: RichChatOperationFailure? = null,
    /** Required after an ambiguous mutation or lifecycle interruption. */
    val needsAuthoritativeRefresh: Boolean = false,
)
