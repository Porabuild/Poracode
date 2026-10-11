package com.poracode.app.transport

import com.poracode.app.model.HostServiceCapabilities
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class RemoteApiClientHostDescribeTest {
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

    private fun client(): RemoteApiClient =
        RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "access-secret",
            client = OkHttpClient.Builder()
                .followRedirects(false)
                .followSslRedirects(false)
                .build(),
        )

    @Test
    fun describeHostReadsCapabilities() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody(
                        """{"capabilities":{"ssh":true,"browserPanel":true,"chromeBridge":true,"computerUse":true,"nativeSecrets":true,"portForward":true,"autoUpdate":true,"osNotifications":true}}""",
                    ),
            )
            val caps = client().describeHost()
            assertEquals(true, caps.autoUpdate)
            assertEquals(true, caps.osNotifications)
            assertEquals(true, caps.ssh)
            val recorded = server.takeRequest()
            assertEquals("/api/host/describe", recorded.path)
            assertEquals("GET", recorded.method)
            assertEquals("Bearer access-secret", recorded.getHeader("Authorization"))
        }
    }

    @Test
    fun describeHost404FailsClosed() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"error":{"code":"not_found","message":"x"}}"""),
            )
            assertEquals(HostServiceCapabilities.UNKNOWN, client().describeHost())
        }
    }

    @Test
    fun describeHost403FailsClosed() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(403)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"error":{"code":"missing_scope","message":"x"}}"""),
            )
            assertEquals(HostServiceCapabilities.UNKNOWN, client().describeHost())
        }
    }

    @Test
    fun describeHostOmittedFlagsDecodeFalse() {
        runBlocking {
            // Regenerated contract: every capability flag is optional on the wire with
            // a default of false, so a describe response may omit them; the production
            // decode path must fill the omissions in.
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"capabilities":{"ssh":true}}"""),
            )
            val caps = client().describeHost()
            assertEquals(true, caps.ssh)
            assertEquals(false, caps.browserPanel)
            assertEquals(false, caps.chromeBridge)
            assertEquals(false, caps.computerUse)
            assertEquals(false, caps.nativeSecrets)
            assertEquals(false, caps.portForward)
            assertEquals(false, caps.autoUpdate)
            assertEquals(false, caps.osNotifications)
        }
    }

    @Test
    fun describeHostInvalidPayloadDegradesToUnknown() {
        runBlocking {
            // Optional-with-default does not loosen strictness: keys outside the
            // contract still fail the decode. Describe is best-effort though — the
            // invalid_response failure degrades to UNKNOWN instead of throwing.
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"capabilities":{"dummy":true}}"""),
            )
            assertEquals(HostServiceCapabilities.UNKNOWN, client().describeHost())
        }
    }

    @Test
    fun describeHost500DegradesToUnknown() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"error":{"code":"internal","message":"x"}}"""),
            )
            assertEquals(HostServiceCapabilities.UNKNOWN, client().describeHost())
        }
    }

    @Test
    fun describeHostNetworkFailureDegradesToUnknown() {
        runBlocking {
            // Connection refused (status 0 / "network") degrades too.
            val unreachable = RemoteApiClient(
                endpoint = "http://127.0.0.1:1",
                accessToken = "access-secret",
                client = OkHttpClient.Builder().build(),
            )
            assertEquals(HostServiceCapabilities.UNKNOWN, unreachable.describeHost())
        }
    }
}
