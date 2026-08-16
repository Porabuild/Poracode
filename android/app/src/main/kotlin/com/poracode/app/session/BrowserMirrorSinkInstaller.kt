package com.poracode.app.session

import com.poracode.app.transport.ws.WsRawFrameSink

/**
 * Owns the single installed browser-mirror sink host and the per-host forwarding closure,
 * so [com.poracode.app.session.AppSession] can re-bind it as the live WebSocket identity
 * changes (host swap, reconnect, background) without forwarding a late frame from a
 * torn-down client.
 *
 * Identity is by reference, not by the per-client numeric generation counter (which can
 * repeat across two distinct clients). Each install captures the exact host identity and
 * re-validates it against the current installed host and the live host before forwarding,
 * so a late frame delivered on an old, detached client is dropped rather than stamped as
 * current. Allocation is one short closure per install; nothing is queued or retried.
 */
internal class BrowserMirrorSinkInstaller<T : Any> {
    @Volatile
    private var installed: T? = null

    fun install(
        live: T?,
        setSink: (T, WsRawFrameSink?) -> Unit,
        liveSupplier: () -> T?,
        forward: (Int, String) -> Unit,
    ) {
        val previouslyInstalled = installed
        if (previouslyInstalled != null && previouslyInstalled !== live) {
            // Detach the previously installed host whenever the live identity changes or
            // becomes null, so its frames stop forwarding immediately.
            setSink(previouslyInstalled, null)
            installed = null
        }
        if (live == null) return
        if (live === installed) return
        val captured = live
        setSink(
            captured,
            WsRawFrameSink { generation, text ->
                if (captured !== installed) return@WsRawFrameSink
                if (captured !== liveSupplier()) return@WsRawFrameSink
                forward(generation, text)
            },
        )
        installed = captured
    }

    fun clear(setSink: (T, WsRawFrameSink?) -> Unit) {
        installed?.let { setSink(it, null) }
        installed = null
    }
}
