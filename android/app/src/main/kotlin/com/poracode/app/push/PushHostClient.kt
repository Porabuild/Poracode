package com.poracode.app.push

import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.protocol.CleartextPolicy
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.app.transport.TlsCertPin
import com.poracode.app.transport.environments.EnvironmentProtocol
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

sealed interface PushHttpResult {
    data class Success(val routingVersionEcho: Int?) : PushHttpResult
    data object AuthFailure : PushHttpResult
    data object TransientFailure : PushHttpResult
    data object InvalidResponse : PushHttpResult
}

interface PushHostGateway {
    suspend fun routingVersions(): List<Int>?
    suspend fun register(body: PushRegistrationBody): PushHttpResult
    suspend fun unregister(body: PushUnregisterBody): PushHttpResult
}

/**
 * Live parent authority for an environment record's push client (A3). The push
 * stack has its own OkHttp client, so it resolves the parent token explicitly
 * rather than through [com.poracode.app.transport.environments.EnvironmentAuthorityStore]:
 * registration reads it live from the parent record, and bounded outbox cleanup
 * reads the encrypted entry snapshot after the records are gone.
 */
fun interface PushParentAuthority {
    suspend fun parentAccessToken(): String?
}

fun interface PushHostGatewayFactory {
    fun create(
        endpoint: String,
        accessToken: String,
        parentAuthority: PushParentAuthority?,
    ): PushHostGateway
}

class PushHostClient(
    private val endpoint: String,
    private val accessToken: String,
    private val client: OkHttpClient = DEFAULT_CLIENT,
    /**
     * Present for environment records. A proxy endpoint without one never dials:
     * the child bearer must not reach the parent proxy alone, and a missing
     * parent token fails closed before the request is sent.
     */
    private val parentAuthority: PushParentAuthority? = null,
) : PushHostGateway {
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }

    override suspend fun routingVersions(): List<Int>? {
        val result = request("/.well-known/poracode/environment", "GET", null)
        val raw = (result as? RawResult.Success)?.body ?: return null
        val canonical = runCatching {
            GeneratedRemoteV3Contract.environmentResponse(raw, legacy = false)
        }.getOrNull() ?: return null
        return PushCapabilityParser.routingVersions(canonical)
    }

    override suspend fun register(body: PushRegistrationBody): PushHttpResult {
        val requestBody = runCatching {
            GeneratedRemoteV3Contract.pushRegisterRequest(json.encodeToString(body))
        }.getOrNull() ?: return PushHttpResult.InvalidResponse
        return mapWriteResult(
            request("/api/push/register", "POST", requestBody),
            GeneratedRemoteV3Contract::pushRegisterResponse,
        )
    }

    override suspend fun unregister(body: PushUnregisterBody): PushHttpResult {
        val requestBody = runCatching {
            GeneratedRemoteV3Contract.pushUnregisterRequest(json.encodeToString(body))
        }.getOrNull() ?: return PushHttpResult.InvalidResponse
        return mapWriteResult(
            request("/api/push/unregister", "POST", requestBody),
            GeneratedRemoteV3Contract::pushUnregisterResponse,
        )
    }

    private fun mapWriteResult(
        result: RawResult,
        canonicalize: (String) -> String,
    ): PushHttpResult = when (result) {
        RawResult.AuthFailure -> PushHttpResult.AuthFailure
        RawResult.Failure -> PushHttpResult.TransientFailure
        is RawResult.Success -> runCatching {
            val root = json.parseToJsonElement(canonicalize(result.body)).jsonObject
            if (root["ok"]?.jsonPrimitive?.content != "true") {
                PushHttpResult.InvalidResponse
            } else {
                val echo = (root["routing"] as? JsonObject)
                    ?.get("version")?.jsonPrimitive?.intOrNull
                PushHttpResult.Success(echo)
            }
        }.getOrDefault(PushHttpResult.InvalidResponse)
    }

    private suspend fun request(path: String, method: String, body: String?): RawResult {
        val base = endpoint.toHttpUrl().newBuilder().query(null).fragment(null).build()
        val basePath = base.encodedPath.let { current ->
            when {
                current.isEmpty() -> "/"
                current.endsWith('/') -> current
                else -> "$current/"
            }
        }
        val url = base.newBuilder().encodedPath(basePath + path.trimStart('/')).build()
        CleartextPolicy.enforce(url.toString())
        val parentHeader = when {
            parentAuthority != null -> {
                val parentToken = parentAuthority.parentAccessToken()
                    ?.takeIf(String::isNotBlank)
                    ?: return RawResult.AuthFailure
                "Bearer $parentToken"
            }
            EnvironmentEndpoints.isProxyEndpoint(endpoint) -> return RawResult.AuthFailure
            else -> null
        }
        val requestBuilder = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $accessToken")
        if (parentHeader != null) {
            requestBuilder.header(EnvironmentProtocol.AUTHORIZATION_HEADER, parentHeader)
        }
        val request = requestBuilder
            .method(method, body?.toRequestBody(JSON_MEDIA))
            .build()
        return suspendCancellableCoroutine { continuation ->
            val call = clientForRequest().newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resume(RawResult.Failure)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!continuation.isActive) return
                        val result = when {
                            it.code == 401 || it.code == 403 -> RawResult.AuthFailure
                            !it.isSuccessful -> RawResult.Failure
                            else -> {
                                val body = it.body
                                val length = body?.contentLength() ?: 0
                                if (length > MAX_RESPONSE_BYTES) RawResult.Failure else {
                                    val source = body?.source()
                                    source?.request(MAX_RESPONSE_BYTES + 1)
                                    val buffer = source?.buffer
                                    if ((buffer?.size ?: 0) > MAX_RESPONSE_BYTES) {
                                        RawResult.Failure
                                    } else {
                                        RawResult.Success(buffer?.clone()?.readUtf8().orEmpty())
                                    }
                                }
                            }
                        }
                        continuation.resume(result)
                    }
                }
            })
        }
    }

    private sealed interface RawResult {
        data class Success(val body: String) : RawResult
        data object AuthFailure : RawResult
        data object Failure : RawResult
    }

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
        private const val MAX_RESPONSE_BYTES = 64L * 1024L
        internal val DEFAULT_CLIENT = OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .writeTimeout(12, TimeUnit.SECONDS)
            .callTimeout(12, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build()
    }

    private fun clientForRequest(): OkHttpClient = TlsCertPin.clientForEndpoint(endpoint, client)
}
