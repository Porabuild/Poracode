package com.poracode.app.transport.ws

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.RemoteSocketDecisions
import com.poracode.app.protocol.RemoteSocketPolicy
import com.poracode.app.protocol.SocketGenerationGate
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

/** Ticket fetch + WebSocket open/close/failure + reconnect scheduling. */
class WsConnectionLoop(
    private val api: RemoteApiGateway,
    private val state: WsClientState,
    private val scope: CoroutineScope,
    private val httpClient: OkHttpClient,
    private val frameRouter: WsFrameRouter,
    private val handleSessionExpired: (String) -> Unit,
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
) {
    fun launchConnect() {
        state.connectJob?.cancel()
        state.connectJob = scope.launch {
            connect()
        }
    }

    fun forceReconnect(reason: String) {
        if (state.stopped.get() || state.suspended.get() || state.sessionExpired.get()) return
        val gen = state.generationGate.beginForceReconnect()
        state.readyReceived.set(false)
        state.tearDownSocket()
        state.publish(RemoteWebSocketClient.ConnectionState.Reconnecting, reason)
        scheduleReconnect(reason, unauthorized = false, gen = gen)
    }

    fun scheduleReconnect(reason: String, unauthorized: Boolean, gen: Int) {
        if (state.stopped.get() || state.suspended.get()) return
        if (state.generationGate.decision(
                gen,
                SocketGenerationGate.CallbackKind.ScheduleReconnectFire,
            ) == SocketGenerationGate.Decision.IgnoreStale
        ) {
            return
        }
        state.reconnectJob?.cancel()
        state.reconnectJob = scope.launch {
            val normal = state.backoff.nextDelayMs()
            val delayMs = RemoteSocketDecisions.reconnectDelayMs(unauthorized, normal)
            delay(delayMs)
            if (!isActive || state.stopped.get() || state.suspended.get()) return@launch
            if (state.generationGate.decision(
                    gen,
                    SocketGenerationGate.CallbackKind.ScheduleReconnectFire,
                ) == SocketGenerationGate.Decision.IgnoreStale
            ) {
                return@launch
            }
            if (state.socketRef.get() != null) {
                state.tearDownSocket()
            }
            connect()
        }
        @Suppress("UNUSED_VARIABLE")
        val ignored = reason
    }

    private suspend fun connect() {
        if (state.stopped.get() || state.suspended.get() || state.sessionExpired.get()) return
        if (!networkGate.isOpen) return
        val gen = state.generationGate.invalidate()
        state.tearDownSocket()
        state.readyReceived.set(false)
        state.publish(RemoteWebSocketClient.ConnectionState.Connecting)

        try {
            val ticket = api.websocketTicket()
            if (!state.generationGate.isCurrent(gen) ||
                state.stopped.get() ||
                state.suspended.get() ||
                state.sessionExpired.get() ||
                !networkGate.isOpen
            ) {
                return
            }

            val lastSeen = RemoteSocketDecisions.lastSeenSeqForConnect(
                appliedSeq = state.cursor.appliedSeq,
                snapshotSucceeded = state.snapshotSucceeded.get(),
            )
            val url = api.websocketUrl(
                ticket = ticket,
                lastSeenSeq = lastSeen,
                threadItemInterests = state.threadItemInterests.get(),
            )

            val request = Request.Builder().url(url).build()
            // Register cancellable placeholder BEFORE newWebSocket to close the
            // post-ticket foreground race: background cancel hits the placeholder.
            val placeholder = networkGate.registerSocketPlaceholder()
            if (placeholder.isCancelled || !networkGate.isOpen) {
                placeholder.cancel()
                return
            }

            val listener = object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    when (RemoteSocketDecisions.onOpenAction(state.generationGate.isCurrent(gen))) {
                        RemoteSocketDecisions.OpenAction.CancelStale -> {
                            webSocket.cancel()
                            return
                        }
                        RemoteSocketDecisions.OpenAction.StayConnecting -> {
                            synchronized(state.socketLock) {
                                if (state.generationGate.isCurrent(gen) &&
                                    state.failedGeneration.get() != gen &&
                                    networkGate.isOpen
                                ) {
                                    state.socketRef.set(webSocket)
                                } else {
                                    webSocket.cancel()
                                }
                            }
                        }
                    }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (!state.generationGate.isCurrent(gen)) return
                    frameRouter.handleText(text, gen)
                }

                override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                    if (!state.generationGate.isCurrent(gen)) return
                    frameRouter.handleText(bytes.utf8(), gen)
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    placeholder.release(webSocket)
                    state.markSocketTerminal(webSocket, gen)
                    when (
                        RemoteSocketDecisions.onCloseAction(
                            generationMatches = state.generationGate.isCurrent(gen),
                            stopped = state.stopped.get(),
                            suspended = state.suspended.get(),
                            code = code,
                            reason = reason,
                        )
                    ) {
                        RemoteSocketDecisions.CloseAction.Ignore -> Unit
                        RemoteSocketDecisions.CloseAction.SessionExpired ->
                            handleSessionExpired(
                                reason.ifEmpty { RemoteSocketPolicy.SESSION_EXPIRED_REASON },
                            )
                        RemoteSocketDecisions.CloseAction.Reconnect -> {
                            if (!RemoteSocketDecisions.shouldPublishOrReconnect(
                                    generationMatches = state.generationGate.isCurrent(gen),
                                    stopped = state.stopped.get(),
                                    suspended = state.suspended.get(),
                                )
                            ) {
                                return
                            }
                            state.tearDownSocket()
                            scheduleReconnect("closed $code", unauthorized = false, gen = gen)
                        }
                    }
                }

                override fun onFailure(
                    webSocket: WebSocket,
                    t: Throwable,
                    response: Response?,
                ) {
                    placeholder.release(webSocket)
                    state.markSocketTerminal(webSocket, gen)
                    val reason = t.message.orEmpty()
                    when (
                        RemoteSocketDecisions.onFailureAction(
                            generationMatches = state.generationGate.isCurrent(gen),
                            stopped = state.stopped.get(),
                            suspended = state.suspended.get(),
                            closeCode = response?.code,
                            reason = reason,
                        )
                    ) {
                        RemoteSocketDecisions.CloseAction.Ignore -> Unit
                        RemoteSocketDecisions.CloseAction.SessionExpired ->
                            handleSessionExpired(
                                if (reason.contains(RemoteSocketPolicy.SESSION_EXPIRED_REASON)) {
                                    RemoteSocketPolicy.SESSION_EXPIRED_REASON
                                } else {
                                    reason.ifEmpty { RemoteSocketPolicy.SESSION_EXPIRED_REASON }
                                },
                            )
                        RemoteSocketDecisions.CloseAction.Reconnect -> {
                            if (!RemoteSocketDecisions.shouldPublishOrReconnect(
                                    generationMatches = state.generationGate.isCurrent(gen),
                                    stopped = state.stopped.get(),
                                    suspended = state.suspended.get(),
                                )
                            ) {
                                return
                            }
                            state.tearDownSocket()
                            state.publish(RemoteWebSocketClient.ConnectionState.Failed, t.message)
                            scheduleReconnect(
                                t.message ?: "failure",
                                unauthorized = false,
                                gen = gen,
                            )
                        }
                    }
                }
            }

            val socket = httpClient.newWebSocket(request, listener)
            if (!placeholder.installOrCancel(socket)) {
                return
            }

            val install = RemoteSocketDecisions.shouldInstallSocketAfterNewWebSocket(
                generationMatches = state.generationGate.isCurrent(gen),
                stopped = state.stopped.get(),
                suspended = state.suspended.get(),
                alreadyFailedThisGeneration = state.failedGeneration.get() == gen,
            )
            if (!install || !networkGate.isOpen) {
                placeholder.cancel()
                return
            }
            synchronized(state.socketLock) {
                if (state.generationGate.isCurrent(gen) && state.failedGeneration.get() != gen) {
                    state.socketRef.compareAndSet(null, socket)
                    state.connectTimeoutJob?.cancel()
                    state.connectTimeoutJob = scope.launch {
                        delay(RemoteSocketPolicy.CONNECT_TIMEOUT_MS)
                        if (state.generationGate.decision(
                                gen,
                                SocketGenerationGate.CallbackKind.ConnectTimeout,
                            ) == SocketGenerationGate.Decision.IgnoreStale
                        ) {
                            return@launch
                        }
                        val current = state.socketRef.get()
                        if (RemoteSocketDecisions.shouldForceConnectTimeout(
                                generationMatches = state.generationGate.isCurrent(gen),
                                readyReceived = state.readyReceived.get(),
                                stopped = state.stopped.get(),
                                suspended = state.suspended.get(),
                                isCurrentSocket = current === socket || current == null,
                            )
                        ) {
                            forceReconnect("connect timeout")
                        }
                    }
                } else {
                    placeholder.cancel()
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (!state.generationGate.isCurrent(gen)) return
            val unauthorized = e is RemoteClientException && e.isUnauthorized
            if (unauthorized) {
                handleSessionExpired(RemoteSocketPolicy.SESSION_EXPIRED_REASON)
            } else {
                state.publish(RemoteWebSocketClient.ConnectionState.Failed, e.message)
                scheduleReconnect(e.message ?: "connect failed", unauthorized = false, gen = gen)
            }
        }
    }
}

// Local import for CancellationException used above.
private typealias CancellationException = kotlinx.coroutines.CancellationException
