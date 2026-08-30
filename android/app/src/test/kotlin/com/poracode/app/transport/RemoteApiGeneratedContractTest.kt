package com.poracode.app.transport

import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteApiGeneratedContractTest {
    @Test
    fun representativeCanonicalRoutesUseSharedFixtures() = runBlocking {
        val server = MockWebServer()
        val history = RemoteJson.parseToJsonElement(readFixture("thread-history.json")).jsonObject
        server.enqueue(MockResponse().setBody(readFixture("environment.json")))
        server.enqueue(MockResponse().setBody(readFixture("shell-snapshot.json")))
        server.enqueue(MockResponse().setBody(readFixture("thread-history.json")))
        server.enqueue(
            MockResponse().setBody(
                buildJsonObject {
                    put("items", history["runtimeItems"]!!.jsonArray)
                    put("nextCursor", history["runtimeNextCursor"]!!)
                }.toString(),
            ),
        )
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        server.start()
        try {
            val client = RemoteApiClient(
                endpoint = server.url("/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient(),
            )
            assertEquals(8, client.environment().protocolVersion)
            assertEquals(42, client.snapshot().snapshotSeq)
            assertEquals(
                "thread-fixture-001",
                client.threadHistory("thread/id", 50).thread.id,
            )
            assertEquals(
                1,
                client.threadRuntimeItemsPage("thread/id", 10, 75, 20).items.size,
            )
            client.sendThreadInput("thread/id", "hello", ThreadConfig())

            assertEquals(
                "/base/.well-known/poracode/environment",
                server.takeRequest().requestUrl!!.encodedPath,
            )
            assertEquals("/base/api/snapshot", server.takeRequest().requestUrl!!.encodedPath)
            val historyRequest = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread%2Fid/history",
                historyRequest.requestUrl!!.encodedPath,
            )
            assertEquals("1", historyRequest.requestUrl!!.queryParameter("runtimePage"))
            assertEquals("50", historyRequest.requestUrl!!.queryParameter("targetTimelineEntryCount"))
            val itemsRequest = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread%2Fid/history/items",
                itemsRequest.requestUrl!!.encodedPath,
            )
            assertEquals("75", itemsRequest.requestUrl!!.queryParameter("limit"))
            assertEquals("10", itemsRequest.requestUrl!!.queryParameter("beforePosition"))
            assertEquals(
                "20",
                itemsRequest.requestUrl!!.queryParameter("targetTimelineEntryCount"),
            )
            val sendRequest = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread%2Fid/send",
                sendRequest.requestUrl!!.encodedPath,
            )
            val sendBody = JSONObject(sendRequest.body.readUtf8())
            assertEquals("hello", sendBody.getString("prompt"))
            assertTrue(sendBody.getJSONObject("config").has("model"))
        } finally {
            server.shutdown()
        }
    }

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }
}
