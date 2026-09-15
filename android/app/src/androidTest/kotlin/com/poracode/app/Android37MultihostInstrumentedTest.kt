package com.poracode.app

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.FileInputStream
import java.util.regex.Pattern
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 37)
class Android37MultihostInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private var launchedActivity: MainActivity? = null

    @Before
    fun verifyApiContract() {
        assertEquals(37, Build.VERSION.SDK_INT)
        assertEquals(37, context.applicationInfo.targetSdkVersion)
        assertEquals("REL", Build.VERSION.CODENAME)
        (context.applicationContext as PoracodeApplication).session.cancelPendingPair()
    }

    @After
    fun cleanUp() {
        launchedActivity?.let { activity ->
            instrumentation.runOnMainSync { activity.finish() }
        }
        launchedActivity = null
    }

    @Test
    fun coldDeepLinkIsConsumedIntoSanitizedConfirmation() {
        launchDeepLink(publicLink("cold.example", "cold-token"))
        compose.onNodeWithText("Confirm desktop pairing").assertIsDisplayed()
        compose.onNodeWithText("Pair with desktop at cold.example?").assertIsDisplayed()
    }

    @Test
    fun warmDeepLinkReplacesPendingConfirmationWithoutActivityRestart() {
        val activity = instrumentation.startActivitySync(mainIntent()) as MainActivity
        launchedActivity = activity
        instrumentation.runOnMainSync {
            activity.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse(publicLink("warm.example", "warm-token")),
                    activity,
                    MainActivity::class.java,
                ),
            )
        }
        instrumentation.waitForIdleSync()
        compose.onNodeWithText("Confirm desktop pairing").assertIsDisplayed()
        compose.onNodeWithText("Pair with desktop at warm.example?").assertIsDisplayed()
    }

    @Test
    fun accessLocalNetworkDenyAndRevokeStayOnSemanticDeniedUi() {
        assertEquals(
            PackageManager.PERMISSION_DENIED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK),
        )
        launchDeepLink(lanLink("deny-token"))
        compose.onNodeWithText("Confirm").performClick()
        compose.onNodeWithText("Allow local network access?").assertIsDisplayed()
        compose.onNodeWithText("Continue").performClick()

        val device = UiDevice.getInstance(instrumentation)
        val deny = device.wait(
            Until.findObject(By.res(Pattern.compile(".*:id/permission_deny_button"))),
            5_000,
        ) ?: device.wait(
            Until.findObject(By.text(Pattern.compile("(?i)don.?t allow|deny"))),
            5_000,
        )
        assertNotNull("System local-network deny action was not shown", deny)
        deny.click()

        compose.onNodeWithText("Local network access denied").assertIsDisplayed()
        assertEquals(
            PackageManager.PERMISSION_DENIED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK),
        )
    }

    @Test
    fun accessLocalNetworkGrantBypassesRationaleAndStartsPairing() {
        shell("pm grant ${context.packageName} ${Manifest.permission.ACCESS_LOCAL_NETWORK}")
        assertEquals(
            PackageManager.PERMISSION_GRANTED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK),
        )
        launchDeepLink(lanLink("grant-token"))
        compose.onNodeWithText("Confirm").performClick()
        compose.onNodeWithText("Allow local network access?").assertDoesNotExist()
        assertTrue(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_LOCAL_NETWORK,
            ) == PackageManager.PERMISSION_GRANTED,
        )
    }

    @Test
    fun postNotificationsGrantDenyAndRevokeRemainObservable() {
        val channels = context.getSystemService(NotificationManager::class.java)
        assertEquals(
            NotificationManager.IMPORTANCE_HIGH,
            channels.getNotificationChannel("poracode_attention_v1").importance,
        )
        assertEquals(
            NotificationManager.IMPORTANCE_LOW,
            channels.getNotificationChannel("poracode_status_v1").importance,
        )
        assertEquals(null, channels.getNotificationChannel("poracode_status_v1").sound)
        assertEquals(
            PackageManager.PERMISSION_DENIED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS),
        )
        shell("pm grant ${context.packageName} ${Manifest.permission.POST_NOTIFICATIONS}")
        assertEquals(
            PackageManager.PERMISSION_GRANTED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS),
        )
        shell("cmd appops set --uid ${context.packageName} POST_NOTIFICATION ignore")
        assertTrue(
            shell("cmd appops get --uid ${context.packageName} POST_NOTIFICATION").contains("ignore"),
        )
        shell("cmd appops set --uid ${context.packageName} POST_NOTIFICATION allow")
    }

    @Test
    fun coldAndWarmPushExtrasAreBurnedSynchronously() {
        val cold = mainIntent().withPushRoute("11111111-1111-4111-8111-111111111111")
        val activity = instrumentation.startActivitySync(cold) as MainActivity
        launchedActivity = activity
        assertEquals(null, activity.intent.extras)

        instrumentation.runOnMainSync {
            activity.startActivity(
                Intent(activity, MainActivity::class.java)
                    .setAction("com.poracode.app.action.PUSH")
                    .withPushRoute("22222222-2222-4222-8222-222222222222"),
            )
        }
        instrumentation.waitForIdleSync()
        assertEquals(null, activity.intent.extras)
    }

    @Test
    fun unknownHostPushTapIsDroppedWithoutCrossHostConfirmation() {
        // Fresh install has no paired hosts: a routed tap must be dropped
        // deterministically and must never offer the switch-desktop dialog.
        launchedActivity = instrumentation.startActivitySync(
            mainIntent().withPushRoute("11111111-1111-4111-8111-111111111111"),
        ) as MainActivity
        instrumentation.waitForIdleSync()
        compose.onNodeWithText("Open on another desktop?").assertDoesNotExist()
        instrumentation.runOnMainSync {
            launchedActivity?.startActivity(
                Intent(context, MainActivity::class.java)
                    .setAction("com.poracode.app.action.PUSH")
                    .withPushRoute("22222222-2222-4222-8222-222222222222"),
            )
        }
        instrumentation.waitForIdleSync()
        compose.onNodeWithText("Open on another desktop?").assertDoesNotExist()
    }

    private fun mainIntent() = Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_MAIN
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    }

    private fun Intent.withPushRoute(connectionId: String) = apply {
        putExtra("version", "1")
        putExtra("clientConnectionId", connectionId)
        putExtra("desktopId", "desktop-shared")
        putExtra("threadId", "thread-shared")
    }

    private fun deepLinkIntent(link: String) = Intent(
        Intent.ACTION_VIEW,
        Uri.parse(link),
        context,
        MainActivity::class.java,
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)

    private fun launchDeepLink(link: String) {
        launchedActivity = instrumentation.startActivitySync(deepLinkIntent(link)) as MainActivity
        instrumentation.waitForIdleSync()
    }

    private fun publicLink(host: String, token: String): String =
        "poracode://pair?host=https%3A%2F%2F$host%2F#token=$token"

    private fun lanLink(token: String): String =
        "poracode://pair?host=http%3A%2F%2F192.168.50.25%3A49152%2F#token=$token"

    private fun shell(command: String): String {
        val descriptor = instrumentation.uiAutomation.executeShellCommand(command)
        return descriptor.use { FileInputStream(it.fileDescriptor).use { input ->
            input.readBytes().toString(Charsets.UTF_8)
        } }
    }
}
