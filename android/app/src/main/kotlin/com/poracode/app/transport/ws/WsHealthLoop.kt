package com.poracode.app.transport.ws

import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.app.protocol.RemoteSocketDecisions
import com.poracode.app.protocol.RemoteSocketPolicy
import com.poracode.app.protocol.ThreadItemInterestDecisions
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.WebSocket

/** Health pings after ready + interest flush helpers. */
class WsHealthLoop(
    private val state: WsClientState,
    private val scope: CoroutineScope,
    private val forceReconnect: (String) -> Unit,
) {
    fun markReadyAndGoOnline(gen: Int) {
        if (!state.generationGate.isCurrent(gen)) return
        val socket = state.socketRef.get() ?: return
        if (!state.readyReceived.compareAndSet(false, true)) {
            if (ThreadItemInterestDecisions.shouldFlushInterestsOnReady() &&
                state.generationGate.isCurrent(gen)
            ) {
                sendThreadItemInterests(state.threadItemInterests.get())
                sendGitInterests(state.gitInterests.get())
            }
            return
        }
        state.connectTimeoutJob?.cancel()
        state.connectTimeoutJob = null
        state.backoff.reset()
        if (state.socketRef.get() !== socket || !state.generationGate.isCurrent(gen)) {
            state.readyReceived.set(false)
            return
        }
        state.publish(com.poracode.app.transport.RemoteWebSocketClient.ConnectionState.Online)
        if (ThreadItemInterestDecisions.shouldFlushInterestsOnReady()) {
            sendThreadItemInterests(state.threadItemInterests.get())
            sendGitInterests(state.gitInterests.get())
        }
        if (RemoteSocketDecisions.shouldStartHealth(
                readyReceived = true,
                generationMatches = state.generationGate.isCurrent(gen),
            )
        ) {
            startHealthLoop(socket, gen)
        }
    }

    fun sendThreadItemInterests(threadIds: List<String>) {
        val socket = state.socketRef.get() ?: return
        if (!state.readyReceived.get()) return
        val payload = GeneratedRemoteV3Contract.websocketClientMessage(
            buildJsonObject {
                put("type", ThreadItemInterestDecisions.MESSAGE_TYPE)
                putJsonArray(threadIds)
            }.toString(),
        )
        socket.send(payload)
    }

    /**
     * Flush latest Git interests on the same authenticated socket under the same
     * generation gate. No second socket, no retry loop: a stale generation is
     * dropped before send.
     */
    fun sendGitInterests(interests: List<com.poracode.app.protocol.git.GitInterest>) {
        val socket = state.socketRef.get() ?: return
        if (!state.readyReceived.get()) return
        val payload = GeneratedRemoteV3Contract.websocketClientMessage(
            buildJsonObject {
                put("type", WsGitInterestEncoder.MESSAGE_TYPE)
                put("interests", WsGitInterestEncoder.encode(interests))
            }.toString(),
        )
        socket.send(payload)
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.putJsonArray(threadIds: List<String>) {
        put(
            "threadIds",
            kotlinx.serialization.json.buildJsonArray {
                threadIds.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) }
            },
        )
    }

    private fun startHealthLoop(socket: WebSocket, gen: Int) {
        state.healthJob?.cancel()
        state.healthJob = scope.launch {
            while (isActive &&
                state.generationGate.isCurrent(gen) &&
                !state.stopped.get() &&
                !state.suspended.get() &&
                state.readyReceived.get()
            ) {
                delay(RemoteSocketPolicy.HEALTH_PING_INTERVAL_MS)
                if (!state.generationGate.isCurrent(gen) ||
                    state.socketRef.get() !== socket ||
                    !state.readyReceived.get()
                ) {
                    return@launch
                }
                if (state.pendingPingId.get() != null) {
                    forceReconnect("health ping timeout")
                    return@launch
                }
                val id = UUID.randomUUID().toString()
                state.pendingPingId.set(id)
                val payload = GeneratedRemoteV3Contract.websocketClientMessage(
                    buildJsonObject {
                        put("type", "ping")
                        put("id", id)
                        put("sentAt", System.currentTimeMillis().toDouble())
                    }.toString(),
                )
                if (!socket.send(payload)) {
                    forceReconnect("ping send failed")
                    return@launch
                }
                delay(RemoteSocketPolicy.HEALTH_PING_TIMEOUT_MS)
                if (state.generationGate.isCurrent(gen) && state.pendingPingId.get() == id) {
                    state.pendingPingId.set(null)
                    forceReconnect("health ping timeout")
                    return@launch
                }
            }
        }
    }
}
