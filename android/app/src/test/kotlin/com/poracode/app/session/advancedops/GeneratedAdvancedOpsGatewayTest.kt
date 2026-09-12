package com.poracode.app.session.advancedops

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.AdvancedPayloads
import com.poracode.app.transport.advancedops.AdvancedOpsTransport
import com.poracode.app.transport.advancedops.AdvancedTransportException
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GeneratedAdvancedOpsGatewayTest {
    @Test
    fun `ambiguous mutation is never replayed and performs one relevant read`() = runBlocking {
        val calls = mutableListOf<AdvancedOperation>()
        val fixture = fixture(
            AdvancedOpsTransport { operation, _ ->
                calls += operation
                if (operation == AdvancedOperation.WriteExternalFile) {
                    throw AdvancedTransportException.unavailable()
                }
                buildJsonObject {
                    put("path", WSL.uncPath)
                    put("status", "ready")
                    put("modifiedAtMs", 2.0)
                    put("content", "new")
                }
            },
        )
        val mutation = AdvancedCall(
            AdvancedOperation.WriteExternalFile,
            fixture.project,
            AdvancedPayloads.externalWrite(WSL, WSL.uncPath, "new", 1.0),
        )
        val reconciliation = AdvancedCall(
            AdvancedOperation.ReadExternalFile,
            fixture.project,
            AdvancedPayloads.externalRead(WSL, WSL.uncPath),
        )

        val outcome = fixture.gateway.mutate(mutation, reconciliation)
        assertTrue(outcome is AdvancedMutationOutcome.Reconciled)
        assertEquals(
            listOf(AdvancedOperation.WriteExternalFile, AdvancedOperation.ReadExternalFile),
            calls,
        )
    }

    @Test
    fun `mutations serialize per exact owner`() = runBlocking {
        val active = AtomicInteger()
        val maximum = AtomicInteger()
        val fixture = fixture(
            AdvancedOpsTransport { _, _ ->
                val now = active.incrementAndGet()
                maximum.updateAndGet { maxOf(it, now) }
                delay(30)
                active.decrementAndGet()
                JsonNull
            },
        )
        val call = AdvancedCall(
            AdvancedOperation.DeleteProjectEntry,
            fixture.project,
            AdvancedPayloads.projectEntry(WSL, "a"),
        )
        val first = async { fixture.gateway.mutate(call) }
        val second = async { fixture.gateway.mutate(call) }
        first.await()
        second.await()
        assertEquals(1, maximum.get())
    }

    @Test
    fun `host and project generation race suppresses completed result`() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val fixture = fixture(
            AdvancedOpsTransport { _, _ ->
                started.complete(Unit)
                release.await()
                buildJsonObject { put("status", "missing") }
            },
        )
        val call = AdvancedCall(
            AdvancedOperation.ReadAbsoluteFile,
            fixture.project,
            AdvancedPayloads.externalRead(WSL, "a"),
        )
        val pending = async { runCatching { fixture.gateway.read(call) }.exceptionOrNull() }
        started.await()
        fixture.state.value = fixture.state.value.copy(project = null)
        release.complete(Unit)
        val failure = pending.await() as AdvancedGatewayException
        assertEquals("stale_owner", failure.safeCode)
    }

    @Test
    fun `wrong client owner and missing scope fail before transport`() = runBlocking {
        var calls = 0
        val fixture = fixture(AdvancedOpsTransport { _, _ -> calls += 1; JsonNull })
        val wrongHost = fixture.project.host.copy(
            clientConnectionId = ClientConnectionId("11111111-1111-4111-8111-111111111111"),
        )
        val wrong = fixture.project.copy(host = wrongHost)
        val call = AdvancedCall(
            AdvancedOperation.ReadAbsoluteFile,
            wrong,
            AdvancedPayloads.externalRead(WSL, "a"),
        )
        assertEquals(
            "stale_owner",
            (runCatching { fixture.gateway.read(call) }.exceptionOrNull() as AdvancedGatewayException)
                .safeCode,
        )
        assertEquals(0, calls)
    }

    private fun fixture(transport: AdvancedOpsTransport): Fixture {
        val host = AdvancedHostLease(
            ClientConnectionId("00000000-0000-4000-8000-000000000001"),
            desktopHostGeneration = 7,
            scopes = setOf("session:read", "session:operate", "projects:manage"),
            online = true,
            ready = true,
        )
        val project = ProjectLocationAdvancedOwner(host, "p1", 4, WSL, 9)
        val state = MutableStateFlow(AdvancedOwnerSnapshot(host = host, project = project))
        return Fixture(state, project, GeneratedAdvancedOpsGateway(state, transport))
    }

    private data class Fixture(
        val state: MutableStateFlow<AdvancedOwnerSnapshot>,
        val project: ProjectLocationAdvancedOwner,
        val gateway: GeneratedAdvancedOpsGateway,
    )

    private companion object {
        val WSL = WslProjectLocation(
            "Ubuntu",
            "/home/me/repo",
            "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        )
    }
}
