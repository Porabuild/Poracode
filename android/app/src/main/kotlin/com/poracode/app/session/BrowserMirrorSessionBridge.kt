package com.poracode.app.session

import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.ws.WsRawFrameSink

/**
 * Owns the browser-mirror inbound/outbound session surface split out of
 * [AppSession]: the cursor-bypass sink installer bound to the single live
 * [RemoteWebSocketClient], the outbound wire socket, and the socket-generation
 * supplier. Identity re-validation lives in [BrowserMirrorSinkInstaller]; this
 * bridge only threads the current live socket supplier so a late frame on a
 * torn-down client (whose generation counter may repeat) can never be stamped
 * current. No second socket, no retry loop.
 */
internal class BrowserMirrorSessionBridge(
    private val liveWebSocket: () -> RemoteEventSocket?,
) {
    private val installer = BrowserMirrorSinkInstaller<RemoteWebSocketClient>()
    private val sinkSetter: (RemoteWebSocketClient, WsRawFrameSink?) -> Unit =
        RemoteWebSocketClient::setBrowserMirrorSink

    @Volatile
    private var eventSink: ((Int, String) -> Unit)? = null

    fun setEventSink(sink: ((Int, String) -> Unit)?) {
        eventSink = sink
        if (sink == null) installer.clear(sinkSetter) else installOnLiveSocket()
    }

    fun wireSocket(): com.poracode.app.transport.browsermirror.BrowserMirrorWireSocket? =
        socketClient()?.browserMirrorWireSocket()

    fun socketGeneration(): Int? = socketClient()?.socketGeneration()

    fun installOnLiveSocket() {
        installer.install(
            live = socketClient(),
            setSink = sinkSetter,
            liveSupplier = { socketClient() },
            forward = { generation, text -> eventSink?.invoke(generation, text) },
        )
    }

    private fun socketClient(): RemoteWebSocketClient? = liveWebSocket() as? RemoteWebSocketClient
}
