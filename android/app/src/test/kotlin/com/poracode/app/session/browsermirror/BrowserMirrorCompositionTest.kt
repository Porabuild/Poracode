package com.poracode.app.session.browsermirror

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostOperationReceipt
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.browsermirror.BrowserMirrorWireSocket
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BrowserMirrorCompositionTest {
    @Test
    fun compositionExposesControllerAndWiresLeaseForegroundAndDelivery() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val connectionId = ClientConnectionId("67e55044-10b1-426f-9247-bb680e5fe0c8")
        val profile = ConnectionProfile(
            desktopId = "desktop-A",
            label = "Host A",
            httpBaseUrl = "https://host-a.example.test",
            wsBaseUrl = "wss://host-a.example.test",
            appVersion = "1.0.0",
            scopes = listOf("session:read", "session:operate"),
            pairedAtEpochMs = 1L,
        )
        val appState = MutableStateFlow(
            AppSession.UiState(
                phase = AppSession.Phase.Ready,
                profile = profile,
                socketState = com.poracode.app.transport.RemoteWebSocketClient.ConnectionState.Online,
                hostCatalog = HostUiCatalog(hosts = emptyList(), selectedConnectionId = connectionId),
            ),
        )
        val repository = StubRepository()
        val wireSocket = BrowserMirrorWireSocket { true }
        val composition = BrowserMirrorComposition(
            appState = appState,
            repository = repository,
            scope = this,
            dispatcher = dispatcher,
            wireSocketProvider = { wireSocket },
            socketGenerationSupplier = { 10L },
        )

        assertNotNull(composition.controller)
        advanceUntilIdle()

        val lease = composition.hostLease.value
        assertNotNull("lease emits for a ready+online host", lease)
        assertEquals("67e55044-10b1-426f-9247-bb680e5fe0c8", lease!!.connectionId)
        assertEquals(10L, lease.socketGeneration)
        assertTrue(lease.foreground)

        // Backgrounding regresses the lease foreground; foregrounding restores it.
        composition.enterBackground()
        assertEquals(false, composition.hostLease.value?.foreground)
        composition.enterForeground()
        assertEquals(true, composition.hostLease.value?.foreground)

        // Inbound delivery is wired and safe: malformed raw and frames delivered while not
        // subscribed are no-ops rather than crashes.
        composition.deliverSocketFrame(10, "not-json")
        composition.deliverSocketFrame(10, """{"type":"browser-state","state":{"tabs":[],"activeTabId":null}}""")
        assertNull(composition.controller.state.value.frame)

        composition.close()
    }

    @Test
    fun leaseIsNullWithoutASelectedHost() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val appState = MutableStateFlow(AppSession.UiState(phase = AppSession.Phase.NeedsPairing))
        val composition = BrowserMirrorComposition(
            appState = appState,
            repository = StubRepository(),
            scope = this,
            dispatcher = dispatcher,
            wireSocketProvider = { null },
            socketGenerationSupplier = { 0L },
        )
        advanceUntilIdle()
        assertNull(composition.hostLease.value)
        composition.close()
    }
}

private class StubRepository : MultiHostCredentialRepository {
    override suspend fun catalogSnapshot() = HostCatalogSnapshot(HostRegistryDocument(), false)
    override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? = null
    override suspend fun loadOutcome() = SessionCredentialLoadOutcome.Empty
    override fun beginDurableOperation(kind: DurableOperationToken.Kind) =
        DurableOperationToken(0L, kind)
    override suspend fun commit(
        profile: ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ) = CredentialMutationOutcome.RejectedBeforeApply
    override suspend fun clear(owning: DurableOperationToken) = CredentialMutationOutcome.RejectedBeforeApply
    override fun beginHostOperation(kind: HostOperationKind) = HostOperationReceipt(0L, kind)
    override suspend fun selectHost(id: ClientConnectionId, owning: HostOperationReceipt) =
        HostMutationResult.Applied
    override suspend fun removeHost(id: ClientConnectionId, owning: HostOperationReceipt) =
        HostMutationResult.Applied
    override fun hasPendingClearMarker() = false
    override fun hasV2DocumentForTests() = false
    override fun rawV2BytesForTests(): ByteArray? = null
    override fun hasLegacyMaterialForTests() = false
}
