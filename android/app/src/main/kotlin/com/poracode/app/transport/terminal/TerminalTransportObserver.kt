package com.poracode.app.transport.terminal

import com.poracode.app.model.terminal.TerminalConnectionStatus
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.session.richchat.RichChatHostKey

interface TerminalTransportObserver {
    fun onConnectionReset(
        host: RichChatHostKey,
        terminalId: String,
        watchId: String,
        status: TerminalConnectionStatus,
    )

    fun onFrame(host: RichChatHostKey, frame: TerminalServerFrame)

    fun onStatus(
        host: RichChatHostKey,
        terminalId: String,
        watchId: String,
        status: TerminalConnectionStatus,
    )
}

object NoOpTerminalTransportObserver : TerminalTransportObserver {
    override fun onConnectionReset(
        host: RichChatHostKey,
        terminalId: String,
        watchId: String,
        status: TerminalConnectionStatus,
    ) = Unit

    override fun onFrame(host: RichChatHostKey, frame: TerminalServerFrame) = Unit

    override fun onStatus(
        host: RichChatHostKey,
        terminalId: String,
        watchId: String,
        status: TerminalConnectionStatus,
    ) = Unit
}
