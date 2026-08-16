package com.poracode.app.protocol.threads

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EThreadU2DCommandU2EPath
import com.poracode.remote.v3.generated.routeU2EThreadU2DCommandU2ERequest
import com.poracode.remote.v3.generated.routeU2EThreadU2DCommandU2EResponse
import com.poracode.remote.v3.generated.routeU2EThreadU2DStartU2DExistingU2ERequest
import com.poracode.remote.v3.generated.routeU2EThreadU2DStartU2DExistingU2EResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Stable, hash-free boundary over the generated remote-v3 thread lifecycle codecs. */
object GeneratedRemoteV3ThreadLifecycleContract {
    fun startExistingRequest(request: ExistingThreadStartRequest): String = requestCanonical(
        RemoteRootCodecs.routeU2EThreadU2DStartU2DExistingU2ERequest,
        request.wireObject().toString(),
    )

    fun startExistingResponse(raw: String): String = responseObject(
        RemoteRootCodecs.routeU2EThreadU2DStartU2DExistingU2EResponse,
        raw,
    ).requiredString("threadId")

    fun commandPath(threadId: String): String = requestObject(
        RemoteRootCodecs.routeU2EThreadU2DCommandU2EPath,
        buildJsonObject { put("threadId", threadId) }.toString(),
    ).requiredString("threadId")

    fun commandRequest(command: ThreadLifecycleCommand): String = requestCanonical(
        RemoteRootCodecs.routeU2EThreadU2DCommandU2ERequest,
        command.wireBody().toString(),
    )

    fun commandResponse(raw: String) {
        responseCanonical(RemoteRootCodecs.routeU2EThreadU2DCommandU2EResponse, raw)
    }

    private fun requestObject(codec: RemoteRootCodec<*>, raw: String): JsonObject =
        parseObject(requestCanonical(codec, raw), request = true)

    private fun responseObject(codec: RemoteRootCodec<*>, raw: String): JsonObject =
        parseObject(responseCanonical(codec, raw), request = false)

    private fun requestCanonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw ThreadLifecycleContractException(codec.id)
    }

    private fun responseCanonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalidResponse(codec.id)
    }

    private fun parseObject(raw: String, request: Boolean): JsonObject = try {
        Json.parseToJsonElement(raw) as? JsonObject
            ?: if (request) throw ThreadLifecycleContractException("object")
            else throw invalidResponse("object")
    } catch (error: ThreadLifecycleContractException) {
        throw error
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        if (request) throw ThreadLifecycleContractException("object")
        throw invalidResponse("object")
    }

    private fun JsonObject.requiredString(name: String): String =
        (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?: throw invalidResponse(name)

    private fun invalidResponse(boundary: String): RemoteClientException =
        RemoteClientException.invalidResponse(
            "Remote thread lifecycle response failed validation at $boundary.",
        )
}

class ThreadLifecycleContractException internal constructor(boundary: String) :
    IllegalArgumentException("Thread lifecycle request failed validation at $boundary.")
