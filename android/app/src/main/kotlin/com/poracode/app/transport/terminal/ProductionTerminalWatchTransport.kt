package com.poracode.app.transport.terminal

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalConnectionStatus
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.terminal.TerminalRemoteV3Codec
import com.poracode.app.session.richchat.RichChatGatewayException
import com.poracode.app.session.richchat.RichChatHostKey
import com.poracode.app.session.richchat.RichTerminalWatchRequest
import com.poracode.app.session.richchat.RichTerminalWatchTransport
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

/** One-host, one-terminal reliable cursor-v1 WebSocket. It never requests event replay. */
class ProductionTerminalWatchTransport(
    private val host: RichChatHostKey,
    private val http: RemoteApiClient,
    client: OkHttpClient,
    private val scope: CoroutineScope,
    private val networkGate: ForegroundNetworkGate,
    private val observer: () -> TerminalTransportObserver,
) : RichTerminalWatchTransport {
    private val client = client.newBuilder()
        .retryOnConnectionFailure(false)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .build()
    private val lock = Any()
    private var target: WatchTarget? = null
    private var generation = 0L
    private var socket: WebSocket? = null
    private var placeholder: ForegroundNetworkGate.SocketPlaceholder? = null
    private var connectJob: Job? = null
    private var reconnectAttempt = 0
    private var foreground = true
    private var closed = false

    override suspend fun watch(request: RichTerminalWatchRequest) {
        if (request.cursorSyncVersion != TerminalRemoteV3Codec.CURSOR_SYNC_VERSION) {
            throw RichChatGatewayException(409, "unsupported_capability", false)
        }
        val next = WatchTarget(request.terminalId, request.watchId)
        synchronized(lock) {
            check(!closed) { "terminal transport is closed" }
            target = next
            generation += 1L
            reconnectAttempt = 0
            cancelConnectionLocked()
        }
        val environment = try {
            http.requestText(ProtocolConstants.ENVIRONMENT_PATH)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            observer().onStatus(
                host,
                next.terminalId,
                next.watchId,
                TerminalConnectionStatus(
                    TerminalConnectionPhase.Failed,
                    if ((error as? RemoteClientException)?.isUnauthorized == true) {
                        TerminalConnectionFailure.Authentication
                    } else {
                        TerminalConnectionFailure.Network
                    },
                ),
            )
            throw error
        }
        val supportsCursorV1 = try {
            TerminalRemoteV3Codec.supportsCursorV1(environment)
        } catch (error: Exception) {
            observer().onStatus(
                host,
                next.terminalId,
                next.watchId,
                TerminalConnectionStatus(
                    TerminalConnectionPhase.Failed,
                    TerminalConnectionFailure.Protocol,
                ),
            )
            throw error
        }
        if (!supportsCursorV1) {
            observer().onStatus(
                host,
                next.terminalId,
                next.watchId,
                TerminalConnectionStatus(
                    TerminalConnectionPhase.Failed,
                    TerminalConnectionFailure.Unsupported,
                ),
            )
            throw RichChatGatewayException(409, "unsupported_capability", false)
        }
        launchConnect(next, reconnecting = false)
    }

    override suspend fun unwatch(terminalId: String) {
        val message = TerminalRemoteV3Codec.encodeUnwatch(terminalId)
        synchronized(lock) {
            if (target?.terminalId != terminalId) return
            socket?.send(message)
            target = null
            generation += 1L
            reconnectAttempt = 0
            cancelConnectionLocked()
        }
        observer().onStatus(
            host,
            terminalId,
            "",
            TerminalConnectionStatus(TerminalConnectionPhase.Idle),
        )
    }

    fun enterBackground() {
        val current: WatchTarget?
        synchronized(lock) {
            foreground = false
            generation += 1L
            current = target
            cancelConnectionLocked()
        }
        current?.let {
            observer().onStatus(
                host,
                it.terminalId,
                it.watchId,
                TerminalConnectionStatus(TerminalConnectionPhase.Suspended),
            )
        }
    }

    fun enterForeground() {
        synchronized(lock) {
            if (closed) return
            foreground = true
            reconnectAttempt = 0
        }
    }

    fun close() {
        synchronized(lock) {
            closed = true
            foreground = false
            target = null
            generation += 1L
            cancelConnectionLocked()
        }
    }

    private fun launchConnect(expected: WatchTarget, reconnecting: Boolean) {
        val gen: Long
        synchronized(lock) {
            if (!canConnectLocked(expected)) return
            generation += 1L
            gen = generation
            connectJob?.cancel()
            connectJob = scope.launch { connect(expected, gen, reconnecting) }
        }
    }

    private suspend fun connect(expected: WatchTarget, gen: Long, reconnecting: Boolean) {
        val phase = if (reconnecting) {
            TerminalConnectionPhase.Reconnecting
        } else {
            TerminalConnectionPhase.Connecting
        }
        observer().onConnectionReset(host, expected.terminalId, expected.watchId, status(phase))
        try {
            val ticket = http.websocketTicket()
            if (!isCurrent(expected, gen)) return
            val request = Request.Builder()
                .url(http.websocketUrl(ticket, lastSeenSeq = null, threadItemInterests = null))
                .build()
            val gatePlaceholder = networkGate.registerSocketPlaceholder()
            synchronized(lock) {
                if (!isCurrentLocked(expected, gen) || gatePlaceholder.isCancelled) {
                    gatePlaceholder.cancel()
                    return
                }
                placeholder = gatePlaceholder
            }
            val listener = listener(expected, gen, gatePlaceholder)
            val created = client.newWebSocket(request, listener)
            if (!gatePlaceholder.installOrCancel(created)) return
            synchronized(lock) {
                if (isCurrentLocked(expected, gen)) {
                    socket = created
                } else {
                    gatePlaceholder.cancel()
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (!isCurrent(expected, gen)) return
            val remote = error as? RemoteClientException
            if (remote?.isUnauthorized == true) {
                fail(expected, gen, TerminalConnectionFailure.Authentication)
            } else {
                scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
            }
        }
    }

    private fun listener(
        expected: WatchTarget,
        gen: Long,
        gate: ForegroundNetworkGate.SocketPlaceholder,
    ) = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            if (!isCurrent(expected, gen)) webSocket.cancel()
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            receive(expected, gen, webSocket, text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            receive(expected, gen, webSocket, bytes.utf8())
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(code, "")
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            gate.release(webSocket)
            clearSocket(webSocket)
            if (!isCurrent(expected, gen)) return
            val failure = if (code == 1008) {
                TerminalConnectionFailure.Authentication
            } else {
                TerminalConnectionFailure.Network
            }
            if (failure == TerminalConnectionFailure.Authentication) fail(expected, gen, failure)
            else scheduleReconnect(expected, gen, failure)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            gate.release(webSocket)
            clearSocket(webSocket)
            if (!isCurrent(expected, gen)) return
            val failure = if (response?.code == 401 || response?.code == 403) {
                TerminalConnectionFailure.Authentication
            } else {
                TerminalConnectionFailure.Network
            }
            if (failure == TerminalConnectionFailure.Authentication) fail(expected, gen, failure)
            else scheduleReconnect(expected, gen, failure)
        }
    }

    private fun receive(expected: WatchTarget, gen: Long, webSocket: WebSocket, raw: String) {
        if (!isCurrent(expected, gen)) return
        if (TerminalRemoteV3Codec.isReadyFrame(raw)) {
            val sent = webSocket.send(
                TerminalRemoteV3Codec.encodeWatch(expected.terminalId, expected.watchId),
            )
            if (!sent) {
                scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
                return
            }
            observer().onStatus(host, expected.terminalId, expected.watchId, status(
                TerminalConnectionPhase.WaitingForBaseline,
            ))
            return
        }
        val frame = try {
            TerminalRemoteV3Codec.decodeServerFrame(raw)
        } catch (_: Exception) {
            fail(expected, gen, TerminalConnectionFailure.Protocol)
            return
        } ?: return
        if (!frame.matches(expected)) return
        when (frame) {
            is TerminalServerFrame.Cursor -> {
                observer().onFrame(host, frame)
                if (frame.frame.kind == com.poracode.app.chat.TerminalCursorFrameKind.BASELINE) {
                    synchronized(lock) { if (isCurrentLocked(expected, gen)) reconnectAttempt = 0 }
                    observer().onStatus(
                        host,
                        expected.terminalId,
                        expected.watchId,
                        status(TerminalConnectionPhase.Live),
                    )
                }
            }
            is TerminalServerFrame.WatchError -> {
                observer().onFrame(host, frame)
                if (frame.error.retryable) {
                    scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
                } else {
                    fail(
                        expected,
                        gen,
                        when (frame.error.code) {
                            com.poracode.app.model.terminal.TerminalWatchErrorCode.Forbidden ->
                                TerminalConnectionFailure.Authentication
                            com.poracode.app.model.terminal.TerminalWatchErrorCode.NotFound ->
                                TerminalConnectionFailure.Offline
                            com.poracode.app.model.terminal.TerminalWatchErrorCode.Unavailable ->
                                TerminalConnectionFailure.Unsupported
                        },
                    )
                }
            }
        }
    }

    private fun scheduleReconnect(
        expected: WatchTarget,
        gen: Long,
        failure: TerminalConnectionFailure,
    ) {
        val delayMs: Long
        synchronized(lock) {
            if (!isCurrentLocked(expected, gen)) return
            reconnectAttempt = (reconnectAttempt + 1).coerceAtMost(RECONNECT_DELAYS.lastIndex)
            delayMs = RECONNECT_DELAYS[reconnectAttempt]
            generation += 1L
            cancelConnectionLocked()
        }
        observer().onConnectionReset(
            host,
            expected.terminalId,
            expected.watchId,
            TerminalConnectionStatus(TerminalConnectionPhase.Reconnecting, failure),
        )
        synchronized(lock) {
            if (!canConnectLocked(expected)) return
            connectJob = scope.launch {
                delay(delayMs)
                launchConnect(expected, reconnecting = true)
            }
        }
    }

    private fun fail(expected: WatchTarget, gen: Long, failure: TerminalConnectionFailure) {
        synchronized(lock) {
            if (!isCurrentLocked(expected, gen)) return
            generation += 1L
            cancelConnectionLocked()
        }
        observer().onStatus(
            host,
            expected.terminalId,
            expected.watchId,
            TerminalConnectionStatus(TerminalConnectionPhase.Failed, failure),
        )
    }

    private fun isCurrent(expected: WatchTarget, gen: Long): Boolean =
        synchronized(lock) { isCurrentLocked(expected, gen) }

    private fun isCurrentLocked(expected: WatchTarget, gen: Long): Boolean =
        generation == gen && target == expected && foreground && !closed && networkGate.isOpen

    private fun canConnectLocked(expected: WatchTarget): Boolean =
        target == expected && foreground && !closed && networkGate.isOpen

    private fun clearSocket(candidate: WebSocket) = synchronized(lock) {
        if (socket === candidate) socket = null
    }

    private fun cancelConnectionLocked() {
        connectJob?.cancel()
        connectJob = null
        placeholder?.cancel()
        placeholder = null
        socket?.cancel()
        socket = null
    }

    private fun TerminalServerFrame.matches(expected: WatchTarget): Boolean = when (this) {
        is TerminalServerFrame.Cursor ->
            frame.terminalId == expected.terminalId && frame.watchId == expected.watchId
        is TerminalServerFrame.WatchError ->
            error.terminalId == expected.terminalId && error.watchId == expected.watchId
    }

    private fun status(phase: TerminalConnectionPhase) = TerminalConnectionStatus(phase)

    private data class WatchTarget(val terminalId: String, val watchId: String)

    private companion object {
        val RECONNECT_DELAYS = longArrayOf(0, 250, 1_000, 2_000, 5_000, 10_000)
    }
}
