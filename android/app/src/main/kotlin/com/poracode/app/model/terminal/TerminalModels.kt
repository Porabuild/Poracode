package com.poracode.app.model.terminal

import com.poracode.app.chat.TerminalCursorFrame

enum class TerminalProcessState { Running, Exited }

data class TerminalDimensions(
    val columns: Int,
    val rows: Int,
) {
    init {
        require(columns > 0)
        require(rows > 0)
    }
}

enum class TerminalWatchErrorCode {
    Forbidden,
    NotFound,
    Unavailable,
}

data class TerminalWatchError(
    val terminalId: String,
    val watchId: String,
    val code: TerminalWatchErrorCode,
    val retryable: Boolean,
    /** Server verdict discriminator, e.g. `unsupported-version` marks an
     * explicit cursor-sync downgrade instead of a hard failure. */
    val reason: String? = null,
)

sealed interface TerminalServerFrame {
    data class Cursor(
        val frame: TerminalCursorFrame,
        val processState: TerminalProcessState? = null,
        val dimensions: TerminalDimensions? = null,
    ) : TerminalServerFrame

    /** Cursor-sync v2 slice; the transport assembles + acks these and never
     * forwards them — completion is delivered as a [Cursor] BASELINE frame. */
    data class BaselineChunk(val chunk: TerminalBaselineChunk) : TerminalServerFrame

    data class WatchError(val error: TerminalWatchError) : TerminalServerFrame
}

enum class TerminalConnectionPhase {
    Idle,
    Connecting,
    WaitingForBaseline,
    Live,
    Reconnecting,
    Suspended,
    Failed,
}

enum class TerminalConnectionFailure {
    Offline,
    Authentication,
    Permission,
    Unsupported,
    Protocol,
    Network,
}

data class TerminalConnectionStatus(
    val phase: TerminalConnectionPhase = TerminalConnectionPhase.Idle,
    val failure: TerminalConnectionFailure? = null,
)
