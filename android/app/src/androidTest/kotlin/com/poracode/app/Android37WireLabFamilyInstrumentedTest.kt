package com.poracode.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import com.poracode.app.session.AppSession
import com.poracode.app.wirelab.WireLabArgs
import com.poracode.app.wirelab.WireLabControl
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assume
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * V6 E.2: device journeys for steer, permission, terminal keystroke, and git.
 * Pair + send/stop stay in [Android37WireLabJourneyInstrumentedTest]; this
 * class covers the remaining families so `connectedDebugAndroidTest` runs 5/5.
 *
 * The terminal and git journeys run against BOTH peers:
 *  - `mock` (default, CI-fast): the WireLab peer on the API 37 emulator;
 *    assertions poll the mock operation journal. The mock wire lab stays an
 *    EXACT API 37 contract lane (emulator alias, frame fixtures, the
 *    ACCESS_LOCAL_NETWORK shell grant), so every mock method is suppressed
 *    below API 37 and [setup] asserts the exact level.
 *  - `real` (instrumentation args `peerMode=real` plus `pairingUrl`, the real
 *    host deep-link credential; optional `projectLabel`, default
 *    `native-e2e-fixture`): the production headless host. The real host has no
 *    scenario journal or fixture threads, so the journey asserts in-UI
 *    completion against the real peer (`/v1/state` reports `mode=real`) while
 *    the observable PTY-echo / repo-index effects are asserted by the TS
 *    harness (`tests/native-e2e/realHostObservableEffects.test.ts`). Real-peer
 *    methods qualify every release from the app's maintained floor (API 34,
 *    the minSdk) upward, which is what lets them run on physical devices.
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 34)
class Android37WireLabFamilyInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val application get() = context.applicationContext as PoracodeApplication
    private lateinit var control: WireLabControl
    private var launchedActivity: MainActivity? = null

    private val isRealPeer: Boolean =
        InstrumentationRegistry.getArguments().getString("peerMode") == "real"

    private fun realArg(name: String, defaultValue: String): String =
        InstrumentationRegistry.getArguments().getString(name) ?: defaultValue

    @Before
    fun setup() {
        if (isRealPeer) {
            Assume.assumeTrue(
                "real-peer families require the maintained API >= 34 floor",
                Build.VERSION.SDK_INT >= 34,
            )
        } else {
            assertEquals(37, Build.VERSION.SDK_INT)
        }
        control = WireLabControl(WireLabArgs.controlBaseUrl(), WireLabArgs.capability())
        application.session.cancelPendingPair()
        if (!isRealPeer) control.reset()
    }

    @org.junit.After
    fun tearDown() {
        launchedActivity?.let { instrumentation.runOnMainSync { it.finish() } }
    }

    @Test
    @SdkSuppress(minSdkVersion = 37)
    fun familySteerSetsPendingFromComposerDuringLiveTurn() {
        Assume.assumeFalse("steer family drives mock-only frame fixtures", isRealPeer)
        pairAndOpenFixtureThread()
        for (fixture in listOf(
            "runtime-live-turn-started",
            "runtime-live-user-item-started",
            "runtime-live-item-started",
            "runtime-live-content-delta",
        )) {
            control.emitFrame(fixture)
        }
        compose.waitUntil(15_000) {
            application.richChat.chat.state.value.transcript?.openTurn == true
        }
        compose.onNodeWithTag("rich_chat_message")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performTextInput("Family steer")
        compose.onNodeWithTag("rich_chat_send_message")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()
        waitForOperation("route:thread-steer-set")
    }

    @Test
    @SdkSuppress(minSdkVersion = 37)
    fun familyPermissionResolvesOpenedRequest() {
        Assume.assumeFalse("permission family drives mock-only frame fixtures", isRealPeer)
        pairAndOpenFixtureThread()
        control.emitFrame("runtime-live-request-opened")
        compose.waitUntil(15_000) {
            runCatching {
                compose.onNodeWithTag("request_option_allow").assertIsDisplayed()
            }.isSuccess
        }
        waitForEnabledTag("request_option_allow")
        compose.onNodeWithTag("request_option_allow").performClick()
        waitForOperation("route:request-resolve")
    }

    @Test
    fun familyTerminalKeystrokeWritesToPty() {
        pairUntilHome()
        compose.onNodeWithContentDescription(context.getString(R.string.home_more)).performClick()
        compose.onNodeWithTag("home_more_terminal").performScrollTo().performClick()
        if (isRealPeer) {
            // Real host: the seeded project is named, not the mock fixture id.
            val projectLabel = realArg("projectLabel", "native-e2e-fixture")
            compose.waitUntil(15_000) { hasText(projectLabel) }
            compose.onNodeWithText(projectLabel).performClick()
        } else {
            compose.waitUntil(15_000) {
                runCatching {
                    compose.onNodeWithTag("home_utility_project_project-fixture-001").assertIsDisplayed()
                }.isSuccess || hasText("Fixture Project")
            }
            if (runCatching {
                    compose.onNodeWithTag("home_utility_project_project-fixture-001").assertIsDisplayed()
                }.isSuccess
            ) {
                compose.onNodeWithTag("home_utility_project_project-fixture-001").performClick()
            } else {
                compose.onNodeWithText("Fixture Project").performClick()
            }
        }
        if (!isRealPeer) {
            waitForOperation("route:terminal-start")
            waitForOperation("ws-client:terminal-watch")
            waitForOperation("ws-server:terminal-watch-result")
        }
        waitForEnabledTag("terminal_input")
        compose.onNodeWithTag("terminal_input").performTextInput("echo family-pty")
        waitForEnabledTag("terminal_send")
        compose.onNodeWithTag("terminal_send").performClick()
        if (isRealPeer) pollRealPeerState() else {
            waitForOperation("route:terminal-write")
        }
    }

    @Test
    fun familyGitStagesFromWorkspace() {
        pairUntilHome()
        compose.onNodeWithContentDescription(context.getString(R.string.home_more)).performClick()
        compose.onNodeWithTag("home_more_projects").performScrollTo().performClick()
        val projectLabel = if (isRealPeer) realArg("projectLabel", "native-e2e-fixture") else "Fixture Project"
        compose.waitUntil(15_000) { hasText(projectLabel) }
        compose.onNodeWithText(projectLabel).performClick()
        waitForEnabledTag("project_workspace")
        compose.onNodeWithTag("project_workspace").performClick()
        waitForEnabledTag("workspace_git")
        compose.onNodeWithTag("workspace_git").performClick()
        waitForEnabledTag("git_actions_open")
        compose.onNodeWithTag("git_actions_open").performClick()
        waitForEnabledTag("git_stage_all")
        compose.onNodeWithTag("git_stage_all").performClick()
        if (isRealPeer) pollRealPeerState() else {
            waitForOperation("procedure:gitStageAll")
        }
    }

    private fun pairUntilHome() {
        if (!isRealPeer) {
            // The ACCESS_LOCAL_NETWORK shell grant exercises the runtime
            // permission path on the API 37 mock emulator; it stays mock-only
            // because the permission is not grantable this way below the API
            // level that ships it, and real-device peers qualify the
            // user-granted state instead of an instrumentation override.
            shell("pm grant ${context.packageName} ${Manifest.permission.ACCESS_LOCAL_NETWORK}")
            assertEquals(
                PackageManager.PERMISSION_GRANTED,
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK),
            )
        }
        val reusingRealPairing = if (isRealPeer) {
            launchMainActivity()
            compose.waitUntil(30_000) {
                val state = application.session.state.value
                state.hostCatalog.selectedConnectionId != null ||
                    state.phase == AppSession.Phase.NeedsPairing
            }
            application.session.state.value.hostCatalog.selectedConnectionId != null
        } else {
            false
        }
        if (isRealPeer && !reusingRealPairing) {
            val link = InstrumentationRegistry.getArguments().getString("pairingUrl")
                ?: error("a real-peer run requires the 'pairingUrl' instrumentation arg")
            launchDeepLink(link)
        } else if (!isRealPeer) {
            val pairing = control.pairingUrl("primary")
            val token = Uri.parse(pairing.getString("pairingUrl")).fragment!!.removePrefix("token=")
            launchDeepLink(
                "poracode://pair?host=" + Uri.encode(WireLabArgs.emulatorAliasBaseUrl()) +
                    "#token=" + token,
            )
        }
        if (
            !reusingRealPairing &&
            waitForTextIfPresent(context.getString(R.string.confirm_pair_title), timeoutMs = 20_000L)
        ) {
            compose.onNodeWithText(context.getString(R.string.confirm_pair_button)).performClick()
        }
        if (isRealPeer) {
            // The real host seeds no fixture thread; the home sheet entry is
            // the readiness marker.
            compose.waitUntil(30_000) {
                runCatching {
                    compose.onNodeWithContentDescription(context.getString(R.string.home_more))
                        .assertExists()
                }.isSuccess
            }
        } else {
            control.waitUntilObserved(
                listOf(
                    "route:environment",
                    "route:token-exchange",
                    "route:websocket-ticket",
                    "route:shell-snapshot",
                    "ws-server:ready",
                ),
                30_000L,
            )
            waitForText("Fixture Project")
        }
    }

    /** Real-peer completion check: polls the harness control plane until it
     * reports the production peer (`mode=real`); the observable PTY-echo and
     * repo-index effects are asserted harness-side by
     * `tests/native-e2e/realHostObservableEffects.test.ts`. */
    private fun pollRealPeerState(timeoutMs: Long = 20_000L) {
        val deadline = System.currentTimeMillis() + timeoutMs
        var lastMode: String? = null
        var lastError: String? = null
        while (System.currentTimeMillis() < deadline) {
            runCatching {
                val connection =
                    URL("${WireLabArgs.controlBaseUrl()}/v1/state").openConnection() as HttpURLConnection
                connection.setRequestProperty("Authorization", "Harness ${WireLabArgs.capability()}")
                connection.connectTimeout = 5_000
                connection.readTimeout = 10_000
                try {
                    val body = connection.inputStream.bufferedReader().use { it.readText() }
                    lastMode = JSONObject(body).optString("mode", "")
                } finally {
                    connection.disconnect()
                }
            }.onFailure { lastError = it.message }
            if (lastMode == "real") return
            Thread.sleep(150L)
        }
        error("real peer state never observed (lastMode=$lastMode lastError=$lastError)")
    }

    private fun waitForTextIfPresent(text: String, timeoutMs: Long = 5_000L): Boolean {
        return runCatching {
            // Compose's test rule runs the body in a coroutine test scope. A
            // blocking sleep here can starve the app coroutine that publishes
            // a delayed real-host confirmation screen on a cold emulator.
            compose.waitUntil(timeoutMs) { hasText(text) }
            true
        }.getOrDefault(false)
    }

    private fun pairAndOpenFixtureThread() {
        pairUntilHome()
        compose.onNodeWithText("Fixture thread").performClick()
        control.waitUntilObserved(listOf("route:thread-history"), 20_000L)
        waitForText("Fixture response")
        compose.waitUntil(15_000) {
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

    private fun launchMainActivity() {
        launchedActivity = instrumentation.startActivitySync(
            Intent(context, MainActivity::class.java)
                .setAction(Intent.ACTION_MAIN)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        ) as MainActivity
        instrumentation.waitForIdleSync()
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
        compose.waitUntil(timeoutMs) { hasText(text) }
    }

    private fun waitForEnabledTag(tag: String, timeoutMs: Long = 20_000L) {
        compose.waitUntil(timeoutMs) {
            runCatching {
                compose.onNodeWithTag(tag).assertIsDisplayed().assertIsEnabled()
            }.isSuccess
        }
    }

    /** Compose-aware wait: a blocking control-plane poll starves the UI
     * coroutine that must issue the operation being observed. */
    private fun waitForOperation(operation: String, timeoutMs: Long = 20_000L) {
        compose.waitUntil(timeoutMs) {
            // Routes/WS frames have exact arrival entries in operationJournal,
            // while procedure IDs are derived from the host coverage ledger.
            // The consolidated observed set is the common causal surface.
            operation in control.hostObserved("primary")
        }
    }

    private fun hasText(text: String): Boolean = runCatching {
        compose.onAllNodesWithText(text).fetchSemanticsNodes()
    }.getOrDefault(emptyList()).isNotEmpty()
}
