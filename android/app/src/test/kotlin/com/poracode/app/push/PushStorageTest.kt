package com.poracode.app.push

import com.poracode.app.security.TokenCipher
import java.io.File
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PushStorageTest {
    @get:Rule val temporary = TemporaryFolder()
    private val cipher = ReversibleTestCipher()
    private val deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private val route = PushRegistrationRouteV1(
        clientConnectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        desktopId = "desktop",
    )

    @Test
    fun stableStateAndTokenRemainNonsecretAndRotationIsDetectable() {
        val stateFile = temporary.newFile("state").apply { delete() }
        val tokenFile = temporary.newFile("token").apply { delete() }
        val state = PushClientStateStore(stateFile, uuid = { deviceId })
        val vault = PushTokenVault(tokenFile, cipher)
        assertEquals(deviceId, (state.loadOrCreate() as PushClientStateLoadResult.Loaded).state.deviceId)
        assertTrue(vault.save("fcm-secret-a"))
        assertEquals("fcm-secret-a", (vault.load() as PushTokenLoadResult.Loaded).token)
        assertFalse(stateFile.readText().contains("fcm-secret-a"))
        assertFalse(tokenFile.readText().contains("fcm-secret-a"))
    }

    @Test
    fun futureAndCorruptStateArePreservedExactly() {
        listOf("{\"version\":2,\"future\":true}", "not-json").forEachIndexed { index, raw ->
            val file = temporary.newFile("state-$index").apply { writeText(raw) }
            val store = PushClientStateStore(file, uuid = { deviceId })
            val result = store.loadOrCreate()
            assertTrue(
                result == PushClientStateLoadResult.FutureVersion ||
                    result == PushClientStateLoadResult.Corrupt,
            )
            assertFalse(store.markAllHostsDirty())
            assertEquals(raw, file.readText())
        }
    }

    @Test
    fun encryptedOutboxRecoversExactEntryAndExpiresBoundedly() {
        var now = 1_000L
        val file = temporary.newFile("outbox").apply { delete() }
        val outbox = PushUnregisterOutbox(
            file,
            cipher,
            clock = { now },
            id = { "entry-1" },
        )
        outbox.enqueue("https://desktop.example/base", "access-secret", deviceId, route)
        assertFalse(file.readText().contains("access-secret"))
        val recovered = PushUnregisterOutbox(file, cipher, clock = { now })
            .load() as PushOutboxLoadResult.Loaded
        assertEquals(
            PushUnregisterEntryV1(
                "entry-1",
                "https://desktop.example/base",
                "access-secret",
                deviceId,
                route,
                1_000L,
            ),
            recovered.entries.single(),
        )
        now += PushUnregisterOutbox.MAX_AGE_MS + 1
        assertEquals(1, outbox.removeExpired())
        assertEquals(PushOutboxLoadResult.Empty, outbox.load())
    }

    @Test
    fun futureEncryptedStoreEnvelopesAreNeverOverwritten() {
        val tokenFile = temporary.newFile("future-token").apply { writeText("v2:opaque") }
        val outboxFile = temporary.newFile("future-outbox").apply { writeText("v2:opaque") }
        val token = PushTokenVault(tokenFile, cipher)
        val outbox = PushUnregisterOutbox(outboxFile, cipher)
        assertEquals(PushTokenLoadResult.FutureVersion, token.load())
        assertFalse(token.save("new-secret"))
        assertEquals(null, outbox.enqueue("https://host", "secret", deviceId, route))
        assertEquals("v2:opaque", tokenFile.readText())
        assertEquals("v2:opaque", outboxFile.readText())
    }
}

private class ReversibleTestCipher : TokenCipher {
    override val keyAlias = "test"
    override fun encrypt(plaintext: String): String = Base64.getEncoder()
        .encodeToString(plaintext.toByteArray())
    override fun decrypt(ciphertextBase64: String): String = String(
        Base64.getDecoder().decode(ciphertextBase64),
    )
    override fun deleteKey() = Unit
}
