package com.poracode.app.session.richchat

import com.poracode.app.chat.TerminalCursorState
import com.poracode.app.model.terminal.TerminalConnectionStatus
import com.poracode.app.model.terminal.TerminalDimensions
import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.model.terminal.TerminalWatchError

data class RichTerminalLease(
    val host: RichChatHostLease,
    val terminalId: String,
    val generation: Long,
) {
    init {
        require(terminalId.isNotEmpty()) { "terminalId must not be empty" }
    }
}

data class RichTerminalState(
    val lease: RichTerminalLease? = null,
    val cursor: TerminalCursorState? = null,
    val watching: Boolean = false,
    val activeOperations: Set<String> = emptySet(),
    val failure: RichChatOperationFailure? = null,
    val needsAuthoritativeRefresh: Boolean = false,
    val connection: TerminalConnectionStatus = TerminalConnectionStatus(),
    val processState: TerminalProcessState? = null,
    val exitCode: Int? = null,
    val dimensions: TerminalDimensions? = null,
    val watchError: TerminalWatchError? = null,
)
