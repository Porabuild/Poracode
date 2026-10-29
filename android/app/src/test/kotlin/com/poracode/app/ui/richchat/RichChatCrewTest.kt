package com.poracode.app.ui.richchat

import com.poracode.app.model.RemoteJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class RichChatCrewTest {
    @Test
    fun decodesReadOnlyCrewSummaryWithoutRewritingOpaqueValue() {
        val raw = RemoteJson.parseToJsonElement(
            """{"version":1,"name":"Night shift","policy":"crew-first","future":"kept","roles":[{"id":"builder","label":"Builder","brief":"Build","noEdits":true,"parallel":2,"selection":{"agentKind":"codex","model":"gpt-5","effort":"high","fast":true}}]}""",
        )
        val decoded = decodeReadOnlyCrew(raw)
        assertNotNull(decoded)
        assertEquals("Night shift", decoded?.name)
        assertEquals(false, decoded?.crewOnly)
        assertEquals(2, decoded?.helperCount)
        assertEquals("Builder", decoded?.roles?.single()?.label)
        assertEquals(true, decoded?.roles?.single()?.noEdits)
        assertEquals(true, decoded?.roles?.single()?.fast)
    }

    @Test
    fun malformedRoleEntriesAreSkippedAndMissingCrewIsAbsent() {
        val decoded = decodeReadOnlyCrew(RemoteJson.parseToJsonElement("""{"roles":[null]}"""))
        assertNotNull(decoded)
        assertEquals(0, decoded?.roles?.size)
        assertEquals(null, decodeReadOnlyCrew(null))
    }
}
