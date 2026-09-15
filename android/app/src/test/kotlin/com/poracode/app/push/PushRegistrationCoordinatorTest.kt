package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.security.TokenCipher
import com.poracode.app.storage.SessionCredentials
import java.util.Base64
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PushRegistrationCoordinatorTest {
    @get:Rule val temporary = TemporaryFolder()
    private val connection = ClientConnectionId("11111111-1111-4111-8111-111111111111")
    private val deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

    @Test
    fun capabilityAbsentAndV2OnlyDoNotRegisterButV1V2SendsExactBody() = runBlocking {
        listOf<List<Int>?>(null, listOf(2), listOf(1, 2)).forEachIndexed { index, versions ->
            val fixture = fixture("cap-$index", versions)
            fixture.coordinator.onForeground()
            fixture.coordinator.onToken("fcm-token")
            fixture.coordinator.reconcile()
            assertEquals(if (versions?.contains(1) == true) 1 else 0, fixture.gateway.registered.size)
            if (versions?.contains(1) == true) {
                assertEquals(
                    PushRegistrationBody(
                        deviceId = deviceId,
                        deviceToken = "fcm-token",
                        appVersion = "1.5.0",
                        routing = PushRegistrationRouteV1(
                            clientConnectionId = connection.value,
                            desktopId = "desktop-shared",
                        ),
                    ),
                    fixture.gateway.registered.single(),
                )
            }
        }
    }

    @Test
    fun missingEchoNeverDowngradesOrMarksClean() = runBlocking {
        val fixture = fixture("echo", listOf(1), PushHttpResult.Success(null))
        fixture.coordinator.onForeground()
        fixture.coordinator.onToken("fcm-token")
        fixture.coordinator.reconcile()
        fixture.coordinator.reconcile()
        assertEquals(2, fixture.gateway.registered.size)
    }

    @Test
    fun tokenRotationReregistersEveryEligibleHost() = runBlocking {
        val fixture = fixture("rotate", listOf(1))
        fixture.coordinator.onForeground()
        fixture.coordinator.onToken("fcm-a")
        fixture.coordinator.reconcile()
        fixture.coordinator.reconcile()
        assertEquals(1, fixture.gateway.registered.size)
        fixture.coordinator.onToken("fcm-b")
        fixture.coordinator.reconcile()
        assertEquals(listOf("fcm-a", "fcm-b"), fixture.gateway.registered.map { it.deviceToken })
    }

    @Test
    fun unregisterIsDurableBeforeSendAndRecoversAfterCrash() = runBlocking {
        val fixture = fixture("outbox", listOf(1), unregister = PushHttpResult.TransientFailure)
        fixture.coordinator.onForeground()
        fixture.coordinator.beforeHostRemoval(
            connection,
            SessionCredentials(profile(), "access-secret"),
        )
        val pending = fixture.outbox.load() as PushOutboxLoadResult.Loaded
        assertEquals(1, pending.entries.size)
        assertEquals(
            PushUnregisterBody(deviceId, route()),
            fixture.gateway.unregistered.single(),
        )

        fixture.gateway.unregisterResult = PushHttpResult.Success(null)
        fixture.coordinator.onToken("fcm-token")
        fixture.coordinator.reconcile()
        assertEquals(PushOutboxLoadResult.Empty, fixture.outbox.load())
    }

    @Test
    fun authFailureErasesOutboxEntry() = runBlocking {
        val fixture = fixture("auth", listOf(1), unregister = PushHttpResult.AuthFailure)
        fixture.coordinator.onForeground()
        fixture.coordinator.beforeHostRemoval(
            connection,
            SessionCredentials(profile(), "access-secret"),
        )
        assertEquals(PushOutboxLoadResult.Empty, fixture.outbox.load())
    }

    @Test
    fun registerAndUnregisterWireBodiesContainNoLegacyOrNullableFields() {
        val json = Json { encodeDefaults = true }
        val registration = PushRegistrationBody(
            deviceId,
            deviceToken = "fcm-token",
            appVersion = "1.5.0",
            routing = route(),
        )
        assertEquals(
            setOf("deviceId", "platform", "deviceToken", "appVersion", "routing"),
            json.parseToJsonElement(json.encodeToString(registration)).jsonObject.keys,
        )
        assertEquals(
            setOf("version", "clientConnectionId", "desktopId"),
            json.parseToJsonElement(json.encodeToString(registration)).jsonObject
                .getValue("routing").jsonObject.keys,
        )
        val unregister = PushUnregisterBody(deviceId, route())
        assertEquals(
            setOf("deviceId", "routing"),
            json.parseToJsonElement(json.encodeToString(unregister)).jsonObject.keys,
        )
    }

    private fun fixture(
        name: String,
        versions: List<Int>?,
        register: PushHttpResult = PushHttpResult.Success(1),
        unregister: PushHttpResult = PushHttpResult.Success(null),
    ): Fixture {
        val directory = temporary.newFolder(name)
        val state = PushClientStateStore(directory.resolve("state"), uuid = { deviceId })
        val token = PushTokenVault(directory.resolve("token"), TestPushCipher())
        val outbox = PushUnregisterOutbox(
            directory.resolve("outbox"),
            TestPushCipher(),
            id = { "outbox-id" },
        )
        val gateway = FakePushGateway(versions, register, unregister)
        val host = PushHostCredentials(
            connection,
            "desktop-shared",
            "https://desktop.example",
            "access-secret",
            listOf("session:read", "session:operate"),
        )
        val coordinator = PushRegistrationCoordinator(
            configured = true,
            stateStore = state,
            tokenVault = token,
            outbox = outbox,
            hosts = PushHostSource { listOf(host) },
            clientFactory = PushHostGatewayFactory { _, accessToken ->
                assertEquals("access-secret", accessToken)
                gateway
            },
            appVersion = "1.5.0",
        )
        return Fixture(coordinator, outbox, gateway)
    }

    private fun profile() = ConnectionProfile(
        desktopId = "desktop-shared",
        label = "Desktop",
        httpBaseUrl = "https://desktop.example",
        wsBaseUrl = "wss://desktop.example",
        appVersion = "1.5.0",
        scopes = listOf("session:operate"),
        pairedAtEpochMs = 1,
    )

    private fun route() = PushRegistrationRouteV1(
        clientConnectionId = connection.value,
        desktopId = "desktop-shared",
    )

    private data class Fixture(
        val coordinator: PushRegistrationCoordinator,
        val outbox: PushUnregisterOutbox,
        val gateway: FakePushGateway,
    )
}

private class FakePushGateway(
    private val versions: List<Int>?,
    private val registerResult: PushHttpResult,
    var unregisterResult: PushHttpResult,
) : PushHostGateway {
    val registered = mutableListOf<PushRegistrationBody>()
    val unregistered = mutableListOf<PushUnregisterBody>()
    override suspend fun routingVersions(): List<Int>? = versions
    override suspend fun register(body: PushRegistrationBody): PushHttpResult {
        registered += body
        return registerResult
    }
    override suspend fun unregister(body: PushUnregisterBody): PushHttpResult {
        unregistered += body
        return unregisterResult
    }
}

private class TestPushCipher : TokenCipher {
    override val keyAlias = "test"
    override fun encrypt(plaintext: String): String = Base64.getEncoder()
        .encodeToString(plaintext.toByteArray())
    override fun decrypt(ciphertextBase64: String): String = String(
        Base64.getDecoder().decode(ciphertextBase64),
    )
    override fun deleteKey() = Unit
}
