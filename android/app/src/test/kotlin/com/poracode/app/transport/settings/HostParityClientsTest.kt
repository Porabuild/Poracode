package com.poracode.app.transport.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HostParityClientsTest {
    @Test
    fun declaresAllElevenEnvironmentManagementRouteDescriptors() {
        assertEquals(13, HostParityClients.ENVIRONMENT_ROUTE_IDS.size)
        assertTrue("environment-list" in HostParityClients.ENVIRONMENT_ROUTE_IDS)
        assertTrue("environment-trust-probe" in HostParityClients.ENVIRONMENT_ROUTE_IDS)
        assertTrue("environment-trust-accept" in HostParityClients.ENVIRONMENT_ROUTE_IDS)
        assertTrue("environment-adopt-legacy" in HostParityClients.ENVIRONMENT_ROUTE_IDS)
        assertEquals("memory-catalog", HostParityClients.MEMORY_CATALOG_ROUTE_ID)
        assertEquals("memory-sync", HostParityClients.MEMORY_SYNC_ROUTE_ID)
    }
}
