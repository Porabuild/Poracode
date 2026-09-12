package com.poracode.app.chat

import com.poracode.app.model.ClientConnectionId

/** Collision-free identity for a remote thread. Remote ids are only host-local. */
data class RichThreadKey(
    val connectionId: ClientConnectionId,
    val threadId: String,
) {
    init {
        require(threadId.isNotEmpty()) { "threadId must not be empty" }
    }
}
