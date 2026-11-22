package com.poracode.app.protocol

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.protocol.projects.ImportableCliSession
import com.poracode.app.protocol.projects.SessionImportContract
import com.poracode.app.protocol.projects.SessionImportFilter
import com.poracode.app.protocol.richchat.RuntimeItemHeadingRequest
import com.poracode.app.protocol.richchat.RuntimeItemPresentationContent
import com.poracode.app.protocol.richchat.RuntimeItemPresentationContract
import com.poracode.app.protocol.settings.RefreshAgentStatusesContract
import com.poracode.app.protocol.voice.HexVoiceContract
import com.poracode.app.ui.homenews.HomeNewsAction
import com.poracode.app.ui.homenews.HomeNewsParser
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ParityModulesTest {
    @Test
    fun itemPresentationRequestAndHeadingsValidateThroughGeneratedCodecs() {
        val req = RuntimeItemHeadingRequest(
            itemId = "item-1",
            inputDigest = "a".repeat(64),
            version = 1,
        )
        val prepared = RuntimeItemPresentationContract.presentationsRequest("thread-1", listOf(req))
        assertEquals("thread-1", prepared.pathValues["threadId"])
        assertTrue(prepared.body.contains("\"item-1\""))
        assertEquals(3, RuntimeItemPresentationContract.presentationsQuery().size)

        val historyPath = RuntimeItemPresentationContract.historyItemPath("thread-1", "item-1")
        assertTrue(historyPath.contains("thread-1"))
        assertTrue(historyPath.contains("item-1"))
        assertEquals(3, RuntimeItemPresentationContract.historyItemQuery().size)

        val heading = RuntimeItemPresentationContract.decodeHeading(
            buildJsonObject {
                put("title", "Run tests")
                put("command", "bun run test")
                put("badge", "CMD")
            },
        )
        assertNotNull(heading)
        assertEquals("Run tests", heading?.title)
        assertEquals("CMD", heading?.badge)
    }

    @Test
    fun itemPresentationRejectsOversizedPayload() {
        val huge = ByteArray(RuntimeItemPresentationContract.MAX_PRESENTATION_BYTES + 1)
        assertTrue(
            runCatching {
                RuntimeItemPresentationContract.parsePresentationRows(
                    huge,
                    expectedVersion = 1,
                    content = RuntimeItemPresentationContent.Header,
                )
            }.isFailure,
        )
    }

    @Test
    fun sessionImportContractEncodesFiltersAndResolvesModel() {
        val body = SessionImportContract.encodeListRequest(SessionImportFilter(agentKind = "claude", query = "fix"))
        assertTrue(body.contains("\"listImportableSessions\""))
        val session = ImportableCliSession(
            id = "s1",
            agentKind = "claude",
            providerSessionId = "p1",
            path = "/tmp/s1.jsonl",
            cwd = "/work/app",
            preview = "Fix Android layout",
            model = "claude-opus-4-7",
        )
        assertTrue(SessionImportFilter(agentKind = "claude", query = "android").includes(session))
        assertFalse(SessionImportFilter(agentKind = "codex").includes(session))

        val agent = AgentStatusEntry(
            identityKey = AgentStatusEntry.identityKey("claude", AgentStatusEntry.ENV_POSIX, ""),
            kind = "claude",
            label = "Claude",
            installed = true,
            version = "2.1",
            authState = "authenticated",
            envKind = AgentStatusEntry.ENV_POSIX,
            envDistro = "",
            raw = buildJsonObject {
                put(
                    "capabilities",
                    buildJsonObject {
                        putJsonArray("models") {
                            add(buildJsonObject { put("id", "claude-opus-4-7") })
                        }
                    },
                )
            },
        )
        assertEquals("claude-opus-4-7", SessionImportContract.resolveModel(session, null, listOf(agent)))
    }

    @Test
    fun refreshAgentStatusesContractEncodesCanonicalProcedureCall() {
        val body = RefreshAgentStatusesContract.encodeRequest()
        assertTrue(body.contains("\"refreshAgentStatuses\""))
    }

    @Test
    fun hexVoiceContractEncodesRequestAndRiffWavHeader() {
        val body = HexVoiceContract.encodeRequest(buildJsonObject { put("action", "setup") })
        assertTrue(body.contains("\"hexVoice\""))

        val wav = HexVoiceContract.encodePcm16ToWav(shortArrayOf(0, 1000, -1000, 0))
        assertEquals(44 + 8, wav.size)
        assertEquals("RIFF", String(wav, 0, 4, Charsets.US_ASCII))
        assertEquals("WAVE", String(wav, 8, 4, Charsets.US_ASCII))
    }

    @Test
    fun homeNewsParserValidatesHttpsLocaleFallbackAndPlatforms() {
        val raw = """
            {
              "paused": false,
              "items": [
                {
                  "id": "android-adaptive-2026",
                  "kind": "announcement",
                  "platforms": ["android"],
                  "text": { "en": "Try split view on tablets", "de": "Split-View auf Tablets testen" },
                  "action": { "type": "url", "url": "https://poracode.com/changelog" },
                  "weight": 3
                },
                {
                  "id": "bad-http",
                  "kind": "announcement",
                  "text": { "en": "Insecure" },
                  "action": { "type": "url", "url": "http://example.com" }
                }
              ]
            }
        """.trimIndent()
        val parsed = HomeNewsParser.parse(raw, localeTag = "de-DE")
        assertEquals(2, parsed.items.size)
        assertEquals("Split-View auf Tablets testen", parsed.items[0].text)
        assertTrue(parsed.items[0].action is HomeNewsAction.OpenUrl)
        assertEquals(null, parsed.items[1].action)
    }
}
