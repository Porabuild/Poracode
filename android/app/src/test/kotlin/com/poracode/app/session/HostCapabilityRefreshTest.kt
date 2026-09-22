package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostServiceCapabilities
import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.ThreadConfig
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteApiGatewayFactory
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * C1 capability freshness on connect: the live descriptor is persisted with an
 * identity fence, a failed fetch never erases stored capabilities, and a null
 * describe leaves the stored describe untouched.
 */
class HostCapabilityRefreshTest {
    @get:Rule val temporary = TemporaryFolder()

    private val connectionId = ClientConnectionId("00000000-0000-0000-0000-000000000001")

    @Test
    fun liveDescriptorUpdatesTheStoredCapabilities() = runBlocking {
        val fixture = fixture()
        val credentials = fixture.repository.credentialsFor(connectionId)!!

        val refreshed = fixture.refresher(
            environment = descriptor(sshVersions = listOf(1), browserVersions = listOf(1)),
            describe = HostServiceCapabilities(computerUse = true),
        ).refresh(connectionId, credentials)

        assertTrue(refreshed)
        val record = fixture.catalog.snapshot().document.host(connectionId)!!
        assertEquals(listOf(1), record.sshEnvironmentsVersions)
        assertEquals(listOf(1), record.browserForwardVersions)
        assertEquals(HostServiceCapabilities(computerUse = true), record.hostCapabilities)
    }

    @Test
    fun failedDescriptorFetchNeverErasesKnownCapabilities() = runBlocking {
        val fixture = fixture()
        val credentials = fixture.repository.credentialsFor(connectionId)!!
        fixture.refresher(
            environment = descriptor(sshVersions = listOf(1), browserVersions = listOf(1)),
            describe = HostServiceCapabilities(computerUse = true),
        ).refresh(connectionId, credentials)

        val failed = fixture.refresher(environment = null).refresh(connectionId, credentials)

        assertFalse(failed)
        val record = fixture.catalog.snapshot().document.host(connectionId)!!
        assertEquals(listOf(1), record.sshEnvironmentsVersions)
        assertEquals(HostServiceCapabilities(computerUse = true), record.hostCapabilities)
    }

    @Test
    fun nullDescribeKeepsTheStoredDescribe() = runBlocking {
        val fixture = fixture()
        val credentials = fixture.repository.credentialsFor(connectionId)!!
        fixture.refresher(
            environment = descriptor(sshVersions = listOf(1), browserVersions = emptyList()),
            describe = HostServiceCapabilities(computerUse = true),
        ).refresh(connectionId, credentials)

        fixture.refresher(
            environment = descriptor(sshVersions = emptyList(), browserVersions = emptyList()),
            describe = null,
        ).refresh(connectionId, credentials)

        val record = fixture.catalog.snapshot().document.host(connectionId)!!
        assertTrue(record.sshEnvironmentsVersions.isEmpty())
        assertEquals(HostServiceCapabilities(computerUse = true), record.hostCapabilities)
    }

    @Test
    fun staleCredentialsCannotUpdateARePairedRecord() = runBlocking {
        val fixture = fixture()
        val stale = fixture.repository.credentialsFor(connectionId)!!

        // Re-pair the same endpoint in place: the catalog reuses the existing
        // connection id with a new pairing generation and a fresh token.
        fixture.catalog.add(
            fixture.record.copy(
                connectionId = ClientConnectionId("00000000-0000-0000-0000-000000000099"),
                pairedAtEpochMs = 2,
            ),
            "fresh-token",
            fixture.catalog.begin(HostOperationKind.Add),
        )

        val refreshed = fixture.refresher(
            environment = descriptor(sshVersions = listOf(1), browserVersions = listOf(1)),
        ).refresh(connectionId, stale)

        assertFalse(refreshed)
        assertTrue(
            fixture.catalog.snapshot().document.host(connectionId)!!
                .sshEnvironmentsVersions.isEmpty(),
        )
    }

