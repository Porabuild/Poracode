package com.poracode.app

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.poracode.remote.v3.generated.RemotePairingMachine
import com.poracode.app.protocol.LocalNetworkAccess
import com.poracode.app.protocol.LocalNetworkPermissionUi
import com.poracode.app.push.PushIntentBridge
import com.poracode.app.push.PushPayloadParseResult
import com.poracode.app.push.PushPermissionPolicy
import com.poracode.app.ui.PoracodeApp
import com.poracode.app.session.SessionPolicies
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Single native activity hosting Compose. No WebView, no embedded web renderer.
 *
 * Deep links: cold [Intent.getData] in [onCreate] and warm [onNewIntent].
 * Pairing data is one-shot: [Intent.setData] is cleared after consume so
 * rotation/recreation cannot re-redeem a burned pairing token.
 * Secrets never enter saved instance state.
 *
 * **Security:** every externally delivered Intent URL is treated as external
 * (`external=true` unconditionally). Explicit MAIN/data intents cannot bypass
 * confirmation. Only direct in-app manual form calls pair() without confirmation.
 */
class MainActivity : ComponentActivity() {
    private val localNetworkPermissionUi = MutableStateFlow(LocalNetworkPermissionUi())
    private var pendingLocalNetworkAction: (() -> Unit)? = null
    private val localNetworkPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        localNetworkPermissionUi.value = LocalNetworkPermissionUi(
            status = if (granted) {
                LocalNetworkPermissionUi.Status.Granted
            } else {
                LocalNetworkPermissionUi.Status.Denied
            },
            sanitizedHost = localNetworkPermissionUi.value.sanitizedHost,
        )
        if (granted) pendingLocalNetworkAction?.invoke()
        if (granted) pendingLocalNetworkAction = null
    }
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        (application as PoracodeApplication).push.onPermissionResult()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as PoracodeApplication

        // App-level foreground/background fan-out (session, push, ports, rich
        // chat, ...) is driven by PoracodeApplication's started-activity count,
        // not this instance's onStart/onStop: a singleTask recreate from a
        // pairing deep link starts the replacement instance before this
        // finishing instance stops, and an onStop-based signal would background
        // the app mid-dialog.
        setContent {
            PoracodeApp(
                session = app.session,
                projects = app.projects,
                ports = app.ports,
                richChat = app.richChat,
                threads = app.threads,
                advanced = app.advanced,
                settings = app.settings,
                remoteIntegrations = app.remoteIntegrations,
                settingsIntegrations = app.settingsIntegrations,
                browserMirror = app.browserMirror,
                deviceSettings = app.deviceSettings,
                localNetworkPermissionUi = localNetworkPermissionUi,
                requestLocalNetworkPermission = ::requestLocalNetworkPermission,
                continueLocalNetworkPermission = ::continueLocalNetworkPermission,
                dismissLocalNetworkPermission = ::dismissLocalNetworkPermission,
                pushUiState = app.push.uiState,
                onPushAction = ::handlePushAction,
                pendingPushRoute = app.push.pendingRouteConfirmation,
                onConfirmPushRoute = app.push::confirmPendingRoute,
                onCancelPushRoute = app.push::cancelPendingRoute,
                openExternalUrl = { url ->
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                },
                onThemeDarkChanged = ::updateSystemBarAppearance,
            )
        }

        // Process-level once: subsequent Activity recreations no-op.
        if (!app.session.isBootstrappedForTests()) app.session.bootstrap()
        consumePushIntent(intent)
        consumePairingIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumePushIntent(intent)
        consumePairingIntent(intent)
    }

    /**
     * One-shot deep-link consume: extract pairing URL, **burn Intent.data before
     * any async dispatch**, then hand off to session with external=true always.
     */
    private fun consumePairingIntent(intent: Intent?) {
        if (intent == null) return
        val data = RemotePairingMachine.extractPairingData(intent.dataString) ?: return
        // Burn the intent data immediately (one-shot) so rotation cannot re-redeem.
        intent.data = null
        setIntent(intent)
        // Unconditionally external — MAIN/data intents cannot bypass confirmation.
        (application as PoracodeApplication).session.handleIncomingPairingUrl(
            raw = data,
            external = true,
        )
    }

    private fun requestLocalNetworkPermission(endpoint: String, action: () -> Unit) {
        if (!LocalNetworkAccess.shouldRequestPermission(
                endpoint = endpoint,
                targetSdkInt = applicationInfo.targetSdkVersion,
            ) || ContextCompat.checkSelfPermission(
                this,
                LocalNetworkAccess.PERMISSION,
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            action()
            return
        }
        pendingLocalNetworkAction = action
        localNetworkPermissionUi.value = LocalNetworkPermissionUi(
            status = LocalNetworkPermissionUi.Status.Rationale,
            sanitizedHost = SessionPolicies.sanitizedHostLabel(endpoint),
        )
    }

    private fun continueLocalNetworkPermission() {
        if (pendingLocalNetworkAction == null) return
        localNetworkPermissionLauncher.launch(LocalNetworkAccess.PERMISSION)
    }

    private fun dismissLocalNetworkPermission() {
        pendingLocalNetworkAction = null
        localNetworkPermissionUi.value = LocalNetworkPermissionUi()
    }

    private fun consumePushIntent(intent: Intent?) {
        val parsed = PushIntentBridge.consume(intent)
        if (intent != null) setIntent(intent)
        val route = (parsed as? PushPayloadParseResult.Routed)?.route ?: return
        (application as PoracodeApplication).push.route(route)
    }

    private fun handlePushAction() {
        val push = (application as PoracodeApplication).push
        when (push.permissionAction()) {
            PushPermissionPolicy.Action.Request -> {
                push.notePermissionRequestStarted()
                notificationPermissionLauncher.launch(PushPermissionPolicy.PERMISSION)
            }
            PushPermissionPolicy.Action.OpenSettings -> startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", packageName, null),
                ),
            )
            else -> Unit
        }
    }

    private fun updateSystemBarAppearance(dark: Boolean) {
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
}
