package com.poracode.app.session.advancedops

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostOperationReceipt
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.advancedops.AdvancedOpsTransport
import com.poracode.app.ui.advancedops.AdvancedInput
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AdvancedOpsProductionCompositionTest {
    @Test
    fun `exact selected vault credential wins a host selection race`() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val state = MutableStateFlow(advancedState())
        val profileA = requireNotNull(state.value.profile)
        val profileB = advancedProfile("desktop-b", "https://b.example.test")
        val repository = RecordingRepository(
            mapOf(
                ADVANCED_CONNECTION_A to SessionCredentials(profileA, "token-a"),
                ADVANCED_CONNECTION_B to SessionCredentials(profileB, "token-b"),
            ),
        )
        repository.hold[ADVANCED_CONNECTION_A] = CompletableDeferred()
        val createdTokens = mutableListOf<String>()
        val composition = AdvancedOpsProductionComposition(
            state,
            repository,
            this,
            dispatcher,
            AdvancedFoundationFactory { owners, credentials ->
                createdTokens += credentials.accessToken
                AdvancedOpsFoundation.create(owners, AdvancedOpsTransport { _, _ -> JsonNull })
            },
        )

        composition.enterForeground()
        runCurrent()
        state.value = advancedState(ADVANCED_CONNECTION_B, profileB)
        advanceUntilIdle()

        assertEquals(listOf(ADVANCED_CONNECTION_A, ADVANCED_CONNECTION_B), repository.requests)
        assertEquals(listOf("token-b"), createdTokens)
        assertEquals(ADVANCED_CONNECTION_B, composition.owners.value.host?.clientConnectionId)
        composition.close()
    }

    @Test
    fun `background closes foundation and cancels an in-flight controller call`() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val state = MutableStateFlow(advancedState())
        val repository = RecordingRepository(
            mapOf(
                ADVANCED_CONNECTION_A to SessionCredentials(
                    requireNotNull(state.value.profile),
                    "selected-token",
                ),
            ),
        )
        val started = CompletableDeferred<Unit>()
        val cancelled = CompletableDeferred<Unit>()
        val composition = AdvancedOpsProductionComposition(
            state,
            repository,
            this,
            dispatcher,
            AdvancedFoundationFactory { owners, _ ->
                AdvancedOpsFoundation.create(
                    owners,
                    AdvancedOpsTransport { _, _ ->
                        started.complete(Unit)
                        try {
                            awaitCancellation()
                        } finally {
                            cancelled.complete(Unit)
                        }
                    },
                )
            },
        )
        composition.enterForeground()
        advanceUntilIdle()
        composition.controller.submit(AdvancedInput.ReadAbsolute("/workspace/one/a.txt"))
        runCurrent()
        assertTrue(started.isCompleted)

        composition.enterBackground()
        runCurrent()

        assertTrue(cancelled.isCompleted)
        assertTrue(!composition.owners.value.foreground)
        assertEquals(null, composition.controller.state.value.output)
        composition.close()
    }
}

private class RecordingRepository(
    private val credentials: Map<ClientConnectionId, SessionCredentials>,
) : MultiHostCredentialRepository {
    val requests = mutableListOf<ClientConnectionId>()
    val hold = mutableMapOf<ClientConnectionId, CompletableDeferred<Unit>>()
    private val ids = AtomicLong()

    override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? {
        requests += id
        hold[id]?.await()
        return credentials[id]
    }

    override suspend fun catalogSnapshot() = HostCatalogSnapshot(HostRegistryDocument(), false)
    override suspend fun loadOutcome() = SessionCredentialLoadOutcome.Empty
    override fun beginDurableOperation(kind: DurableOperationToken.Kind) =
        DurableOperationToken(ids.incrementAndGet(), kind)
    override suspend fun commit(
        profile: com.poracode.app.model.ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ) = CredentialMutationOutcome.RejectedBeforeApply
    override suspend fun clear(owning: DurableOperationToken) =
        CredentialMutationOutcome.RejectedBeforeApply
    override fun beginHostOperation(kind: HostOperationKind) =
        HostOperationReceipt(ids.incrementAndGet(), kind)
    override suspend fun selectHost(id: ClientConnectionId, owning: HostOperationReceipt) =
        HostMutationResult.RejectedBeforeApply
    override suspend fun removeHost(id: ClientConnectionId, owning: HostOperationReceipt) =
        HostMutationResult.RejectedBeforeApply
    override fun hasPendingClearMarker() = false
    override fun hasV2DocumentForTests() = false
    override fun rawV2BytesForTests(): ByteArray? = null
    override fun hasLegacyMaterialForTests() = false
}
