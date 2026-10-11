package com.poracode.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import com.poracode.app.wirelab.WireLabControl
import com.poracode.app.wirelab.assertObserved
import com.poracode.app.wirelab.operationsObservedCondition

@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 37)
class Android37WireLabSmokeInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private lateinit var control: WireLabControl
    private lateinit var hostBaseUrl: String

    @Before
    fun setup() {
        assertEquals(37, Build.VERSION.SDK_INT)
        val args = androidx.test.platform.app.InstrumentationRegistry.getArguments()
        val controlHost = args.getString("controlHost") ?: "127.0.0.1"
        val controlPort = args.getString("controlPort") ?: "49161"
        val capability = args.getString("capability") ?: error("capability arg required")
        hostBaseUrl = args.getString("hostBaseUrl") ?: "http://127.0.0.1:49160/"
        control = WireLabControl("http://$controlHost:$controlPort", capability)
        (context.applicationContext as PoracodeApplication).session.cancelPendingPair()
        control.reset()
    }

    @Test
    fun coldPairLoopbackReachesReadyAndLoadsFixtureProject() {
        val pairing = control.pairingUrl("primary")
        val token = Uri.parse(pairing.getString("pairingUrl")).fragment!!.removePrefix("token=")
        val deepLink = "poracode://pair?host=" +
            Uri.encode(hostBaseUrl) + "#token=" + token
        instrumentation.startActivitySync(
            Intent(Intent.ACTION_VIEW, Uri.parse(deepLink), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        instrumentation.waitForIdleSync()

        val confirm = context.getString(R.string.confirm_pair_button)
        compose.onNodeWithText(context.getString(R.string.confirm_pair_title)).assertIsDisplayed()
        compose.onNodeWithText(confirm).performClick()

        val expected = listOf(
            "route:environment",
            "route:token-exchange",
            "route:websocket-ticket",
            "route:shell-snapshot",
            "ws-server:ready",
        )
        // Deterministic synchronization seam: wait until the lab observes the real app traffic.
        control.await(operationsObservedCondition(expected), 30_000)

        compose.waitUntil(30_000) {
            compose.onAllNodesWithText("Fixture Project").fetchSemanticsNodes().isNotEmpty()
        }
        assertObserved(control, expected)
    }
}
