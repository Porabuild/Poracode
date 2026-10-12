package com.poracode.app.transport

import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.app.transport.richchat.ThreadSteerInput
import com.poracode.app.transport.richchat.toPayload
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * v9 outbound wire fidelity: send/steer/start bodies must carry the pinned
 * `executionEnvironment` unchanged — including through the generated v9 codec
 * canonicalization that sits in front of every config-carrying mutation.
 */
class ThreadConfigOutboundWireTest {
    private fun readConfigFixture(): String {
        val stream = javaClass.classLoader!!.getResourceAsStream(
            "fixtures/thread-config-execution-environment.json",
        ) ?: error("Missing fixture fixtures/thread-config-execution-environment.json")
        return stream.bufferedReader().use { it.readText() }
    }

    private fun pinnedConfig(): ThreadConfig =
        RemoteJson.decodeFromString(ThreadConfig.serializer(), readConfigFixture())

    @Test
    fun generatedSendRequestCodecPreservesExecutionEnvironment() {
        val body = buildString {
            append("""{"prompt":"hello","config":""")
            append(readConfigFixture())
            append("}")
        }
        val canonical = GeneratedRemoteV3Contract.threadSendRequest(body)
        // The codec may canonicalize field order, so assert structurally; the distro must
        // survive verbatim in the emitted wire text.
        assertTrue(
            "generated v9 codec must keep the pinned distro: $canonical",
            canonical.contains("Ubuntu-22.04"),
        )
        val canonicalObject = RemoteJson.parseToJsonElement(canonical).jsonObject
        val config = pinnedConfig()
        assertEquals(config.toJsonObject(), canonicalObject["config"]!!.jsonObject)
    }

    @Test
    fun sendThreadInputCarriesPinnedEnvironmentOverWire() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        server.start()
        try {
            val client = RemoteApiClient(
                endpoint = server.url("/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient(),
            )
            val config = pinnedConfig()
            client.sendThreadInput("thread/id", "hello", config)

            val request = server.takeRequest()
            assertEquals("/base/api/threads/thread%2Fid/send", request.requestUrl!!.encodedPath)
            val body = JSONObject(request.body.readUtf8())
            val environment = body.getJSONObject("config").getJSONObject("executionEnvironment")
            assertEquals("wsl", environment.getString("kind"))
            assertEquals("Ubuntu-22.04", environment.getString("distro"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun steerPayloadCarriesPinnedEnvironment() {
        val config = pinnedConfig()
        val payload = ThreadSteerInput(
            prompt = "hello",
            config = config.toJsonObject(),
        ).toPayload()
        val payloadString = payload.toString()
        assertTrue(
            "steer payload must re-emit the pinned distro: $payloadString",
            payloadString.contains(""""executionEnvironment":{"kind":"wsl","distro":"Ubuntu-22.04"}"""),
        )
        assertEquals(config.toJsonObject(), payload["config"])
    }
}
