package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRegistryDocument
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Versioned-boundary fixture for the native host registry: format 2 documents
 * (direct records only, no environment binding) must migrate in the reader to
 * format 3 with every direct field preserved, and never implicitly gain an
 * environment reference.
 */
class HostRegistryV3MigrationTest {
    @get:Rule val temporary = TemporaryFolder()

    private fun store(): HostRegistryStore =
        HostRegistryStore(File(temporary.newFolder(), HostRegistryStore.DIRECTORY_NAME))

    @Test
    fun versionTwoDocumentMigratesToVersionThreePreservingDirectRecords() {
        val raw = """
            {
              "formatVersion": 2,
              "selectedConnectionId": "00000000-0000-0000-0000-000000000002",
              "lru": ["00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000001"],
              "hosts": [
                {
                  "connectionId": "00000000-0000-0000-0000-000000000001",
                  "desktopId": "desktop-one",
                  "label": "First",
                  "httpBaseUrl": "https://one.test:8443/",
                  "wsBaseUrl": "wss://one.test:8443/",
                  "appVersion": "12.0.0",
                  "hostMode": "desktop",
                  "platform": "darwin",
                  "scopes": ["session:read", "session:operate"],
                  "tokenExpiresAt": "2026-01-01T00:00:00.000Z",
                  "pairedAtEpochMs": 111,
                  "protocolVersion": 12,
                  "lastSelectedAtEpochMs": 222,
                  "browserForwardVersions": [1],
                  "certFingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  "hostCapabilities": {"ssh": true, "browserPanel": false}
                },
                {
                  "connectionId": "00000000-0000-0000-0000-000000000002",
                  "desktopId": "desktop-two",
                  "label": "Second",
                  "httpBaseUrl": "https://two.test/",
                  "wsBaseUrl": "wss://two.test/",
                  "appVersion": "12.0.0",
                  "scopes": [],
                  "pairedAtEpochMs": 333,
                  "protocolVersion": 12
                }
              ]
            }
        """.trimIndent().toByteArray(Charsets.UTF_8)

        val decoded = store().decode(raw)

        assertEquals(HostRegistryDocument.FORMAT_VERSION, decoded.formatVersion)
        assertEquals(3, decoded.formatVersion)
        assertEquals(2, decoded.hosts.size)
        assertTrue(decoded.hosts.all { it.environment == null })

        val first = requireNotNull(decoded.host(ClientConnectionId("00000000-0000-0000-0000-000000000001")))
        assertEquals("desktop-one", first.desktopId)
        assertEquals("First", first.label)
        assertEquals("https://one.test:8443/", first.httpBaseUrl)
        assertEquals("wss://one.test:8443/", first.wsBaseUrl)
        assertEquals("12.0.0", first.appVersion)
        assertEquals("desktop", first.hostMode)
        assertEquals("darwin", first.platform)
        assertEquals(listOf("session:read", "session:operate"), first.scopes)
        assertEquals("2026-01-01T00:00:00.000Z", first.tokenExpiresAt)
        assertEquals(111L, first.pairedAtEpochMs)
        assertEquals(12, first.protocolVersion)
        assertEquals(222L, first.lastSelectedAtEpochMs)
        assertEquals(listOf(1), first.browserForwardVersions)
        assertEquals(
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            first.certFingerprint,
        )
        assertEquals(true, first.hostCapabilities?.ssh)
        assertEquals(emptyList<Int>(), first.sshEnvironmentsVersions)
    }

    @Test
    fun versionTwoDocumentReencodesAsVersionThree() {
        val raw = """
            {"formatVersion":2,"selectedConnectionId":null,"lru":[],"hosts":[]}
        """.trimIndent().toByteArray(Charsets.UTF_8)
        val decoded = store().decode(raw)
        val reencoded = store().decode(store().encode(decoded))
        assertEquals(HostRegistryDocument.FORMAT_VERSION, reencoded.formatVersion)
    }

    @Test
    fun versionThreeEnvironmentRecordRoundTrips() {
        val reference = EnvironmentHostReference(
            parentConnectionId = ClientConnectionId("00000000-0000-0000-0000-000000000010"),
            environmentId = "11111111-1111-4111-8111-111111111111",
            childDesktopId = "child-desktop",
        )
        val raw = """
            {
              "formatVersion": 3,
              "selectedConnectionId": "00000000-0000-0000-0000-000000000011",
              "lru": ["00000000-0000-0000-0000-000000000011"],
              "hosts": [
                {
                  "connectionId": "00000000-0000-0000-0000-000000000011",
                  "desktopId": "child-desktop",
                  "label": "Box",
                  "httpBaseUrl": "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy",
                  "wsBaseUrl": "wss://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy",
                  "appVersion": "12.0.0",
                  "pairedAtEpochMs": 1,
                  "protocolVersion": 12,
                  "environment": {
                    "parentConnectionId": "00000000-0000-0000-0000-000000000010",
                    "environmentId": "11111111-1111-4111-8111-111111111111",
                    "childDesktopId": "child-desktop"
                  }
                }
              ]
            }
        """.trimIndent().toByteArray(Charsets.UTF_8)

        val decoded = store().decode(raw)
        val host = decoded.selected
        assertNotNull(host)
        assertEquals(reference, host?.environment)
        assertTrue(host?.isEnvironment == true)

        val roundTripped = store().decode(store().encode(decoded))
        assertEquals(reference, roundTripped.selected?.environment)
    }

    @Test
    fun futureVersionRefusesWithoutRewrite() {
        val raw = """{"formatVersion":4,"selectedConnectionId":null,"lru":[],"hosts":[]}"""
            .toByteArray(Charsets.UTF_8)
        assertThrows(IllegalArgumentException::class.java) { store().decode(raw) }
    }

    @Test
    fun versionOneRefuses() {
        val raw = """{"formatVersion":1,"selectedConnectionId":null,"lru":[],"hosts":[]}"""
            .toByteArray(Charsets.UTF_8)
        assertThrows(IllegalArgumentException::class.java) { store().decode(raw) }
    }

    @Test
    fun migrationWritesVersionThreeAndNoEnvironmentFieldForDirectRecords() {
        val fixtureStore = store()
        val raw = """
            {"formatVersion":2,"selectedConnectionId":"00000000-0000-0000-0000-000000000020","lru":["00000000-0000-0000-0000-000000000020"],"hosts":[{"connectionId":"00000000-0000-0000-0000-000000000020","desktopId":"desktop","label":"Direct","httpBaseUrl":"https://direct.test/","wsBaseUrl":"wss://direct.test/","appVersion":"12.0.0","pairedAtEpochMs":1,"protocolVersion":12}]}
        """.trimIndent().toByteArray(Charsets.UTF_8)
        val decoded = fixtureStore.decode(raw)
        assertNull(decoded.selected?.environment)

        val encoded = fixtureStore.encode(decoded).toString(Charsets.UTF_8)
        assertTrue(encoded.contains("\"formatVersion\":3"))
        assertTrue(!encoded.contains("\"environment\""))
    }
}
