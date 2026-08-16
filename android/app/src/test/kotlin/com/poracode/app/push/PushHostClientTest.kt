package com.poracode.app.push

import com.poracode.app.model.RemoteJson
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class PushHostClientTest {
    @Test
    fun capabilityAndExactRegistrationUseAuthenticatedBasePath() = runBlocking {
        val server = MockWebServer()
        val environment = RemoteJson.parseToJsonElement(readFixture("environment.json"))
            .jsonObject
        val environmentWithPush = buildJsonObject {
            environment.forEach { (name, value) -> put(name, value) }
            put(
                "capabilities",
                buildJsonObject {
                    put(
                        "pushRouting",
                        buildJsonObject {
                            put("versions", buildJsonArray { add(JsonPrimitive(1)) })
                        },
                    )
                },
            )
        }
        server.enqueue(MockResponse().setBody(environmentWithPush.toString()))
        server.enqueue(
            MockResponse().setBody("{\"ok\":true,\"routing\":{\"version\":1}}"),
        )
        server.enqueue(
            MockResponse().setBody("{\"ok\":true,\"routing\":{\"version\":1}}"),
        )
        server.start()
        try {
            val client = PushHostClient(server.url("/base").toString(), "access-secret")
            assertEquals(listOf(1), client.routingVersions())
            val result = client.register(registration())
            assertEquals(PushHttpResult.Success(1), result)
            val unregisterResult = client.unregister(
                PushUnregisterBody(
                    deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    routing = registration().routing,
                ),
            )
            assertEquals(PushHttpResult.Success(1), unregisterResult)
            val environment = server.takeRequest()
            val register = server.takeRequest()
            val unregister = server.takeRequest()
            assertEquals("/base/.well-known/poracode/environment", environment.path)
            assertEquals("/base/api/push/register", register.path)
            assertEquals("Bearer access-secret", register.getHeader("Authorization"))
            val body = JSONObject(register.body.readUtf8())
            assertEquals(
                setOf("deviceId", "platform", "deviceToken", "appVersion", "routing"),
                body.keys().asSequence().toSet(),
            )
            assertFalse(body.getJSONObject("routing").has("threadId"))
            assertEquals("/base/api/push/unregister", unregister.path)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun registrationDoesNotFollowBearerRedirect() = runBlocking {
        val origin = MockWebServer()
        val destination = MockWebServer()
        origin.start()
        destination.start()
        try {
            origin.enqueue(
                MockResponse().setResponseCode(302)
                    .setHeader("Location", destination.url("/capture")),
            )
            val client = PushHostClient(origin.url("/").toString(), "access-secret")
            assertEquals(PushHttpResult.TransientFailure, client.register(registration()))
            assertEquals(0, destination.requestCount)
        } finally {
            origin.shutdown()
            destination.shutdown()
        }
    }

    private fun registration() = PushRegistrationBody(
        deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        deviceToken = "fcm-secret",
        appVersion = "1.5.0",
        routing = PushRegistrationRouteV1(
            clientConnectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            desktopId = "desktop",
        ),
    )

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }
}
