package com.poracode.app.session.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsHostLeaseSourceTest {
    @Test
    fun generationChangesForExactBindingAndReadinessRegressionsOnly() {
        val source = SettingsHostLeaseSource()
        val first = binding(connectionA)
        source.update(first)
        assertEquals(1, source.state.value!!.generation)

        source.update(first.copy(scopes = setOf("session:read")))
        assertEquals(1, source.state.value!!.generation)
        assertEquals(setOf("session:read"), source.state.value!!.scopes)

        source.update(first.copy(online = false))
        assertEquals(2, source.state.value!!.generation)
        source.update(first)
        assertEquals(2, source.state.value!!.generation)

        source.update(first.copy(endpoint = "https://repaired.test"))
        assertEquals(3, source.state.value!!.generation)
        source.update(first.copy(connectionId = connectionB))
        assertEquals(4, source.state.value!!.generation)
        assertEquals(connectionB, source.state.value!!.connectionId)

        source.update(null)
        assertNull(source.state.value)
        source.update(first)
        assertTrue(source.state.value!!.generation > 4)
    }

    private fun binding(id: com.poracode.app.model.ClientConnectionId) = SettingsHostBinding(
        connectionId = id,
        protocolVersion = 8,
        endpoint = "https://host.test",
        pairedAtEpochMs = 1,
        tokenExpiresAt = null,
        scopes = setOf("session:read", "session:operate"),
        online = true,
        ready = true,
    )
}
