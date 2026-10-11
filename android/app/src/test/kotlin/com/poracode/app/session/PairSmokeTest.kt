package com.poracode.app.session

import com.poracode.app.model.HostServiceCapabilities
import com.poracode.app.model.RemoteClientException
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.transport.TlsCertPin
import com.poracode.app.transport.TlsCertPinStore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PairSmokeTest {
    @Test
    fun pairReachesReady() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, _ -> FakeApiGateway(endpoint = endpoint) },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals("access-a", credentials.credentials?.accessToken)
        assertEquals(
            HostServiceCapabilities.UNKNOWN,
            credentials.credentials?.profile?.hostCapabilities,
        )
    }

    @Test
    fun pairStoresHostDescribeCapabilities() = runTest {
        val caps = HostServiceCapabilities(
            ssh = true,
            browserPanel = true,
            chromeBridge = true,
            computerUse = true,
            nativeSecrets = true,
            portForward = true,
            autoUpdate = true,
            osNotifications = true,
        )
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val api = FakeApiGateway()
        api.describeHostResponse = caps
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { _, _ -> api },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()
        assertEquals(caps, credentials.credentials?.profile?.hostCapabilities)
        assertEquals(1, api.describeHostCalls.get())
    }

    @Test
    fun pairCompletesWhenDescribeOmitsFlags() = runTest {
        // Regenerated contract: the host may omit capability flags entirely. The
        // decoded model defaults them to false and pairing still completes.
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val api = FakeApiGateway()
        api.describeHostResponse = HostServiceCapabilities(ssh = true)
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { _, _ -> api },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals(
            HostServiceCapabilities(ssh = true),
            credentials.credentials?.profile?.hostCapabilities,
        )
    }

    @Test
    fun pairContinuesWhenDescribeHostForbidden() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val api = FakeApiGateway()
        api.describeHostError = RemoteClientException("missing scope", status = 403, code = "missing_scope")
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { _, _ -> api },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals(
            HostServiceCapabilities.UNKNOWN,
            credentials.credentials?.profile?.hostCapabilities,
        )
    }

    @Test
    fun pairContinuesWhenDescribeHostServerErrors() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val api = FakeApiGateway()
        api.describeHostError = RemoteClientException("boom", status = 500, code = "internal")
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { _, _ -> api },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals(
            HostServiceCapabilities.UNKNOWN,
            credentials.credentials?.profile?.hostCapabilities,
        )
    }

    @Test
    fun pairContinuesWhenDescribeHostPayloadIsInvalid() = runTest {
        // What the transport adapter throws for an undecodable describe payload.
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val api = FakeApiGateway()
        api.describeHostError = RemoteClientException.invalidResponse(
            "Remote contract projection failed at host describe.",
        )
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { _, _ -> api },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals(
            HostServiceCapabilities.UNKNOWN,
            credentials.credentials?.profile?.hostCapabilities,
        )
    }

    @Test
    fun fingerprintlessPairClearsPreviousPinBeforeNetwork() = runTest {
        TlsCertPinStore.resetForTests()
        try {
            val endpoint = "https://pin-host.test"
            TlsCertPinStore.register(endpoint, "a".repeat(64))
            val session = AppSession(
                credentials = InMemorySessionCredentialRepository(),
                scope = this,
                apiFactory = { base, _ ->
                    assertEquals(null, TlsCertPinStore.fingerprintForEndpoint(base))
                    FakeApiGateway(endpoint = base)
                },
                socketFactory = { FakeSocketFactory().create() },
                ioDispatcher = StandardTestDispatcher(testScheduler),
            )
            session.pair(AppSession.PairingInput(manualBaseUrl = endpoint, manualToken = "a"))
            advanceUntilIdle()
            assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        } finally {
            TlsCertPinStore.resetForTests()
        }
    }

    @Test
    fun unpairClearsThePublishedTlsPin() = runTest {
        TlsCertPinStore.resetForTests()
        try {
            val credentials = InMemorySessionCredentialRepository()
            val sockets = FakeSocketFactory()
            val session = AppSession(
                credentials = credentials,
                scope = this,
                apiFactory = { endpoint, _ -> FakeApiGateway(endpoint = endpoint) },
                socketFactory = { sockets.create() },
                ioDispatcher = StandardTestDispatcher(testScheduler),
            )
            val pin = TlsCertPin.sha256Hex("pin-host-leaf".toByteArray())
            session.pair(
                AppSession.PairingInput(
                    manualBaseUrl = "https://pin-host.test/#fp=sha256:$pin",
                    manualToken = "a",
                ),
            )
            advanceUntilIdle()
            assertEquals(AppSession.Phase.Ready, session.state.value.phase)
            assertEquals(pin, TlsCertPinStore.fingerprintForEndpoint("https://pin-host.test"))

            session.unpair()
            advanceUntilIdle()
            assertEquals(null, TlsCertPinStore.fingerprintForEndpoint("https://pin-host.test"))
        } finally {
            TlsCertPinStore.resetForTests()
        }
    }

    @Test
    fun unpairKeepsOtherHostsPins() = runTest {
        TlsCertPinStore.resetForTests()
        try {
            val credentials = InMemorySessionCredentialRepository()
            val sockets = FakeSocketFactory()
            val session = AppSession(
                credentials = credentials,
                scope = this,
                apiFactory = { endpoint, _ -> FakeApiGateway(endpoint = endpoint) },
                socketFactory = { sockets.create() },
                ioDispatcher = StandardTestDispatcher(testScheduler),
            )
            // A second host's pin (and its cached client) must survive the unpair of
            // the selected host; only the unpaired endpoint's pin is dropped.
            val otherEndpoint = "https://other-host.test:8443"
            val otherPin = TlsCertPin.sha256Hex("other-host-leaf".toByteArray())
            TlsCertPinStore.register(otherEndpoint, otherPin)
            val base = OkHttpClient.Builder().build()
            val otherClient = TlsCertPin.clientForEndpoint(otherEndpoint, base)

            val pin = TlsCertPin.sha256Hex("pin-host-leaf".toByteArray())
            session.pair(
                AppSession.PairingInput(
                    manualBaseUrl = "https://pin-host.test/#fp=sha256:$pin",
                    manualToken = "a",
                ),
            )
            advanceUntilIdle()
            assertEquals(AppSession.Phase.Ready, session.state.value.phase)

            session.unpair()
            advanceUntilIdle()
            // The unpaired endpoint loses its pin and its cached client…
            assertEquals(null, TlsCertPinStore.fingerprintForEndpoint("https://pin-host.test"))
            assertSame(base, TlsCertPin.clientForEndpoint("https://pin-host.test", base))
            // …while the other host's pin still resolves and its client stayed cached.
            assertEquals(otherPin, TlsCertPinStore.fingerprintForEndpoint(otherEndpoint))
            assertSame(otherClient, TlsCertPin.clientForEndpoint(otherEndpoint, base))
        } finally {
            TlsCertPinStore.resetForTests()
        }
    }
}
