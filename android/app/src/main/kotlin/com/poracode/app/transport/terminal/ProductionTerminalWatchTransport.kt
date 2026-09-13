package com.poracode.app.transport.terminal

import com.poracode.app.chat.TerminalBaselineAssembler
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
import com.poracode.app.session.richchat.RichTerminalWatchResume
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

/** One-host, one-terminal reliable cursor-sync WebSocket (v2 chunked baseline
 * with v1 downgrade). It never requests event replay. */
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
    private var environmentValidated = false
    private val cursorSync = TerminalCursorSyncSession()
    /** Idle deadline for the in-flight baseline (reset by every frame). */
    private var baselineDeadlineJob: Job? = null

    override suspend fun watch(request: RichTerminalWatchRequest) {
        if (request.cursorSyncVersion != TerminalRemoteV3Codec.CURSOR_SYNC_VERSION &&
            request.cursorSyncVersion != TerminalRemoteV3Codec.CURSOR_SYNC_V2_VERSION
        ) {
            throw RichChatGatewayException(409, "unsupported_capability", false)
        }
        val next = WatchTarget(
            terminalId = request.terminalId,
            watchId = request.watchId,
            requestedVersion = request.cursorSyncVersion,
            resume = request.resume,
        )
        synchronized(lock) {
            check(!closed) { "terminal transport is closed" }
            target = next
            environmentValidated = false
            generation += 1L
            reconnectAttempt = 0
            cursorSync.reset()
            cancelConnectionLocked()
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
            // Capability discovery is part of the retrying connection attempt. A
            // transient preflight failure must not strand a retained shell until
            // a user manually presses Reconnect.
            if (synchronized(lock) { !environmentValidated }) {
                val environment = http.requestText(ProtocolConstants.ENVIRONMENT_PATH)
                if (!isCurrent(expected, gen)) return
                val negotiated = try {
                    cursorSync.negotiate(expected.requestedVersion, environment)
                } catch (_: Exception) {
                    fail(expected, gen, TerminalConnectionFailure.Protocol)
                    return
                }
                if (negotiated == null) {
                    fail(expected, gen, TerminalConnectionFailure.Unsupported)
                    return
                }
                synchronized(lock) {
                    if (!isCurrentLocked(expected, gen)) return
                    environmentValidated = true
                }
            }
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
            if (code == 1008) fail(expected, gen, TerminalConnectionFailure.Authentication)
            else scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            gate.release(webSocket)
            clearSocket(webSocket)
            if (!isCurrent(expected, gen)) return
            val unauthorized = response?.code == 401 || response?.code == 403
            if (unauthorized) fail(expected, gen, TerminalConnectionFailure.Authentication)
            else scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
        }
    }

    private fun receive(expected: WatchTarget, gen: Long, webSocket: WebSocket, raw: String) {
        if (!isCurrent(expected, gen)) return
        if (TerminalRemoteV3Codec.isReadyFrame(raw)) {
            val watchMessage = synchronized(lock) {
                if (!isCurrentLocked(expected, gen)) return
                cursorSync.watchMessage(expected.terminalId, expected.watchId, expected.resume)
            }
            val sent = webSocket.send(watchMessage)
            if (!sent) {
                scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
                return
            }
            armBaselineDeadline(expected, gen)
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
        if (!frame.matchesAttempt(expected.terminalId, expected.watchId)) return
        // Every matched frame proves the attempt is progressing — a slow but
        // moving baseline must never hit the idle deadline mid-transfer.
        if (frame !is TerminalServerFrame.WatchError) armBaselineDeadline(expected, gen)
        when (frame) {
            is TerminalServerFrame.BaselineChunk -> {
                when (val outcome = cursorSync.offerChunk(frame.chunk)) {
                    is TerminalBaselineAssembler.Outcome.Acknowledge -> {
                        sendAck(expected, gen, webSocket, outcome.throughCursor)
                    }
                    is TerminalBaselineAssembler.Outcome.Complete -> {
                        sendAck(expected, gen, webSocket, outcome.throughCursor)
                        deliverBaseline(
                            expected = expected,
                            gen = gen,
                            frame = TerminalServerFrame.Cursor(
                                frame = outcome.frame,
                                processState = outcome.processState,
                                dimensions = outcome.dimensions,
                            ),
                        )
                    }
                    TerminalBaselineAssembler.Outcome.Duplicate -> Unit
                    TerminalBaselineAssembler.Outcome.Discard ->
                        scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
                }
            }
            is TerminalServerFrame.Cursor -> deliverBaseline(expected, gen, frame)
            is TerminalServerFrame.WatchError -> {
                if (downgradeOnUnsupportedVersion(expected, gen, webSocket, frame.error)) {
                    return
                }
                observer().onFrame(host, frame)
                if (frame.error.retryable) {
                    scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
                } else {
                    fail(expected, gen, cursorSync.failureFor(frame.error))
                }
            }
        }
    }

    /**
     * Explicit v2→v1 downgrade (mirrors the desktop feed swap): a
     * non-retryable `unavailable` with `reason: "unsupported-version"` means
     * "re-watch as v1 on this connection", not a hard failure. Returns true
     * when the downgrade was applied (the error frame is consumed here and
     * never delivered).
     */
    private fun downgradeOnUnsupportedVersion(
        expected: WatchTarget,
        gen: Long,
        webSocket: WebSocket,
        error: com.poracode.app.model.terminal.TerminalWatchError,
    ): Boolean {
        if (!cursorSync.downgradeIfUnsupportedVersion(error)) return false
        if (!isCurrent(expected, gen)) return false
        val sent = webSocket.send(
            cursorSync.watchMessage(expected.terminalId, expected.watchId, expected.resume),
        )
        if (!sent) {
            scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
            return true
        }
        armBaselineDeadline(expected, gen)
        observer().onStatus(
            host,
            expected.terminalId,
            expected.watchId,
            status(TerminalConnectionPhase.WaitingForBaseline),
        )
        return true
    }

    /** Arms (or re-arms) the baseline idle deadline for the current attempt. */
    private fun armBaselineDeadline(expected: WatchTarget, gen: Long) {
        val job = scope.launch {
            delay(BASELINE_TIMEOUT_MS)
            if (isCurrent(expected, gen)) {
                scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
            }
        }
        synchronized(lock) {
            if (!isCurrentLocked(expected, gen)) {
                job.cancel()
                return
            }
            baselineDeadlineJob?.cancel()
            baselineDeadlineJob = job
        }
    }

    private fun sendAck(
        expected: WatchTarget,
        gen: Long,
        webSocket: WebSocket,
        throughCursor: Long,
    ) {
        if (!isCurrent(expected, gen)) return
        if (!webSocket.send(
                TerminalRemoteV3Codec.encodeBaselineAck(
                    expected.terminalId,
                    expected.watchId,
                    throughCursor,
                ),
            )
        ) {
            scheduleReconnect(expected, gen, TerminalConnectionFailure.Network)
        }
    }

    private fun deliverBaseline(
        expected: WatchTarget,
        gen: Long,
        frame: TerminalServerFrame.Cursor,
    ) {
        observer().onFrame(host, frame)
        if (frame.frame.kind == com.poracode.app.chat.TerminalCursorFrameKind.BASELINE) {
            synchronized(lock) {
                if (isCurrentLocked(expected, gen)) {
                    reconnectAttempt = 0
                    baselineDeadlineJob?.cancel()
                    baselineDeadlineJob = null
                }
            }
            observer().onStatus(
                host,
                expected.terminalId,
                expected.watchId,
                status(TerminalConnectionPhase.Live),
            )
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
            cursorSync.reset()
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
        baselineDeadlineJob?.cancel()
        baselineDeadlineJob = null
        placeholder?.cancel()
        placeholder = null
        socket?.cancel()
        socket = null
    }

    private fun status(phase: TerminalConnectionPhase) = TerminalConnectionStatus(phase)

    private data class WatchTarget(
        val terminalId: String,
        val watchId: String,
        val requestedVersion: Int,
        val resume: RichTerminalWatchResume?,
    )

    private companion object {
        val RECONNECT_DELAYS = longArrayOf(0, 250, 1_000, 2_000, 5_000, 10_000)
        const val BASELINE_TIMEOUT_MS = 10_000L
    }
}
