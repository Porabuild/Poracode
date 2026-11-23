package com.poracode.app.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CrashDiagnosticsManagerTest {
    @get:Rule val temp = TemporaryFolder()

    private class FakeEnabledStore(private var value: Boolean = true) : DiagnosticsEnabledStore {
        override fun isEnabled(): Boolean = value
        override fun setEnabled(enabled: Boolean) { value = enabled }
    }

    @Test
    fun scrubsExceptionMessageAndEnforcesRetentionAndKillSwitch() {
        var clock = 1_700_000_000_000L
        val dir = temp.newFolder("diag")
        val store = FakeEnabledStore(true)
        val manager = CrashDiagnosticsManager(dir, store, buildEnabled = true, nowEpochMs = { clock })

        val secretException = IllegalStateException("Bearer secret-token-123 /Users/alice/private")
        val scrubbed = manager.fromThrowable(secretException)
        assertEquals("java.lang.IllegalStateException", scrubbed.exceptionClass)
        manager.record(scrubbed)
        val exported = manager.exportJson()
        assertFalse(exported.contains("secret-token-123"))
        assertFalse(exported.contains("/Users/alice"))

        // Enforces max 20 reports
        repeat(25) { idx ->
            clock += 1000L
            manager.record(scrubbed.copy(id = "r-$idx", timestampEpochMs = clock))
        }
        assertEquals(CrashDiagnosticsManager.MAX_REPORTS, manager.reports.value.size)

        // Enforces 30-day expiry
        clock += CrashDiagnosticsManager.MAX_AGE_MS + 10_000L
        manager.reload()
        assertTrue(manager.reports.value.isEmpty())

        // Kill switch wipes stored reports and blocks new capture
        manager.record(scrubbed.copy(id = "live", timestampEpochMs = clock))
        assertEquals(1, manager.reports.value.size)
        manager.setCaptureEnabled(false)
        assertTrue(manager.reports.value.isEmpty())
        manager.record(scrubbed.copy(id = "ignored", timestampEpochMs = clock + 1))
        assertTrue(manager.reports.value.isEmpty())
    }
}
