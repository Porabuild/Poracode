package com.poracode.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.poracode.app.protocol.projects.SessionImportContract
import com.poracode.app.protocol.projects.SessionImportFilter
import com.poracode.app.protocol.richchat.RuntimeItemHeadingRequest
import com.poracode.app.protocol.richchat.RuntimeItemPresentationContract
import com.poracode.app.protocol.settings.RefreshAgentStatusesContract
import com.poracode.app.protocol.voice.HexVoiceContract
import com.poracode.app.ui.homenews.HomeNewsParser
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Checked-in Android runtime instrumentation checks covering the 5 newly wired
 * remote-v3 parity boundaries (item presentations, deferred history item,
 * session import, refreshAgentStatuses, hexVoice) and HomeNews parsing.
 */
@RunWith(AndroidJUnit4::class)
class ParityModulesInstrumentedTest {
    @Test
    fun generatedParityBoundariesWorkOnAndroidRuntime() {
        val req = RuntimeItemHeadingRequest(
            itemId = "item-1",
            inputDigest = "a".repeat(64),
            version = 1,
        )
        val prepared = RuntimeItemPresentationContract.presentationsRequest("thread-1", listOf(req))
        assertTrue(prepared.body.contains("\"item-1\""))

        val historyPath = RuntimeItemPresentationContract.historyItemPath("thread-1", "item-1")
        assertTrue(historyPath.contains("item-1"))

        val sessionsBody = SessionImportContract.encodeListRequest(SessionImportFilter(query = "android"))
        assertTrue(sessionsBody.contains("\"listImportableSessions\""))

        val refreshBody = RefreshAgentStatusesContract.encodeRequest()
        assertTrue(refreshBody.contains("\"refreshAgentStatuses\""))

        val voiceBody = HexVoiceContract.encodeRequest(buildJsonObject { put("action", "setup") })
        assertTrue(voiceBody.contains("\"hexVoice\""))
        val wav = HexVoiceContract.encodePcm16ToWav(shortArrayOf(0, 500, -500, 0))
        assertEquals(52, wav.size)

        val news = HomeNewsParser.parse(
            """{"paused":false,"items":[{"id":"android-tip","kind":"announcement","platforms":["android"],"text":{"en":"Hello Android"}}]}""",
            localeTag = "en-US",
        )
        assertEquals(1, news.items.size)
    }
}
