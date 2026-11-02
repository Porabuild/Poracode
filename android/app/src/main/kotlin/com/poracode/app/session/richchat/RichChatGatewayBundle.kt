package com.poracode.app.session.richchat

import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.richchat.RichChatRemoteTransport
import com.poracode.app.transport.richchat.RichChatBinaryBodyExecutor
import kotlinx.serialization.json.JsonObject

fun interface RichThreadCommandTransport {
    suspend fun execute(threadId: String, command: JsonObject)
}

interface RichTerminalWatchTransport {
    suspend fun watch(request: RichTerminalWatchRequest)
    suspend fun unwatch(terminalId: String)
}

/** Supplied only by composition that disables HTTP automatic connection retries for mutations. */
enum class RichChatMutationDelivery {
    SingleAttempt,
    AutomaticRetryPossible,
}

data class RichChatGatewayBundle(
    val core: RemoteApiGateway,
    val rich: RichChatRemoteTransport,
    val mutationDelivery: RichChatMutationDelivery,
    val commands: RichThreadCommandTransport? = null,
    val terminalWatch: RichTerminalWatchTransport? = null,
    val binary: RichChatBinaryBodyExecutor? = null,
    /** Optional chat-file download transport; null on transports without it. */
    val files: com.poracode.app.transport.richchat.RichChatFileTransport? = null,
)

fun interface RichChatGatewayProvider {
    suspend fun bundleFor(lease: RichChatHostLease): RichChatGatewayBundle?
}

