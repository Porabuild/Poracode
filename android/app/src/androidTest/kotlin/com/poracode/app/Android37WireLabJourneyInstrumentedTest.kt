package com.poracode.app

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.poracode.app.wirelab.WireLabArgs
import com.poracode.app.wirelab.WireLabControl
import com.poracode.app.wirelab.assertObserved
import java.io.FileInputStream
import java.util.regex.Pattern
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.FixMethodOrder
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters

/**
 * End-to-end Android 17 (API 37) instrumentation journey that drives the real native
 * app and its production [com.poracode.app.transport.RemoteApiClient] /
 * [com.poracode.app.transport.RemoteWebSocketClient] against the authenticated
 * loopback native wire lab (the control port uses `adb reverse`; the app host uses
 * the Android emulator's LAN alias so API 37 permission enforcement is real).
 *
 * No fake gateway or socket is used. Each phase journals and asserts the exact
 * HTTP/WS operations observed by bounded polling of secret-free scenario state,
 * never logging tokens, tickets, or the control capability. Cursor and resync
 * probes are read-only, secret-free, and unavailable in the release UI.
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 37)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class Android37WireLabJourneyInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private val application get() = context.applicationContext as PoracodeApplication
    private lateinit var control: WireLabControl
    private var launchedActivity: MainActivity? = null

    private val session get() = application.session

    @Before
    fun setup() {
        assertEquals(37, Build.VERSION.SDK_INT)
        assertEquals("REL", Build.VERSION.CODENAME)
        control = WireLabControl(WireLabArgs.controlBaseUrl(), WireLabArgs.capability())
        session.cancelPendingPair()
        control.reset()
    }

    @org.junit.After
    fun tearDown() {
        launchedActivity?.let { instrumentation.runOnMainSync { it.finish() } }
    }

    @Test
    fun journey1_coldLaunchPairReadyOpenSendLiveInterruptResyncNotificationsDisconnect() {
        // PHASE 0 — exercise the real Android 17 LAN denial, then grant access for the live host.
        shell("pm revoke ${context.packageName} ${Manifest.permission.ACCESS_LOCAL_NETWORK}")
        assertEquals(
            PackageManager.PERMISSION_DENIED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK),
        )
        val environmentBeforeDeny = control.operationCount("primary", "route:environment")
        val pairing = control.pairingUrl("primary")
        val token = Uri.parse(pairing.getString("pairingUrl")).fragment!!.removePrefix("token=")
        val lanHostBaseUrl = WireLabArgs.emulatorAliasBaseUrl()
        launchDeepLink("poracode://pair?host=" + Uri.encode(lanHostBaseUrl) + "#token=" + token)
        waitForText(context.getString(R.string.confirm_pair_title))
        compose.onNodeWithText(context.getString(R.string.confirm_pair_button)).performClick()
        waitForText(context.getString(R.string.local_network_permission_title))
        compose.onNodeWithText(context.getString(R.string.local_network_permission_continue))
            .performClick()
        val deny = device.wait(
            Until.findObject(By.res(Pattern.compile(".*:id/permission_deny_button"))),
            5_000,
        ) ?: device.wait(
            Until.findObject(By.text(Pattern.compile("(?i)don.?t allow|deny"))),
            5_000,
        )
        assertNotNull("Android 17 local-network denial action was not shown", deny)
        deny!!.click()
        waitForText(context.getString(R.string.local_network_permission_denied_title))
        assertEquals(
            "denial blocks all production discovery I/O",
            environmentBeforeDeny,
            control.operationCount("primary", "route:environment"),
        )

        shell("pm grant ${context.packageName} ${Manifest.permission.ACCESS_LOCAL_NETWORK}")
        assertEquals(
            PackageManager.PERMISSION_GRANTED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK),
        )

        // PHASE 1 — resume the one-shot action after grant → ready + fixture shell.
        compose.onNodeWithText(context.getString(R.string.local_network_permission_try_again))
            .performClick()
        val readyOps = listOf(
            "route:environment",
            "route:token-exchange",
            "route:websocket-ticket",
            "route:shell-snapshot",
            "ws-server:ready",
        )
        control.waitUntilObserved(readyOps, 30_000L)
        waitForText("Fixture Project")
        assertObserved(control, readyOps)
        val baselineSeq = assertNotNullOrZero(session.lastSeenSeqForTests())

        // PHASE 2 — open fixture thread and validate authoritative snapshot/history.
        compose.onNodeWithText("Fixture thread").performClick()
        control.waitUntilObserved(listOf("route:thread-history"), 20_000L)
        waitForText("Fixture response")
        assertObserved(control, listOf("route:thread-history"))
        compose.waitUntil(15_000) {
            application.richChat.chat.state.value.selection?.threadId == "thread-fixture-001" &&
                application.richChat.chat.state.value.transcript != null
        }

        // PHASE 3 — send exactly once through the visible production rich-chat composer.
        assertTrue("session:operate scope held for composer", session.state.value.canSessionOperate)
        val beforeSend = session.state.value
        val sendConfig = beforeSend.threadSnapshot?.thread?.config
            ?: beforeSend.snapshot?.threads?.firstOrNull { it.id == beforeSend.openThreadId }?.config
        assertNotNull(
            "thread send config present for open thread ${beforeSend.openThreadId}",
            sendConfig,
        )
        assertNotNull(
            "rich-chat authoritative history supplied the send config",
            application.richChat.chat.state.value.config,
        )
        compose.waitUntil(15_000) {
            runCatching {
                compose.onNodeWithTag("rich_chat_message").assertIsEnabled()
            }.isSuccess
        }
        val sendBefore = control.operationCount("primary", "route:thread-send")
        val interruptBefore = control.operationCount("primary", "route:thread-interrupt")
        compose.onNodeWithContentDescription(context.getString(R.string.rich_chat_message))
            .assertIsDisplayed()
        compose.onNodeWithTag("rich_chat_message")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performTextInput("journey-probe")
        compose.onNodeWithContentDescription(context.getString(R.string.rich_chat_send_message))
            .assertIsDisplayed()
        compose.onNodeWithTag("rich_chat_send_message")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()
        compose.waitUntil(2_000) {
            application.richChat.chat.state.value.failure != null ||
                "send" in application.richChat.chat.state.value.activeOperations ||
                "route:thread-send" in control.observedOperationIds()
        }
        assertEquals(
            "rich-chat send was accepted by the controller",
            null,
            application.richChat.chat.state.value.failure,
        )
        control.waitUntilObserved(listOf("route:thread-send"), 8_000L)
        assertObserved(control, listOf("route:thread-send"))
        assertEquals(
            "one raw send request; production mutations are never retried",
            sendBefore + 1,
            control.operationCount("primary", "route:thread-send"),
        )

        // PHASE 4 — observe a live sequenced update over the real WebSocket.
        val seqBeforeLive = session.lastSeenSeqForTests()!!
        val emitted = control.emitCanonicalReplay("primary", "thread-fixture-001")
        val lastSeq = emitted.getInt("lastSeq")
        compose.waitUntil(20_000) { session.lastSeenSeqForTests() == lastSeq }
        assertObserved(control, listOf("ws-server:event"))
        assertTrue("live cursor advanced", session.lastSeenSeqForTests()!! > seqBeforeLive)
        val liveTurn = control.emitFrame("runtime-live-turn-started")
        val liveTurnSeq = liveTurn.getInt("seq")
        compose.waitUntil(20_000) {
            session.lastSeenSeqForTests() == liveTurnSeq &&
                application.richChat.chat.state.value.transcript?.openTurn == true
        }

        // PHASE 5 — interrupt exactly once through the rich-chat stop control.
        compose.onNodeWithContentDescription(context.getString(R.string.rich_chat_stop_generation))
            .assertIsDisplayed()
        compose.onNodeWithTag("rich_chat_stop_generation")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()
        compose.waitUntil(2_000) {
            application.richChat.chat.state.value.failure != null ||
                "interrupt" in application.richChat.chat.state.value.activeOperations ||
                "route:thread-interrupt" in control.observedOperationIds()
        }
        assertEquals(
            "rich-chat interrupt was accepted by the controller",
            null,
            application.richChat.chat.state.value.failure,
        )
        control.waitUntilObserved(listOf("route:thread-interrupt"), 20_000L)
        assertObserved(control, listOf("route:thread-interrupt"))
        assertEquals(
            "one raw interrupt request; production mutations are never retried",
            interruptBefore + 1,
            control.operationCount("primary", "route:thread-interrupt"),
        )
        val historyBeforeConfirmation = control.operationCount("primary", "route:thread-history")
        compose.onNodeWithContentDescription(
            context.getString(R.string.rich_chat_refresh_transcript),
        ).performClick()
        control.waitUntilOperationCount(
            "primary",
            "route:thread-history",
            historyBeforeConfirmation + 1,
            20_000L,
        )
        compose.onNodeWithContentDescription(context.getString(R.string.rich_chat_back)).performClick()

        // PHASE 6 — background/foreground reconnect from the retained cursor.
        val cursorBeforeBg = session.lastSeenSeqForTests()!!
        val readyBeforeBg = control.operationCount("primary", "ws-server:ready")
        assertEquals(true, session.isForegroundForTests())
        device.pressHome()
        compose.waitUntil(10_000) { !session.isForegroundForTests() }
        relaunchApp()
        compose.waitUntil(15_000) { session.isForegroundForTests() }
        control.waitUntilOperationCount(
            "primary",
            "ws-server:ready",
            readyBeforeBg + 1,
            20_000L,
        )
        val reconnectCursors = control.operationLastSeenSeqs("primary", "ws:connect")
        assertTrue(
            "foreground WebSocket reconnect supplies the retained cursor",
            reconnectCursors.drop(1).contains(cursorBeforeBg),
        )
        assertEquals(
            "foreground reconnect resumes from the cursor, not from seq 0",
            cursorBeforeBg,
            session.lastSeenSeqForTests()!!,
        )
        assertEquals(
            "foreground authoritative recovery clears the socket resync gate",
            false,
            session.socketForTests()?.resyncPending,
        )

        // PHASE 7 — induce a replay gap and verify authoritative recovery.
        val snapshotsBeforeResync = control.operationCount("primary", "route:shell-snapshot")
        val readyBeforeResync = control.operationCount("primary", "ws-server:ready")
        control.emitFrame("resync-required")
        control.waitUntilOperationCount(
            "primary",
            "route:shell-snapshot",
            snapshotsBeforeResync + 1,
            30_000L,
        )
        control.waitUntilOperationCount(
            "primary",
            "ws-server:ready",
            readyBeforeResync + 1,
            20_000L,
        )
        assertEquals(false, session.resyncPendingForTests())
        assertTrue(
            "resync fetched a fresh authoritative shell snapshot",
            control.operationCount("primary", "route:shell-snapshot") > snapshotsBeforeResync,
        )
        assertTrue(
            "authoritative recovery retains the cursor baseline",
            (session.lastSeenSeqForTests() ?: 0) >= baselineSeq,
        )

        // PHASE 8 — notification permission path (observable denial + grant + channel policy).
        val nm = context.getSystemService(NotificationManager::class.java)
        assertEquals(
            NotificationManager.IMPORTANCE_HIGH,
            nm.getNotificationChannel("poracode_attention_v1").importance,
        )
        assertEquals(
            NotificationManager.IMPORTANCE_LOW,
            nm.getNotificationChannel("poracode_status_v1").importance,
        )
        shell("pm revoke ${context.packageName} ${Manifest.permission.POST_NOTIFICATIONS}")
        assertEquals(
            PackageManager.PERMISSION_DENIED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS),
        )
        shell("pm grant ${context.packageName} ${Manifest.permission.POST_NOTIFICATIONS}")
        assertEquals(
            PackageManager.PERMISSION_GRANTED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS),
        )

        // PHASE 9 — the second host never receives primary-host mutations.
        control.seedMultihostCollision()
        assertEquals(0, control.operationCount("collision-b", "route:thread-send"))
        assertEquals(0, control.operationCount("collision-b", "route:thread-interrupt"))

        // PHASE 10 — disconnect returns the app to pairing.
        // The pairing heading is the Pora·code wordmark now, so the landing assertion
        // anchors on the hero subtitle instead of a translated title string.
        compose.onNodeWithContentDescription(context.getString(R.string.disconnect)).performClick()
        waitForText(context.getString(R.string.pair_instructions), 20_000L)
    }

    private fun launchDeepLink(link: String) {
        launchedActivity = instrumentation.startActivitySync(
            Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        ) as MainActivity
        instrumentation.waitForIdleSync()
    }

    private fun relaunchApp() {
        context.startActivity(
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_MAIN
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            },
        )
    }

    private fun assertNotNullOrZero(value: Int?): Int {
        assertNotNull("cursor baseline is set after authoritative snapshot", value)
        return value!!
    }

    private fun shell(command: String): String {
        val descriptor = instrumentation.uiAutomation.executeShellCommand(command)
        return descriptor.use {
            FileInputStream(it.fileDescriptor).use { input ->
                input.readBytes().toString(Charsets.UTF_8)
            }
        }
    }

    private fun waitForText(text: String, timeoutMs: Long = 30_000) {
        compose.waitUntil(timeoutMs) {
            compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }
}
