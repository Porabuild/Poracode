package com.poracode.app.push

import com.poracode.app.model.RemoteJson
import com.poracode.app.transport.environments.EnvironmentProtocol
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * A3 client behavior for environment push endpoints: the parent grant travels
 * only in the reserved header beside the child bearer, and a proxy endpoint
 * without a parent authority fails closed before any dial (the old code sent a
 * bare child bearer and dropped the registration silently).
 */
class PushHostClientEnvironmentTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private val environmentId = "11111111-1111-4111-8111-111111111111"

    private fun proxyEndpoint(): String =
        server.url("/api/environments/$environmentId/proxy").toString().trimEnd('/')

    private fun environmentWithPushRouting(): String {
        val environment = RemoteJson.parseToJsonElement(readFixture("environment.json"))
            .jsonObject
        return buildJsonObject {
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
        }.toString()
    }

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }

    @Test
    fun routingAndRegistrationCarryBothAuthoritiesThroughTheProxy() = runBlocking {
        server.enqueue(MockResponse().setBody(environmentWithPushRouting()))
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"ok":true,"routing":{"version":1}}"""),
        )
        val client = PushHostClient(
            endpoint = proxyEndpoint(),
            accessToken = "child-token",
            parentAuthority = PushParentAuthority { "parent-token" },
        )

        assertEquals(listOf(1), client.routingVersions())
        assertEquals(
            PushHttpResult.Success(1),
            client.register(
                PushRegistrationBody(
                    deviceId = "11111111-1111-4111-8111-111111111111",
                    deviceToken = "fcm",
                    appVersion = "1.0.0",
                    routing = PushRegistrationRouteV1(
                        clientConnectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        desktopId = "child",
                    ),
                ),
            ),
        )

        repeat(2) {
            val recorded = server.takeRequest(2, TimeUnit.SECONDS)
            assertEquals("Bearer child-token", recorded?.getHeader("Authorization"))
            assertEquals(
                "Bearer parent-token",
                recorded?.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER),
            )
        }
    }

    @Test
    fun proxyEndpointWithoutParentAuthorityFailsClosedBeforeAnyDial() = runBlocking {
        val client = PushHostClient(endpoint = proxyEndpoint(), accessToken = "child-token")

        assertNull(client.routingVersions())
        assertEquals(
            PushHttpResult.AuthFailure,
            client.register(
                PushRegistrationBody(
                    deviceId = "11111111-1111-4111-8111-111111111111",
                    deviceToken = "fcm",
                    appVersion = "1.0.0",
                    routing = PushRegistrationRouteV1(
                        clientConnectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        desktopId = "child",
                    ),
                ),
            ),
        )
        assertEquals(0, server.requestCount)
    }

    @Test
    fun proxyEndpointWithMissingParentTokenFailsClosedBeforeAnyDial() = runBlocking {
        val client = PushHostClient(
            endpoint = proxyEndpoint(),
            accessToken = "child-token",
            parentAuthority = PushParentAuthority { null },
        )

        assertEquals(PushHttpResult.AuthFailure, client.unregister(
            PushUnregisterBody(
                deviceId = "11111111-1111-4111-8111-111111111111",
                routing = PushRegistrationRouteV1(
                    clientConnectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    desktopId = "child",
                ),
            ),
        ))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun proxy401And403BothSurfaceAsAuthFailureForCustodyRetention() = runBlocking {
        // The client reports both statuses as AuthFailure — including the
        // parent-marked auth-step 403 — and the coordinator decides retention
        // by entry custody, never by status.
        listOf(401, 403).forEach { status ->
            server.enqueue(
                MockResponse()
                    .setResponseCode(status)
                    .setHeader(EnvironmentProtocol.AUTH_AUTHORITY_HEADER, "parent")
                    .setBody("{}"),
            )
        }
        val client = PushHostClient(
            endpoint = proxyEndpoint(),
            accessToken = "child-token",
            parentAuthority = PushParentAuthority { "parent-token" },
        )
        val body = PushUnregisterBody(
            deviceId = "11111111-1111-4111-8111-111111111111",
            routing = PushRegistrationRouteV1(
                clientConnectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                desktopId = "child",
            ),
        )

        assertEquals(PushHttpResult.AuthFailure, client.unregister(body))
        assertEquals(PushHttpResult.AuthFailure, client.unregister(body))
        assertEquals(2, server.requestCount)
        repeat(2) {
            val recorded = server.takeRequest(2, TimeUnit.SECONDS)
            assertEquals("Bearer child-token", recorded?.getHeader("Authorization"))
            assertEquals(
                "Bearer parent-token",
                recorded?.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER),
            )
        }
    }
}
