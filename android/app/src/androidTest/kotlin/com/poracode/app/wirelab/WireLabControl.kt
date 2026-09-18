package com.poracode.app.wirelab

import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Control-plane client for the authenticated loopback native wire lab.
 *
 * Speaks the Harness capability scheme to read secret-free scenario state and to
 * drive allowlisted scenario actions / frame fixtures. It is test-orchestration
 * only: it never logs the capability, pairing tokens, access tokens, or tickets,
 * and the lab state it returns is asserted secret-free server-side as well.
 *
 * The production app talks to the lab independently through its real
 * [com.poracode.app.transport.RemoteApiClient] / [com.poracode.app.transport.RemoteWebSocketClient];
 * this client only observes and steers the lab so the journey can journal and
 * assert exact observed HTTP/WS operations. OkHttp (already on the app classpath)
 * is used because it tolerates adb-reverse connection churn transparently, unlike
 * HttpURLConnection whose pooled sockets surface EOFException mid-journey.
 */
class WireLabControl(controlBaseUrl: String, private val capability: String) {
    private val controlBaseUrl: String = controlBaseUrl.trimEnd('/')
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(40, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    fun state(): JSONObject = get("/v1/scenario/state")

    fun reset(): JSONObject = action(JSONObject().put("type", "reset"))

    fun pairingUrl(hostId: String? = null): JSONObject =
        action(JSONObject().put("type", "pairing-url").also { b ->
            if (hostId != null) b.put("hostId", hostId)
        })

    fun seedMultihostCollision(): JSONObject =
        action(JSONObject().put("type", "seed-multihost-collision"))

    fun emitCanonicalReplay(hostId: String? = null, threadId: String? = null): JSONObject =
        action(JSONObject().put("type", "emit-canonical-replay").also { b ->
            if (hostId != null) b.put("hostId", hostId)
            if (threadId != null) b.put("threadId", threadId)
        })

    fun declareObservations(operationIds: List<String>): JSONObject =
        action(
            JSONObject()
                .put("type", "declare-observations")
                .put("operationIds", JSONArray(operationIds)),
        )

    fun activateFault(fixtureId: String): JSONObject =
        action(JSONObject().put("type", "activate-fault").put("fixtureId", fixtureId))

    fun clearFaults(): JSONObject = action(JSONObject().put("type", "clear-faults"))

    /** Broadcasts the allowlisted [fixtureId] frame (e.g. `resync-required`) over live sockets. */
    fun emitFrame(fixtureId: String): JSONObject =
        post("/v1/frames/${encode(fixtureId)}", null, retryTransport = false)

    /**
     * Deterministic wait for [condition]. Throws [AwaitTimeoutException] on the lab's
     * 408 so callers distinguish a genuine timeout from a transport failure. This is the
     * preferred synchronization seam — no client-side sleeps.
     */
    fun await(condition: JSONObject, timeoutMs: Long): JSONObject =
        try {
            action(
                JSONObject()
                    .put("type", "await")
                    .put("condition", condition)
                    .put("timeoutMs", timeoutMs),
            )
        } catch (e: LabStatusException) {
            if (e.status == 408) throw AwaitTimeoutException(condition.toString())
            throw e
        }

    /**
     * Polls the secret-free scenario state with short round-trips until every
     * [operationIds] is observed by the lab or [timeoutMs] elapses.
     *
     * `adb reverse` tears down control connections held open for many seconds (the
     * server-side `await` seam), so over the loopback lab this short-poll of the
     * authoritative observation journal is the reliable deterministic wait: each
     * request is sub-second, the bound is [timeoutMs], and no fixed sleep is used.
     */
    fun waitUntilObserved(operationIds: List<String>, timeoutMs: Long = 20_000) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val observed = observedOperationIds()
            if (operationIds.all { it in observed }) return
            try {
                Thread.sleep(POLL_INTERVAL_MS)
            } catch (ie: InterruptedException) {
                Thread.currentThread().interrupt()
                throw AwaitTimeoutException("interrupted waiting for $operationIds")
            }
        }
        throw AwaitTimeoutException(
            "operations not observed within ${timeoutMs}ms: wanted=$operationIds have=${observedOperationIds()}",
        )
    }

    fun waitUntilOperationCount(
        hostId: String,
        operationId: String,
        minimumCount: Int,
        timeoutMs: Long = 20_000,
    ) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (operationCount(hostId, operationId) >= minimumCount) return
            try {
                Thread.sleep(POLL_INTERVAL_MS)
            } catch (ie: InterruptedException) {
                Thread.currentThread().interrupt()
                throw AwaitTimeoutException("interrupted waiting for $operationId")
            }
        }
        throw AwaitTimeoutException(
            "operation count not reached within ${timeoutMs}ms: " +
                "host=$hostId operation=$operationId minimum=$minimumCount " +
                "actual=${operationCount(hostId, operationId)}",
        )
    }

    fun observedOperationIds(state: JSONObject = state()): List<String> =
        state.optJSONArray("observedOperationIds")?.toStringList() ?: emptyList()

    fun hostObserved(hostId: String): List<String> =
        state().optJSONArray("hosts")?.objects()?.firstOrNull { it.optString("hostId") == hostId }
            ?.optJSONArray("observedOperationIds")?.toStringList() ?: emptyList()

    fun operationCount(hostId: String, operationId: String, state: JSONObject = state()): Int =
        host(state, hostId).optJSONArray("operationJournal")?.objects()
            ?.count { it.optString("operationId") == operationId } ?: 0

    fun operationLastSeenSeqs(
        hostId: String,
        operationId: String,
        state: JSONObject = state(),
    ): List<Int?> = host(state, hostId).optJSONArray("operationJournal")?.objects()
        ?.filter { it.optString("operationId") == operationId }
        ?.map { entry ->
            if (entry.isNull("lastSeenSeq") || !entry.has("lastSeenSeq")) null
            else entry.getInt("lastSeenSeq")
        } ?: emptyList()

    private fun host(state: JSONObject, hostId: String): JSONObject =
        state.optJSONArray("hosts")?.objects()?.firstOrNull { it.optString("hostId") == hostId }
            ?: error("wire-lab host not found: $hostId")

    private fun get(path: String): JSONObject = request("GET", path, null, retryTransport = true)

    private fun action(body: JSONObject): JSONObject = post(
        "/v1/scenario/actions",
        body.apply {
            if (!has("requestId")) put("requestId", UUID.randomUUID().toString())
        },
        retryTransport = true,
    )

    private fun post(
        path: String,
        body: JSONObject?,
        retryTransport: Boolean = true,
    ): JSONObject = request("POST", path, body, retryTransport)

    private fun request(
        method: String,
        path: String,
        body: JSONObject?,
        retryTransport: Boolean,
    ): JSONObject {
        val upper = method.uppercase()
        // adb reverse can silently drop a control connection. Reads and scenario actions carrying
        // a stable requestId are safe to retry; frame emission is deliberately single-attempt.
        var lastError: IOException? = null
        val maxAttempts = if (retryTransport) MAX_REQUEST_ATTEMPTS else 0
        for (attempt in 0..maxAttempts) {
            try {
                return doRequest(upper, path, body)
            } catch (e: IOException) {
                lastError = e
                if (attempt < maxAttempts) {
                    try {
                        Thread.sleep((200L * (attempt + 1)))
                    } catch (ie: InterruptedException) {
                        Thread.currentThread().interrupt()
                        throw AwaitTimeoutException("interrupted")
                    }
                }
            }
        }
        throw lastError!!
    }

    private fun doRequest(upper: String, path: String, body: JSONObject?): JSONObject {
        val builder = Request.Builder()
            .url(controlBaseUrl + path)
            .header("Authorization", "Harness $capability")
            .header("Connection", "close")
        val rb: RequestBody? = when {
            body != null -> {
                builder.header("Content-Type", "application/json")
                body.toString().toRequestBody(JSON)
            }
            upper == "POST" || upper == "PUT" || upper == "PATCH" -> EMPTY
            else -> null
        }
        val request = builder.method(upper, rb).build()
        client.newCall(request).execute().use { response ->
            val text = response.body?.string() ?: ""
            if (response.code in 200..299) {
                return JSONObject(text.ifEmpty { "{}" })
            }
            // Never include the capability in thrown messages; surface only status + safe body.
            throw LabStatusException(response.code, text)
        }
    }

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    companion object {
        private const val POLL_INTERVAL_MS = 150L
        private const val MAX_REQUEST_ATTEMPTS = 5
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val EMPTY: RequestBody = ByteArray(0).toRequestBody(JSON)
    }
}

class AwaitTimeoutException(message: String) : IOException("scenario await timed out: $message")

class LabStatusException(val status: Int, val body: String) :
    IOException("lab status $status")

private fun JSONArray.toStringList(): List<String> = List(length()) { optString(it) }

private fun JSONArray.objects(): List<JSONObject> = List(length()) { optJSONObject(it) }
