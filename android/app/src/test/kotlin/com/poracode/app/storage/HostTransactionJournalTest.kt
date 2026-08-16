package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HostTransactionJournalTest {
    private val id = ClientConnectionId("00000000-0000-0000-0000-000000000001")

    @Test
    fun phasesRoundTripWithExactTargetBytes() {
        val registry = "{\"formatVersion\":2}".toByteArray()
        val record = HostTransactionJournal.make(
            operationId = 42,
            kind = HostTransactionJournal.Kind.Add,
            connectionId = id,
            targetRegistryBytes = registry,
            targetVaultAccount = HostVault.account(id),
            targetVaultBytes = "secret".toByteArray(),
        )
        HostTransactionJournal.Phase.entries.forEach { phase ->
            val decoded = HostTransactionJournal.decode(
                HostTransactionJournal.encode(record.withPhase(phase)),
            ) as HostTransactionJournal.Decode.Current
            assertEquals(phase, decoded.record.phase)
            assertTrue(registry.contentEquals(decoded.record.targetRegistryBytes))
            assertTrue("secret".toByteArray().contentEquals(decoded.record.targetVaultBytes))
        }
    }

    @Test
    fun futureCorruptAndAccountSwapAreRejected() {
        assertEquals(
            HostTransactionJournal.Decode.Future,
            HostTransactionJournal.decode("{\"version\":999}".toByteArray()),
        )
        assertEquals(
            HostTransactionJournal.Decode.Corrupt,
            HostTransactionJournal.decode("not-json".toByteArray()),
        )
        val swapped = """{
            "version":1,"operationId":1,"kind":"Add",
            "connectionId":"${id.value}","phase":"Intent",
            "targetRegistryBase64":"${Base64.getEncoder().encodeToString("x".toByteArray())}",
            "targetVaultAccount":"host-vault.00000000-0000-0000-0000-000000000002",
            "targetVaultBase64":"${Base64.getEncoder().encodeToString("secret".toByteArray())}"
        }""".trimIndent()
        assertEquals(
            HostTransactionJournal.Decode.Corrupt,
            HostTransactionJournal.decode(swapped.toByteArray()),
        )
    }
}
