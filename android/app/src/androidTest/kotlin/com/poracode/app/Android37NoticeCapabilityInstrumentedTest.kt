package com.poracode.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import android.net.Uri
import android.os.Build
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * B1 device journey against the REAL native-e2e production host.
 *
 * The invariant is the F1 correction's contract at the device boundary: the
 * first paired connection's ACTUAL upgrade declaration must match the
 * capability the host's environment descriptor advertised, with no manual or
 * unrelated reconnect, and the same must hold after a normal
 * background/foreground reconnect. On the frozen `dist/main/server.cjs`
 * available here (built before the B1 host composition) the descriptor omits
 * `runtimeHistoryNotices`, so the truthful result is an undeclared socket; on
 * a host that advertises v1 the same test requires the declared socket.
 * UI screenshots are captured for the device evidence trail.
 *
 * The failed-history -> descriptor -> explicit ack -> prefix+notice flow
 * additionally needs a genuine durable gap, which the production host cannot
 * be seeded with from existing tooling (no fault/emit injection, no provider
 * runtime in the disposable namespace); it is proven on the JVM
 * real-transport suites and reported as a device limit, never faked here.
 */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 37)
class Android37NoticeCapabilityInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val application get() = context.applicationContext as PoracodeApplication
    private var launchedActivity: MainActivity? = null

    @After
    fun tearDown() {
        launchedActivity?.let { instrumentation.runOnMainSync { it.finish() } }
    }

    @Test
    fun firstConnectionDeclarationMatchesHostCapabilityAndSurvivesReconnect() {
        assertEquals(37, Build.VERSION.SDK_INT)
        val link = InstrumentationRegistry.getArguments().getString("pairingUrl")
            ?: error("the notice-capability journey requires the 'pairingUrl' instrumentation arg")
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
        Thread.sleep(750L)
        println(
            "NOTICE_CAPABILITY_READY phase=${application.session.state.value.phase} " +
                "socket=${application.session.state.value.socketState} " +
                "profile=${application.session.state.value.profile?.desktopId} " +
                "pending=${application.session.state.value.pendingPairConfirm != null}",
        )
        captureCompose("real-host-first-connection.png")
        captureScreenshot("real-host-first-connection-screen.png")

        // The first upgrade's declaration must match the advertised capability
        // exactly: declared when the host advertises v1, never fabricated when
        // it does not.
        val capable = application.session.state.value.liveRuntimeHistoryNoticeVersions.contains(1)
        assertEquals(
            "the first paired upgrade's declaration must match the advertised capability " +
                "(capable=$capable)",
            capable,
            currentSocket()?.upgradeDeclaredNotices,
        )
        assertTrue(
            "the pairing reached Ready on the real host",
            application.session.state.value.profile != null,
        )

        // Normal reconnect control: background/foreground keeps the same
        // truthful declaration (a capable host re-declares without a loop).
        application.session.onAppBackground()
        application.session.onAppForeground()
        assertTrue(
            "the session never reconnected Online",
            awaitSession(60_000) { state ->
                state.socketState == RemoteWebSocketClient.ConnectionState.Online
            },
        )
        assertEquals(
            "the reconnected socket's declaration must still match the capability",
            application.session.state.value.liveRuntimeHistoryNoticeVersions.contains(1),
            currentSocket()?.upgradeDeclaredNotices,
        )
        Thread.sleep(500L)
        captureCompose("real-host-after-reconnect.png")
        captureScreenshot("real-host-after-reconnect-screen.png")
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
            "NOTICE_CAPABILITY_STATE phase=${state.phase} socket=${state.socketState} " +
                "notices=${state.liveRuntimeHistoryNoticeVersions} " +
                "globalError=${state.globalError} connectionError=${state.connectionError} " +
                "sessionExpired=${state.sessionExpired} profile=${state.profile?.desktopId}",
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
        println("NOTICE_CAPABILITY_COMPOSE_SCREENSHOT=${out.absolutePath}")
    }

    private fun captureScreenshot(name: String) {
        val bitmap: Bitmap = instrumentation.uiAutomation.takeScreenshot()
        val out = File(context.getExternalFilesDir(null), name)
        FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("NOTICE_CAPABILITY_SCREENSHOT=${out.absolutePath}")
    }

    private fun waitForTextIfPresent(text: String, timeoutMs: Long = 5_000L): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (runCatching {
                    compose.onAllNodesWithText(text).fetchSemanticsNodes()
                }.getOrDefault(emptyList()).isNotEmpty()
            ) {
                return true
            }
            Thread.sleep(150L)
        }
        return false
    }

    private fun shell(command: String): String {
        val descriptor = instrumentation.uiAutomation.executeShellCommand(command)
        return descriptor.use {
            java.io.FileInputStream(it.fileDescriptor).use { input ->
                input.readBytes().toString(Charsets.UTF_8)
            }
        }
    }
}
