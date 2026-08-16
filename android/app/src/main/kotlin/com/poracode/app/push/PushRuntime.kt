package com.poracode.app.push

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.poracode.app.BuildConfig
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.storage.SessionCredentials
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PushRuntime(
    private val context: Context,
    private val stateStore: PushClientStateStore,
    private val registration: PushRegistrationCoordinator,
    private val routes: PushRouteCoordinator,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    private val foreground = AtomicBoolean(false)
    private val _uiState = MutableStateFlow(PushUiState(PushAvailability.NotConfigured))
    private var reconcileJob: Job? = null
    val uiState: StateFlow<PushUiState> = _uiState.asStateFlow()

    val isForeground: Boolean get() = foreground.get()

    fun onForeground() {
        foreground.set(true)
        registration.onForeground()
        refreshPermissionState()
        if (permissionAction() == PushPermissionPolicy.Action.Enabled) {
            requestCurrentToken()
            scheduleReconcile()
        }
    }

    fun onBackground() {
        foreground.set(false)
        reconcileJob?.cancel()
        reconcileJob = null
        registration.onBackground()
    }

    fun notePermissionRequestStarted() {
        stateStore.notePermissionRequested()
    }

    fun onPermissionResult() {
        refreshPermissionState()
        if (permissionAction() == PushPermissionPolicy.Action.Enabled) {
            requestCurrentToken()
            scheduleReconcile()
        }
    }

    fun permissionAction(): PushPermissionPolicy.Action {
        if (!BuildConfig.FIREBASE_PUSH_CONFIGURED) {
            return PushPermissionPolicy.Action.Unavailable
        }
        val requested = (stateStore.loadOrCreate() as? PushClientStateLoadResult.Loaded)
            ?.state?.permissionRequested == true
        return PushPermissionPolicy.action(
            configured = true,
            granted = notificationPermissionGranted(),
            previouslyRequested = requested,
        )
    }

    fun onNewToken(token: String) {
        scope.launch {
            if (!registration.onToken(token)) {
                _uiState.value = PushUiState(PushAvailability.StorageUnavailable)
                return@launch
            }
            if (foreground.get() && permissionAction() == PushPermissionPolicy.Action.Enabled) {
                scheduleReconcile()
            }
        }
    }

    fun route(route: PushRouteV1) {
        scope.launch { routes.route(route) }
    }

    val pendingRouteConfirmation: StateFlow<PendingPushRoute?> = routes.pendingConfirmation

    fun confirmPendingRoute() {
        scope.launch { routes.confirmPending() }
    }

    fun cancelPendingRoute() {
        routes.cancelPending()
    }

    suspend fun beforeHostRemoval(
        connectionId: ClientConnectionId,
        credentials: SessionCredentials,
    ) = registration.beforeHostRemoval(connectionId, credentials)

    private fun requestCurrentToken() {
        if (!BuildConfig.FIREBASE_PUSH_CONFIGURED) return
        FirebaseMessaging.getInstance().register()
    }

    private fun scheduleReconcile() {
        reconcileJob?.cancel()
        reconcileJob = scope.launch { _uiState.value = registration.reconcile() }
    }

    private fun refreshPermissionState() {
        val availability = when (permissionAction()) {
            PushPermissionPolicy.Action.Unavailable -> PushAvailability.NotConfigured
            PushPermissionPolicy.Action.Request -> PushAvailability.PermissionRequired
            PushPermissionPolicy.Action.OpenSettings -> PushAvailability.PermissionDenied
            PushPermissionPolicy.Action.Enabled -> {
                when (stateStore.loadOrCreate()) {
                    is PushClientStateLoadResult.Loaded -> PushAvailability.TokenPending
                    else -> PushAvailability.StorageUnavailable
                }
            }
        }
        _uiState.value = PushUiState(availability)
    }

    private fun notificationPermissionGranted(): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
            context,
            PushPermissionPolicy.PERMISSION,
        ) == PackageManager.PERMISSION_GRANTED &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()
}