    private inner class Fixture {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder(), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )
        val repository = HostCatalogCredentialRepository(catalog)
        val record = HostRecord(
            connectionId = connectionId,
            desktopId = "desktop",
            label = "Host",
            httpBaseUrl = "https://host.test/",
            wsBaseUrl = "wss://host.test/",
            appVersion = "12.0.0",
            scopes = listOf("session:read"),
            pairedAtEpochMs = 1,
            protocolVersion = 12,
        )

        suspend fun seed(): Fixture {
            catalog.add(record, "token", catalog.begin(HostOperationKind.Add))
            return this
        }

        fun refresher(
            environment: RemoteEnvironmentDescriptor?,
            describe: HostServiceCapabilities? = null,
            describeThrows: Boolean = false,
        ): HostCapabilityRefresh {
            val gateway = FakeGateway(environment, describe, describeThrows)
            return HostCapabilityRefresh(
                repository = repository,
                apiFactory = RemoteApiGatewayFactory { _, _ -> gateway },
                ioDispatcher = Dispatchers.IO,
                isForeground = { true },
                hasEndpointPermission = { true },
            )
        }
    }

    private suspend fun fixture(): Fixture = Fixture().seed()

    private fun descriptor(
        sshVersions: List<Int>,
        browserVersions: List<Int>,
    ) = RemoteEnvironmentDescriptor(
        protocolVersion = 12,
        desktopId = "desktop",
        label = "Host",
        appVersion = "12.0.0",
        auth = RemoteEnvironmentDescriptor.Auth(policy = "none"),
        endpoints = RemoteEnvironmentDescriptor.Endpoints(
            httpBaseUrl = "https://host.test/",
            wsBaseUrl = "wss://host.test/",
        ),
        capabilities = RemoteEnvironmentDescriptor.Capabilities(
            browserForward = RemoteEnvironmentDescriptor.VersionedCapability(browserVersions),
            sshEnvironments = RemoteEnvironmentDescriptor.VersionedCapability(sshVersions),
        ),
    )

    private class FakeGateway(
        private val environment: RemoteEnvironmentDescriptor?,
        private val describe: HostServiceCapabilities?,
        private val describeThrows: Boolean,
    ) : RemoteApiGateway {
        override fun setAccessToken(token: String?) = Unit

        override suspend fun environment(): RemoteEnvironmentDescriptor =
            environment ?: throw RuntimeException("fetch failed")

        override suspend fun exchangePairingCredential(
            credential: String,
            scopes: List<String>,
        ): RemoteAccessTokenResult = throw NotImplementedError()

        override suspend fun snapshot(): RemoteShellSnapshot = throw NotImplementedError()

        override suspend fun agentStatuses(): com.poracode.app.transport.RemoteAgentStatuses =
            throw NotImplementedError()

        override suspend fun describeHostOrNull(): HostServiceCapabilities? {
            if (describeThrows) throw RuntimeException("describe failed")
            return describe
        }

        override suspend fun threadHistory(
            threadId: String,
            targetTimelineEntryCount: Int?,
        ): RemoteThreadSnapshot = throw NotImplementedError()

        override suspend fun threadRuntimeItemsPage(
            threadId: String,
            beforePosition: Int?,
            limit: Int,
            targetTimelineEntryCount: Int?,
        ): RemoteRuntimeItemsPage = throw NotImplementedError()

        override suspend fun sendThreadInput(
            threadId: String,
            prompt: String,
            config: ThreadConfig,
            segments: JsonArray?,
            userMessageItemId: String?,
        ) = throw NotImplementedError()

        override suspend fun interruptThread(threadId: String) = throw NotImplementedError()

        override suspend fun websocketTicket(): String = throw NotImplementedError()

        override fun websocketUrl(
            ticket: String,
            lastSeenSeq: Int?,
            threadItemInterests: List<String>?,
        ): String = throw NotImplementedError()
    }

    private object EmptyLegacySource : LegacyHostSource {
        override fun readRaw(): LegacySourceBytes = LegacySourceBytes()
        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = null
        override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? = null
        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: LegacyHostImport.SourceKind,
        ): Boolean = true
    }
}
