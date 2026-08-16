package com.poracode.app.transport.browsermirror

import com.poracode.app.model.browsermirror.BrowserServerMessage
import com.poracode.app.protocol.browsermirror.GeneratedBrowserMirrorContract
import com.poracode.app.session.browsermirror.BrowserMirrorSocketKey

data class BrowserMirrorSocketEnvelope(
    val socketKey: BrowserMirrorSocketKey,
    val message: BrowserServerMessage,
)

/** Validates a raw socket message before it enters the session controller. */
object BrowserMirrorSocketIngress {
    fun decode(socketKey: BrowserMirrorSocketKey, raw: String): BrowserMirrorSocketEnvelope =
        BrowserMirrorSocketEnvelope(
            socketKey = socketKey,
            message = GeneratedBrowserMirrorContract.serverMessage(raw),
        )
}
