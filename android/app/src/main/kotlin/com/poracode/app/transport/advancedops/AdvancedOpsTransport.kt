package com.poracode.app.transport.advancedops

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.AdvancedOpsContract
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient

fun interface AdvancedTextRequest {
    suspend fun execute(
        path: String,
        method: String,
        jsonBody: String,
        expectedStatus: Int,
    ): String
}

fun interface AdvancedOpsTransport {
    /** Exactly one HTTP attempt. Retry and mutation policy belong above this boundary. */
    suspend fun call(operation: AdvancedOperation, payload: JsonObject): JsonElement
}

/** Uses RemoteApiClient so foreground gating, bounds, redirect denial and cancellation stay shared. */
class RemoteAdvancedOpsTransport internal constructor(
    private val request: AdvancedTextRequest,
) : AdvancedOpsTransport {
    constructor(
        endpoint: String,
        accessToken: String,
        client: OkHttpClient = RemoteApiClient.defaultClient(),
        networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    ) : this(
        RemoteApiClient(endpoint, accessToken, client, networkGate = networkGate).let { http ->
            AdvancedTextRequest { path, method, body, status ->
                http.requestText(
                    path = path,
                    method = method,
                    jsonBody = body,
                    expectedStatus = status,
                )
            }
        },
    )

    override suspend fun call(
        operation: AdvancedOperation,
        payload: JsonObject,
    ): JsonElement {
        val route = AdvancedOpsContract.route()
        val body = try {
            AdvancedOpsContract.request(operation, payload)
        } catch (error: RemoteClientException) {
            throw AdvancedTransportException.invalidRequest(error)
        }
        val raw = try {
            withTimeout(operation.timeoutMs) {
                request.execute(route.path, route.method, body, route.expectedStatus)
            }
        } catch (_: TimeoutCancellationException) {
            throw AdvancedTransportException.timeout()
        } catch (error: CancellationException) {
            throw error
        } catch (error: RemoteClientException) {
            throw AdvancedTransportException.remote(error)
        } catch (_: Exception) {
            throw AdvancedTransportException.unavailable()
        }
        return try {
            AdvancedOpsContract.result(operation, raw)
        } catch (error: RemoteClientException) {
            throw AdvancedTransportException.malformed(error)
        }
    }
}
