package com.poracode.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import com.poracode.app.session.AppSession
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient
import java.io.File
import java.io.FileOutputStream
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * B1 CAPABLE-HOST device journey (companion to the native-e2e runner
 * `tests/native-e2e/helpers/androidCapableHistoryJourney.ts`).
 *
 * The host it pairs to is a disposable headless production host seeded with a
 * GUI thread whose retained canonical prefix is followed by genuine durable
 * crash evidence. The journey is the full contract at the device boundary:
 *
 *   descriptor-advertised capability (v1) -> declared upgrade
 *   -> failed declared history -> visible recovery action
 *   -> explicit acknowledgement -> retained prefix + durable notice
 *   -> a real supervisor-originated canonical append from the structured ACP
 *      stand-in -> reconnect that keeps the notice and the content.
 *
 * This test never accepts `capable == declared == false`: a host that does not
 * advertise `runtimeHistoryNotices` v1 fails immediately.
 *
 * Instrumentation args:
 *   pairingUrl            required; one-time real-host pairing link
 *   prefixMarker          required; shared marker prefix of the retained items
 *   userPrefixMarker      required; exact rendered text of the retained user item
 *   assistantPrefixMarker required; exact rendered text of the retained assistant item
 *   liveMarker            required; final marker of the fixture's live append
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 37)
class Android37CapableHistoryJourneyInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val application get() = context.applicationContext as PoracodeApplication
    private var launchedActivity: MainActivity? = null

    private val prefixMarker: String
        get() = InstrumentationRegistry.getArguments().getString("prefixMarker")
            ?: error("the capable-history journey requires the 'prefixMarker' instrumentation arg")

    /** Exact rendered text of the retained user prefix item. */
    private val userPrefixMarker: String
        get() = InstrumentationRegistry.getArguments().getString("userPrefixMarker")
            ?: error(
                "the capable-history journey requires the 'userPrefixMarker' instrumentation arg",
            )

    /** Exact rendered text of the retained assistant prefix item. */
    private val assistantPrefixMarker: String
        get() = InstrumentationRegistry.getArguments().getString("assistantPrefixMarker")
            ?: error(
                "the capable-history journey requires the 'assistantPrefixMarker' instrumentation arg",
            )

    private val liveMarker: String
        get() = InstrumentationRegistry.getArguments().getString("liveMarker")
            ?: error("the capable-history journey requires the 'liveMarker' instrumentation arg")

    @After
    fun tearDown() {
        launchedActivity?.let { instrumentation.runOnMainSync { it.finish() } }
    }

    @Test
    fun capableHostFailedHistoryAckPrefixLiveAppendAndReconnect() {
        assertEquals(37, Build.VERSION.SDK_INT)
        val link = InstrumentationRegistry.getArguments().getString("pairingUrl")
            ?: error("the capable-history journey requires the 'pairingUrl' instrumentation arg")
        assertEquals(
            PackageManager.PERMISSION_GRANTED,
            run {
                shell("pm grant ${context.packageName} ${Manifest.permission.ACCESS_LOCAL_NETWORK}")
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_LOCAL_NETWORK,
                )
            },
        )
        launchedActivity = instrumentation.startActivitySync(
            Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        ) as MainActivity
        instrumentation.waitForIdleSync()
        if (waitForTextIfPresent(context.getString(R.string.confirm_pair_title))) {
            compose.onNodeWithText(context.getString(R.string.confirm_pair_button)).performClick()
        }
        assertTrue(
            "the paired session never reached a live Online socket",
            awaitSession(60_000) { state ->
                state.phase == AppSession.Phase.Ready &&
                    state.socketState == RemoteWebSocketClient.ConnectionState.Online
            },
        )
        compose.waitUntil(5_000) { application.session.state.value.pendingPairConfirm == null }

        // 1. Capability gate: the host MUST advertise runtimeHistoryNotices v1
        // and the first upgrade MUST declare it. No false==false pass.
        assertTrue(
            "the host must advertise runtimeHistoryNotices v1 for this journey " +
                "(notices=${application.session.state.value.liveRuntimeHistoryNoticeVersions})",
            application.session.state.value.liveRuntimeHistoryNoticeVersions.contains(1),
        )
        assertEquals(
            "the capable host's upgrade must declare notices=v1",
            true,
            currentSocket()?.upgradeDeclaredNotices,
        )
        println(
            "CAPABLE_HISTORY_UI_CAPABLE versions=" +
                "${application.session.state.value.liveRuntimeHistoryNoticeVersions} " +
                "declared=${currentSocket()?.upgradeDeclaredNotices}",
        )
        captureCompose("capable-history-paired.png")

        // 2. Open the seeded GUI thread: the fenced declared read fails and the
        // truthful suspect descriptor becomes the visible recovery action.
        waitForText(THREAD_TITLE, 60_000)
        compose.onNodeWithText(THREAD_TITLE).performClick()
        compose.waitUntil(60_000) {
            application.richChat.chat.state.value.historyNotice.descriptor != null
        }
        val descriptor = application.richChat.chat.state.value.historyNotice.descriptor!!
        assertEquals("suspect", descriptor.source)
        assertEquals("unclean-epoch", descriptor.reason)
        waitForText(context.getString(R.string.rich_chat_history_notice_title), 30_000)
        waitForText(context.getString(R.string.rich_chat_history_notice_ack), 30_000)
        assertTrue(
            "the blocked transcript must not paint the retained prefix before the ack",
            !transcriptContains(prefixMarker) &&
                !timelineRendersText(userPrefixMarker) &&
                !timelineRendersText(assistantPrefixMarker),
        )
        println(
            "CAPABLE_HISTORY_UI_DESCRIPTOR source=${descriptor.source} reason=${descriptor.reason} " +
                "refusedEvents=${descriptor.refusedEvents} refusedBytes=${descriptor.refusedBytes} " +
                "token=${descriptor.token.take(6)}…",
        )
        captureCompose("capable-history-banner.png")
        captureScreenshot("capable-history-banner-screen.png")

        // 3. Explicit acknowledgement through the visible action.
        compose.onNodeWithText(context.getString(R.string.rich_chat_history_notice_ack))
            .assertIsDisplayed()
            .performClick()
        println("CAPABLE_HISTORY_UI_ACK_TAPPED")
        compose.waitUntil(60_000) {
            val notice = application.richChat.chat.state.value.historyNotice
            notice.notice != null && notice.descriptor == null
        }
        val notice = application.richChat.chat.state.value.historyNotice.notice!!
        assertEquals("history-incomplete", notice.kind)
        assertEquals("suspect", notice.source)
        assertEquals("unclean-epoch", notice.reason)
        assertEquals(1L, notice.acknowledgedCount)

        // 4. Retained prefix plus persistent notice, proven on the RENDERED
        // Compose tree: both prefix cards (user and assistant) must be found by
        // scrolling the real timeline, so the pre-fix blank user card cannot
        // pass behind the assistant marker. Raw transcript state supplements.
        assertTrue(
            "the retained user prefix must be rendered in the timeline after the ack",
            awaitRenderedTimelineText(userPrefixMarker, 60_000),
        )
        assertTrue(
            "the retained assistant prefix must be rendered in the timeline after the ack",
            awaitRenderedTimelineText(assistantPrefixMarker, 60_000),
        )
        assertTextVisible(context.getString(R.string.rich_chat_history_notice_title))
        assertTrue(
            "the acknowledgement action must be gone once the descriptor cleared",
            !hasText(context.getString(R.string.rich_chat_history_notice_ack)),
        )
        println(
            "CAPABLE_HISTORY_UI_PREFIX_VISIBLE user=$userPrefixMarker " +
                "assistant=$assistantPrefixMarker rendered=true",
        )
        println("CAPABLE_HISTORY_UI_NOTICE_RETAINED acknowledgedCount=${notice.acknowledgedCount}")
        captureCompose("capable-history-after-ack.png")
        captureScreenshot("capable-history-after-ack-screen.png")

        assertTrue(
            "the exact live done marker must be rendered after the supervisor-originated append",
            awaitRenderedTimelineText(liveMarker, 180_000),
        )
        assertTrue(
            "the retained user prefix must still be rendered after the live append",
            timelineRendersText(userPrefixMarker),
        )
        assertTrue(
            "the retained assistant prefix must still be rendered after the live append",
            timelineRendersText(assistantPrefixMarker),
        )
        assertTextVisible(context.getString(R.string.rich_chat_history_notice_title))
        println("CAPABLE_HISTORY_UI_LIVE_VISIBLE marker=$liveMarker rendered=true")
        captureCompose("capable-history-live-append.png")
        captureScreenshot("capable-history-live-append-screen.png")

        // 5. Normal reconnect keeps capability, notice and content.
        compose.waitUntil(30_000) {
            application.session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online
        }
        application.session.onAppBackground()
        compose.waitUntil(30_000) {
            application.session.state.value.socketState != RemoteWebSocketClient.ConnectionState.Online ||
                !application.session.isForegroundForTests()
        }
        application.session.onAppForeground()
        assertTrue(
            "the session never reconnected Online",
            awaitSession(60_000) { state ->
                state.socketState == RemoteWebSocketClient.ConnectionState.Online
            },
        )
        assertEquals(
            "the reconnected socket must still declare notices=v1",
            true,
            currentSocket()?.upgradeDeclaredNotices,
        )
        val retainedInPlace = timelineRendersText(userPrefixMarker) &&
            timelineRendersText(assistantPrefixMarker) &&
            timelineRendersText(liveMarker) &&
            hasText(context.getString(R.string.rich_chat_history_notice_title))
        if (!retainedInPlace) {
            // The background round-trip restored the home surface: return
            // through the real rich-chat back control when it is mounted, then
            // re-open the thread from its catalog row. The host stays the
            // authoritative source; nothing is asserted from a local cache.
            if (hasContentDescription(context.getString(R.string.rich_chat_back))) {
                compose.onAllNodesWithContentDescription(context.getString(R.string.rich_chat_back))
                    .onFirst()
                    .performClick()
            }
            compose.waitUntil(30_000) { hasText(THREAD_TITLE) }
            compose.onNodeWithText(THREAD_TITLE).performClick()
        }
        compose.waitUntil(60_000) {
            timelineRendersText(userPrefixMarker) &&
                timelineRendersText(assistantPrefixMarker) &&
                timelineRendersText(liveMarker)
        }
        waitForText(context.getString(R.string.rich_chat_history_notice_title), 30_000)
        val reconnected = application.richChat.chat.state.value.historyNotice
        assertTrue(
            "the durable notice must survive the reconnect (descriptor=${reconnected.descriptor})",
            reconnected.notice != null,
        )
        println(
            "CAPABLE_HISTORY_UI_RECONNECT_RETAINED notice=${reconnected.notice != null} " +
                "prefixUser=${timelineRendersText(userPrefixMarker)} " +
                "prefixAssistant=${timelineRendersText(assistantPrefixMarker)} " +
                "live=${timelineRendersText(liveMarker)} " +
                "declared=${currentSocket()?.upgradeDeclaredNotices} inPlace=$retainedInPlace",
        )
        captureCompose("capable-history-reconnect.png")
        captureScreenshot("capable-history-reconnect-screen.png")
    }

    private fun transcriptContains(token: String): Boolean {
        val transcript = application.richChat.chat.state.value.transcript ?: return false
        return transcript.itemsInOrder.any { item ->
            item.streams.values.any { it.contains(token) } ||
                (item.payload?.toString()?.contains(token) == true)
        }
    }

    /**
     * Rendered-evidence probe. Scrolls the real rich-chat timeline
     * (`rich_chat_timeline_description`) to a node containing [text] and
     * requires that node to be displayed. Raw transcript state is never a
     * substitute: a virtualized item and the pre-fix blank user card both fail
     * here even while the payload contains the text.
     */
    private fun timelineRendersText(text: String): Boolean = runCatching {
        compose.onAllNodesWithContentDescription(timelineDescription)
            .onFirst()
            .performScrollToNode(hasText(text, substring = true))
        compose.onAllNodesWithText(text, substring = true)
            .onFirst()
            .assertIsDisplayed()
        true
    }.getOrDefault(false)

    private fun awaitRenderedTimelineText(text: String, timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (timelineRendersText(text)) return true
            Thread.sleep(200L)
        }
        return false
    }

    private inline fun awaitSession(
        timeoutMs: Long,
        predicate: (AppSession.UiState) -> Boolean,
    ): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (predicate(application.session.state.value)) return true
            Thread.sleep(200L)
        }
        val state = application.session.state.value
        println(
            "CAPABLE_HISTORY_UI_STATE phase=${state.phase} socket=${state.socketState} " +
                "notices=${state.liveRuntimeHistoryNoticeVersions} " +
                "globalError=${state.globalError} connectionError=${state.connectionError}",
        )
        return false
    }

    private fun currentSocket(): RemoteEventSocket? {
        // Kotlin mangles the internal accessor name; resolve it structurally.
        val method = AppSession::class.java.declaredMethods.firstOrNull {
            it.name.startsWith("socketForTests") && it.parameterCount == 0
        } ?: return null
        method.isAccessible = true
        return method.invoke(application.session) as? RemoteEventSocket
    }

    private fun captureCompose(name: String) {
        val bitmap: Bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        val out = File(context.getExternalFilesDir(null), name)
        FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("CAPABLE_HISTORY_UI_SCREENSHOT=${out.absolutePath}")
    }

    private fun captureScreenshot(name: String) {
        val bitmap: Bitmap = instrumentation.uiAutomation.takeScreenshot()
        val out = File(context.getExternalFilesDir(null), name)
        FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("CAPABLE_HISTORY_UI_SCREENSHOT=${out.absolutePath}")
    }

    private fun hasContentDescription(description: String): Boolean = runCatching {
        compose.onAllNodesWithContentDescription(description).fetchSemanticsNodes()
    }.getOrDefault(emptyList()).isNotEmpty()

    private fun waitForText(text: String, timeoutMs: Long = 30_000) {
        compose.waitUntil(timeoutMs) { hasText(text) }
    }

    /** Semantics anchor of the real rich-chat LazyColumn. */
    private val timelineDescription: String
        get() = context.getString(R.string.rich_chat_timeline_description)

    private fun assertTextVisible(text: String) {
        assertTrue("expected visible text: $text", hasText(text))
    }

    private fun waitForTextIfPresent(text: String, timeoutMs: Long = 5_000L): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (hasText(text)) return true
            Thread.sleep(150L)
        }
        return false
    }

    /**
     * Zero-root-tolerant probes: dismissing the API 37 local-network dialog can
     * transiently detach every Compose window, so a missing hierarchy is "not
     * yet", never an immediate abort.
     */
    private fun hasText(text: String): Boolean = runCatching {
        compose.onAllNodesWithText(text).fetchSemanticsNodes()
    }.getOrDefault(emptyList()).isNotEmpty()

    private fun shell(command: String): String {
        val descriptor = instrumentation.uiAutomation.executeShellCommand(command)
        return descriptor.use {
            java.io.FileInputStream(it.fileDescriptor).use { input ->
                input.readBytes().toString(Charsets.UTF_8)
            }
        }
    }

    private companion object {
        /** Seeded GUI thread title the device opens from the real catalog. */
        const val THREAD_TITLE = "Capable history fixture thread"
    }
}
