package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteWebSocketServerMessage
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GeneratedRemoteV3ContractTest {
    @Test
    fun canonicalResponsesApplyUnknownPolicyAndDefaults() {
        val environment = parseObject(
            GeneratedRemoteV3Contract.environmentResponse(
                readFixture("environment-forward-compatible.json"),
                legacy = false,
            ),
        )
        assertFalse(environment.containsKey("futureCapability"))
        assertFalse(environment["auth"]!!.jsonObject.containsKey("futureAuthMetadata"))

        val snapshot = parseObject(
            GeneratedRemoteV3Contract.shellSnapshotResponse(readFixture("shell-snapshot.json")),
        )
        val thread = snapshot["threads"]!!.jsonArray.first().jsonObject
        assertEquals("false", thread["archived"]!!.jsonPrimitive.content)
        assertEquals("false", thread["canResumeWithConfig"]!!.jsonPrimitive.content)
        assertEquals("false", thread["done"]!!.jsonPrimitive.content)
        assertEquals("false", thread["starred"]!!.jsonPrimitive.content)

        val history = parseObject(
            GeneratedRemoteV3Contract.threadHistoryResponse(readFixture("thread-history.json")),
        )
        assertEquals(42, history["snapshotSeq"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun canonicalRequestsValidateRoutesAndApplyPushTransform() {
        val history = GeneratedRemoteV3Contract.threadHistoryRoute("thread/id", 50)
        assertEquals("thread/id", history.threadId)
        assertEquals(
            listOf("runtimePage" to "1", "targetTimelineEntryCount" to "50"),
            history.query,
        )
        val items = GeneratedRemoteV3Contract.historyItemsRoute("thread/id", 20, 75, 10)
        assertEquals(
            listOf(
                "limit" to "75",
                "beforePosition" to "20",
                "targetTimelineEntryCount" to "10",
            ),
            items.query,
        )

        val send = parseObject(
            GeneratedRemoteV3Contract.threadSendRequest(
                """{"prompt":"hello","config":{"model":"default"},"future":true}""",
            ),
        )
        assertFalse(send.containsKey("future"))
        assertEquals("hello", send["prompt"]!!.jsonPrimitive.content)

        val push = parseObject(
            GeneratedRemoteV3Contract.pushRegisterRequest(
                """{"deviceId":"device-123","platform":"android","deviceToken":"secret","routing":{"version":1,"clientConnectionId":"BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB","desktopId":"desktop"}}""",
            ),
        )
        assertEquals(
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            push["routing"]!!.jsonObject["clientConnectionId"]!!.jsonPrimitive.content,
        )
        assertEquals(
            "lc_pair_fixture_001",
            parseObject(
                GeneratedRemoteV3Contract.tokenExchangeRequest(
                    readFixture("pairing-token-request.json"),
                ),
            )["credential"]!!.jsonPrimitive.content,
        )
    }

    @Test
    fun malformedKnownWebSocketIsRejectedButUnknownIsPreserved() {
        val malformedError = runCatching {
            RemoteWebSocketServerMessage.decode("""{"type":"ready","seq":"secret-token"}""")
        }.exceptionOrNull()
        if (malformedError !is RemoteClientException) {
            fail("Expected invalid known WebSocket envelope")
            return
        }
        val malformed = malformedError
        assertEquals("invalid_response", malformed.code)
        assertFalse(malformed.message.orEmpty().contains("secret-token"))

        val unknown = RemoteWebSocketServerMessage.decode(
            """{"type":"future-widget","payload":{"x":1}}""",
        )
        assertTrue(unknown is RemoteWebSocketServerMessage.Unknown)
        assertEquals(
            "future-widget",
            (unknown as RemoteWebSocketServerMessage.Unknown).type,
        )
    }

    @Test
    fun invalidResponseDoesNotLeakTokenPayload() {
        val secret = "access-secret-that-must-not-leak"
        val responseError = runCatching {
            GeneratedRemoteV3Contract.tokenExchangeResponse(
                """{"accessToken":"$secret","tokenType":"Bearer"}""",
            )
        }.exceptionOrNull()
        if (responseError !is RemoteClientException) {
            fail("Expected invalid token response")
            return
        }
        val error = responseError
        assertEquals("invalid_response", error.code)
        assertFalse(error.message.orEmpty().contains(secret))
    }

    private fun parseObject(raw: String): JsonObject =
        RemoteJson.parseToJsonElement(raw).jsonObject

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }
}
