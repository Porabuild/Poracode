package com.poracode.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.wirelab.WireLabArgs
import com.poracode.app.wirelab.WireLabControl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Background-task details device journey against the shared wire-lab fixture.
 *
 * The fixture (`tests/native-e2e/fixtures/background-tasks.json`) installs the
 * three neutral tasks `bg-command` / `bg-monitor` / `bg-tool` in the
 * authoritative history snapshot, publishes `background_tasks.changed`
 * replacements for progress and category/command-only updates, drains the
 * roster, and answers the opaque `background-output.test.v1` /
 * `background-stop.test.v1` actions without starting a model turn.
 *
 * The panel is the existing rich-chat controls area; the agreed test tags are
 * owned by the app writers. This class never guesses provider ids or tokens.
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 37)
class BackgroundTaskDetailsInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val application get() = context.applicationContext as PoracodeApplication
    private lateinit var control: WireLabControl
    private var launchedActivity: MainActivity? = null

    private val monitorPurpose = "Watch the fixture server health"
    private val initialMonitorCommand = "node scripts/watch-health.mjs"
    private val updatedMonitorCommand = "node scripts/watch-health.mjs --follow"
    private val updatedProgress = "Watching 3 endpoints: 1 degraded"

    @org.junit.Before
    fun setup() {
        assertEquals(37, Build.VERSION.SDK_INT)
        control = WireLabControl(WireLabArgs.controlBaseUrl(), WireLabArgs.capability())
        application.session.cancelPendingPair()
        control.reset()
    }

    @org.junit.After
    fun tearDown() {
        launchedActivity?.let { instrumentation.runOnMainSync { it.finish() } }
    }

    @Test
    fun backgroundTaskDetailsJourney() {
        pairAndOpenFixtureThread()
        waitForTag("background-tasks-panel", timeoutMs = 15_000)
        waitForTag("background-task-open:bg-monitor")
        waitForTag("background-task-open:bg-command")
        waitForTag("background-task-open:bg-tool")

        compose.onNodeWithTag("background-task-open:bg-monitor").performClick()
        waitForTag("background-task-details", timeoutMs = 10_000, requireDisplayed = true)
        waitForTag("background-task-command")
        waitForTag("background-task-output")
        compose.waitUntil(20_000) {
            countWithinDetails(monitorPurpose) == 1
        }
        assertTrue(
            "the details sheet never named the monitor type",
            countWithinDetails("Monitor", substring = true) > 0,
        )
        compose.waitUntil(20_000) {
            tagText("background-task-command").contains(initialMonitorCommand)
        }
        compose.waitUntil(20_000) { displayedReadOrdinal() != null }
        assertTrue(hasTextSubstring("Watching 3 endpoints"))
        assertFalse(hasText("No progress reported"))
        waitForTag("background-task-stop", requireDisplayed = true)
        compose.waitUntil(20_000) {
            runCatching {
                compose.onNodeWithTag("background-task-stop").assertIsEnabled()
            }.isSuccess
        }

        // A live replacement updates the open sheet (and the reader keeps polling).
        control.setBackgroundTaskStage("progress")
        compose.waitUntil(20_000) { hasText(updatedProgress) }

        control.setBackgroundTaskStage("category-command")
        compose.waitUntil(20_000) {
            tagText("background-task-command").contains(updatedMonitorCommand)
        }

        // Closing the single details sheet stops the poll; a live replacement on
        // the still-visible panel must not trigger another output read.
        compose.onNodeWithTag("background-task-close").performClick()
        compose.waitUntil(20_000) { !tagExists("background-task-details") }
        waitForReadsToSettle()
        val readsAtClose = readCount()
        control.setBackgroundTaskStage("initial")
        compose.waitUntil(20_000) { hasTextSubstring("Watching 3 endpoints") }
        assertEquals("A closed details view must stop output reads", readsAtClose, readCount())

        // An older delayed reply must never replace the newest read after reopen.
        control.delayNextBackgroundTaskOutput(1_200)
        compose.onNodeWithTag("background-task-open:bg-monitor").performClick()
        waitForTag("background-task-details", timeoutMs = 10_000, requireDisplayed = true)
        waitForReads(atLeast = readsAtClose + 1)
        val staleRead = readsAtClose + 1
        compose.onNodeWithTag("background-task-close").performClick()
        compose.waitUntil(20_000) { !tagExists("background-task-details") }
        compose.onNodeWithTag("background-task-open:bg-monitor").performClick()
        waitForTag("background-task-details", timeoutMs = 10_000, requireDisplayed = true)
        waitForDeliveredReads(atLeast = staleRead + 1)
        compose.waitUntil(20_000) { (displayedReadOrdinal() ?: 0) > staleRead }
        assertTrue(
            "a stale older read replaced the newest output",
            (displayedReadOrdinal() ?: 0) > staleRead,
        )

        captureScreenshot()

        // Stop is not blocked and its confirmation replaces the roster.
        compose.onNodeWithTag("background-task-stop").performClick()
        compose.waitUntil(20_000) { !tagExists("background-task-open:bg-monitor") }
        waitForTag("background-task-open:bg-command")
        waitForTag("background-task-open:bg-tool")
        compose.waitUntil(20_000) { stopCount() >= 1 }
        assertTrue(stopCount() >= 1)

        // Drain empties the roster; reconnect re-reads the authoritative empty snapshot.
        control.setBackgroundTaskStage("drain")
        compose.waitUntil(20_000) {
            !tagExists("background-task-open:bg-command") &&
                !tagExists("background-task-open:bg-monitor") &&
                !tagExists("background-task-open:bg-tool")
        }
        val historyReads = control.operationCount("primary", "route:thread-history")
        application.session.onAppBackground()
        compose.waitUntil(30_000) {
            application.session.state.value.socketState !=
                RemoteWebSocketClient.ConnectionState.Online
        }
        // Miss a replayed event while the socket is gone so foregrounding forces
        // an authoritative resync (shell + thread history), not a cached roster.
        control.activateFault("sequence-gap")
        control.emitFrame("event-thread-state")
        application.session.onAppForeground()
        control.waitUntilOperationCount("primary", "route:thread-history", historyReads + 1, 30_000)
        compose.waitUntil(20_000) {
            !tagExists("background-task-open:bg-command") &&
                !tagExists("background-task-open:bg-monitor") &&
                !tagExists("background-task-open:bg-tool")
        }
        assertFalse(hasText(monitorPurpose))
    }

    private fun pairAndOpenFixtureThread() {
        shell("pm grant ${context.packageName} ${Manifest.permission.ACCESS_LOCAL_NETWORK}")
        assertEquals(
            PackageManager.PERMISSION_GRANTED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK),
        )
        val pairing = control.pairingUrl("primary")
        val token = Uri.parse(pairing.getString("pairingUrl")).fragment!!.removePrefix("token=")
        launchDeepLink(
            "poracode://pair?host=" + Uri.encode(WireLabArgs.emulatorAliasBaseUrl()) +
                "#token=" + token,
        )
        if (waitForTextIfPresent(context.getString(R.string.confirm_pair_title), 20_000L)) {
            compose.onNodeWithText(context.getString(R.string.confirm_pair_button)).performClick()
        }
        waitForText("Fixture Project", 30_000L)
        compose.onNodeWithText("Fixture thread").performClick()
        waitForText("Fixture response", 20_000L)
        compose.waitUntil(20_000) {
            application.richChat.chat.state.value.selection?.threadId == "thread-fixture-001"
        }
    }

    private fun launchDeepLink(link: String) {
        launchedActivity = instrumentation.startActivitySync(
            Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        ) as MainActivity
        instrumentation.waitForIdleSync()
    }

    private fun shell(command: String): String {
        val descriptor = instrumentation.uiAutomation.executeShellCommand(command)
        return descriptor.use {
            java.io.FileInputStream(it.fileDescriptor).use { input ->
                input.readBytes().toString(Charsets.UTF_8)
            }
        }
    }

    private fun tagExists(tag: String): Boolean = runCatching {
        compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes()
    }.getOrDefault(emptyList()).isNotEmpty()

    private fun tagText(tag: String): String = runCatching {
        val node = compose.onNodeWithTag(tag).fetchSemanticsNode()
        val text = node.config.getOrNull(SemanticsProperties.Text)
            ?.joinToString(" ") { it.text }.orEmpty()
        val editable = node.config.getOrNull(SemanticsProperties.EditableText)?.text.orEmpty()
        val description = node.config.getOrNull(SemanticsProperties.ContentDescription)
            ?.joinToString(" ").orEmpty()
        listOf(text, editable, description).filter { it.isNotBlank() }.joinToString(" ")
    }.getOrDefault("")

    private fun countWithinDetails(text: String, substring: Boolean = false): Int = runCatching {
        compose.onAllNodes(
            hasText(text, substring = substring) and
                hasAnyAncestor(hasTestTag("background-task-details")),
        ).fetchSemanticsNodes().size
    }.getOrDefault(0)

    private fun hasText(text: String): Boolean = runCatching {
        compose.onAllNodesWithText(text).fetchSemanticsNodes()
    }.getOrDefault(emptyList()).isNotEmpty()

    private fun hasTextSubstring(text: String): Boolean = runCatching {
        compose.onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes()
    }.getOrDefault(emptyList()).isNotEmpty()

    private fun displayedReadOrdinal(): Int? =
        Regex("read (\\d+)").find(tagText("background-task-output"))
            ?.groupValues?.getOrNull(1)?.toIntOrNull()

    private fun waitForTag(tag: String, timeoutMs: Long = 20_000, requireDisplayed: Boolean = false) {
        compose.waitUntil(timeoutMs) {
            runCatching {
                if (requireDisplayed) {
                    compose.onNodeWithTag(tag).assertIsDisplayed()
                } else {
                    compose.onNodeWithTag(tag).assertExists()
                }
            }.isSuccess
        }
    }

    private fun waitForText(text: String, timeoutMs: Long = 30_000) {
        compose.waitUntil(timeoutMs) { hasText(text) }
    }

    private fun waitForTextIfPresent(text: String, timeoutMs: Long): Boolean = runCatching {
        compose.waitUntil(timeoutMs) { hasText(text) }
        true
    }.getOrDefault(false)

    private fun readCount(): Int = backgroundTaskField("outputReads")

    private fun stopCount(): Int = backgroundTaskField("stops")

    private fun backgroundTaskField(field: String): Int =
        control.backgroundTaskState().optInt(field, -1)

    private fun waitForReads(atLeast: Int, timeoutMs: Long = 20_000) {
        compose.waitUntil(timeoutMs) { readCount() >= atLeast }
    }

    private fun waitForDeliveredReads(atLeast: Int, timeoutMs: Long = 20_000) {
        compose.waitUntil(timeoutMs) { backgroundTaskField("outputDelivered") >= atLeast }
    }

    /** Waits for every issued read to resolve before sampling the counter. */
    private fun waitForReadsToSettle(timeoutMs: Long = 20_000) {
        compose.waitUntil(timeoutMs) { backgroundTaskField("outputDelivered") >= readCount() }
    }

    private fun captureScreenshot() {
        // Orchestrator clears app data after each test. Shell-owned evidence
        // survives until CI pulls this exact file after instrumentation ends.
        shell("screencap -p /data/local/tmp/poracode-background-task-details.png")
    }
}
