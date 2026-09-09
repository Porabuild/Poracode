package com.poracode.app.storage

import android.content.ContextWrapper
import android.content.pm.ApplicationInfo
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteJson
import java.io.File
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LegacyProtocolUpgradeTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun realV2SourceImportsReviewedPinWithoutRebindingOrDeletingSource() = runTest {
        val files = temporary.newFolder()
        val cipher = FakeTokenCipher("v2")
        val document = SessionCredentialDocumentV2(2, profile(9), cipher.encrypt("token"), 9)
        val file = File(files, SessionCredentialRepository.FILE_NAME)
        val original = RemoteJson.encodeToString(document).toByteArray()
        file.writeBytes(original)
        val repository = repository(files, cipher)
        val loaded = repository.loadOutcome()
        assertTrue(loaded is SessionCredentialLoadOutcome.Rejected.ProtocolMismatch)
        assertEquals(9, (loaded as SessionCredentialLoadOutcome.Rejected.ProtocolMismatch).credentials.profile.protocolVersion)
        assertEquals("token", loaded.credentials.accessToken)
        assertArrayEquals(original, file.readBytes())
    }

    @Test
    fun futureDocumentIsRejectedWithoutLegacyFallbackOrDestruction() = runTest {
        val files = temporary.newFolder()
        val cipher = FakeTokenCipher("v2")
        val file = File(files, SessionCredentialRepository.FILE_NAME)
        val original = RemoteJson.encodeToString(
            SessionCredentialDocumentV2(3, profile(9), cipher.encrypt("token"), 9),
        ).toByteArray()
        file.writeBytes(original)
        assertEquals(SessionCredentialLoadOutcome.Rejected.LegacyInconsistent,
            repository(files, cipher).loadOutcome())
        assertArrayEquals(original, file.readBytes())
    }

    @Test
    fun splitV1SourcePreservesReviewedPinAndRejectsFuturePin() = runTest {
        for (version in listOf(9, 11)) {
            val files = temporary.newFolder()
            val legacyProfile = File(files, "datastore/${ConnectionMetadataStore.DATA_STORE_NAME}.preferences_pb")
            legacyProfile.parentFile!!.mkdirs()
            legacyProfile.writeText("profile")
            File(files, KeystoreSecureTokenStore.TOKEN_FILE_NAME).writeText("encrypted token")
            val loaded = repository(files, FakeTokenCipher("v2"), version).loadOutcome()
            if (version == 9) {
                assertTrue(loaded is SessionCredentialLoadOutcome.Rejected.ProtocolMismatch)
                assertEquals(9, (loaded as SessionCredentialLoadOutcome.Rejected.ProtocolMismatch).credentials.profile.protocolVersion)
            } else assertEquals(SessionCredentialLoadOutcome.Rejected.LegacyInconsistent, loaded)
            assertEquals("profile", legacyProfile.readText())
        }
    }

    private fun repository(files: File, cipher: FakeTokenCipher, version: Int = 9): HostCatalogCredentialRepository {
        val context = object : ContextWrapper(null) {
            override fun getFilesDir(): File = files
            override fun getApplicationInfo(): ApplicationInfo = ApplicationInfo().apply { dataDir = files.path }
        }
        val source = AndroidLegacyHostSource(context, cipher, FakeTokenCipher("v1"),
            object : ConnectionMetadataStore {
                override fun profileFlow() = flowOf(profile(version))
                override suspend fun load() = profile(version)
                override suspend fun save(profile: ConnectionProfile) = error("unexpected save")
                override suspend fun clear() = error("unexpected clear")
            },
            object : SecureTokenStore {
                override fun saveAccessToken(token: String) = error("unexpected save")
                override fun loadAccessToken() = "token"
                override fun loadAccessTokenOutcome() = TokenLoadOutcome.Loaded("token")
                override fun deleteAccessToken() = error("unexpected delete")
            },
        )
        return HostCatalogCredentialRepository(HostCatalog(
            HostRegistryStore(File(files, "hosts")), InMemoryHostVault(), source,
        ))
    }

    private fun profile(version: Int) = ConnectionProfile(
        desktopId = "legacy", label = "Legacy", httpBaseUrl = "https://host.test/",
        wsBaseUrl = "wss://host.test/", appVersion = "test", scopes = listOf("session:read"),
        pairedAtEpochMs = 1, protocolVersion = version,
    )
}
