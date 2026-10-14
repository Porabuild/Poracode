package com.poracode.app.transport.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentAuthority
import com.poracode.app.model.RemoteWebSocketTicketResult
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EnvironmentAuthorityStoreTest {
    @After
    fun tearDown() {
        EnvironmentAuthorityStore.resetForTests()
    }

    @Test
    fun lookupNormalizesTrailingSlashAndRetiresMissingEndpoints() {
        val endpoint = "https://parent.test/api/environments/env-1/proxy"
        val authority = authority("env-1")
        EnvironmentAuthorityStore.register("$endpoint/", authority)

        assertEquals(authority, EnvironmentAuthorityStore.authorityFor(endpoint))
        assertEquals(authority, EnvironmentAuthorityStore.authorityFor("$endpoint/"))

        EnvironmentAuthorityStore.reconcile(emptyMap())

        assertNull(EnvironmentAuthorityStore.authorityFor(endpoint))
        assertTrue(EnvironmentAuthorityStore.registeredEndpointsForTests().isEmpty())
    }

    @Test
    fun reconcileReplacesTheSetAndKeepsUnchangedEndpoints() {
        val endpointA = "https://parent.test/api/environments/env-a/proxy"
        val endpointB = "https://parent.test/api/environments/env-b/proxy"
        val first = authority("env-a")
        val second = authority("env-b")
        val replacement = authority("env-a")

        EnvironmentAuthorityStore.reconcile(mapOf(endpointA to first))
        EnvironmentAuthorityStore.reconcile(
            mapOf(endpointA to replacement, endpointB to second),
        )

        assertEquals(replacement, EnvironmentAuthorityStore.authorityFor(endpointA))
        assertEquals(second, EnvironmentAuthorityStore.authorityFor(endpointB))

        EnvironmentAuthorityStore.reconcile(mapOf(endpointB to second))

        assertNull(EnvironmentAuthorityStore.authorityFor(endpointA))
        assertEquals(second, EnvironmentAuthorityStore.authorityFor(endpointB))
    }

    @Test
    fun unknownEndpointAndBlankKeysAreNull() {
        assertNull(EnvironmentAuthorityStore.authorityFor("https://unknown.test/"))
        EnvironmentAuthorityStore.register("", authority("x"))
        assertTrue(EnvironmentAuthorityStore.registeredEndpointsForTests().isEmpty())
    }

    private fun authority(environmentId: String): EnvironmentAuthority =
        object : EnvironmentAuthority {
            override val environmentId: String = environmentId
            override val childDesktopId: String? = null
            override val environmentParentConnectionId: ClientConnectionId =
                ClientConnectionId("00000000-0000-0000-0000-000000000001")
            override suspend fun parentAccessToken(): String? = "parent-token"
            override suspend fun mintWebSocketTicket(): RemoteWebSocketTicketResult =
                RemoteWebSocketTicketResult("parent-ticket", "2099-01-01T00:00:00.000Z")
        }
}
