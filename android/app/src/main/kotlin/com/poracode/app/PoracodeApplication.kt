package com.poracode.app

import android.app.Activity
import android.app.Application
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.core.content.ContextCompat
import com.poracode.app.protocol.LocalNetworkAccess
import com.poracode.app.push.AppSessionPushRouteSession
import com.poracode.app.push.PushChannels
import com.poracode.app.push.PushClientStateStore
import com.poracode.app.push.PushHostClient
import com.poracode.app.push.PushHostGatewayFactory
import com.poracode.app.push.PushRegistrationCoordinator
import com.poracode.app.push.PushRouteCoordinator
import com.poracode.app.push.PushRouteHostCatalog
import com.poracode.app.push.PushRuntime
import com.poracode.app.push.PushTokenVault
import com.poracode.app.push.PushUnregisterOutbox
import com.poracode.app.push.RemoteUserNotificationPresentationCenter
import com.poracode.app.push.allowsForegroundNotification
import com.poracode.app.push.RepositoryPushHostSource
import com.poracode.app.session.AppSession
import com.poracode.app.session.HeavyReviewInterestSource
import com.poracode.app.session.advancedops.AdvancedOpsProductionComposition
import com.poracode.app.session.environments.EnvironmentManagementController
import com.poracode.app.session.environments.EnvironmentPairingCoordinator
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.richchat.RichChatSessionComposition
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.ProjectSyncPreferences
import com.poracode.app.storage.SharedPreferencesDeviceSettingsDocumentStore
import com.poracode.app.storage.SharedPreferencesProjectSyncDocumentStore
import com.poracode.app.transport.ProjectRemoteApiClient
import com.poracode.app.transport.ProjectRemoteGatewayFactory
import com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory
import com.poracode.app.transport.environments.StoreEnvironmentAuthorityRegistrar
import com.poracode.app.transport.ProjectWorkspaceRemoteApiClient
import com.poracode.app.transport.ProjectWorkspaceRemoteGatewayFactory
import com.poracode.app.transport.ports.PortForwardRemoteApiClient
import com.poracode.app.transport.ports.PortForwardRemoteGatewayFactory
import com.poracode.app.transport.threads.ThreadLifecycleRemoteApiClient
import com.poracode.app.transport.threads.ThreadLifecycleRemoteGatewayFactory
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsComposition
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsComposition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class PoracodeApplication : Application() {
    lateinit var session: AppSession
        private set
    lateinit var push: PushRuntime
        private set
    lateinit var projects: ProjectSessionRuntime
        private set
    lateinit var ports: PortForwardRuntime
        private set
    lateinit var richChat: RichChatSessionRuntime
        private set
    lateinit var threads: ThreadSessionRuntime
        private set
    lateinit var advanced: AdvancedOpsProductionComposition
        private set
    lateinit var settings: SettingsUiComposition
        private set
    lateinit var remoteIntegrations: RemoteIntegrationsComposition
        private set
    lateinit var settingsIntegrations: SettingsIntegrationsComposition
        private set
    lateinit var browserMirror: BrowserMirrorComposition
        private set
    lateinit var deviceSettings: DeviceSettingsPreferences
        private set
    private lateinit var richChatComposition: RichChatSessionComposition
    private val heavyReviewSource = HeavyReviewInterestSource()
    private val runtimeScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onCreate() {
        super.onCreate()
        PushChannels.create(this)
        deviceSettings = DeviceSettingsPreferences(
            SharedPreferencesDeviceSettingsDocumentStore(this),
        )
        val hostCatalog = HostCatalog(this)
        val environmentAuthorityFactory = CatalogEnvironmentAuthorityFactory(
            parentRecord = { id -> hostCatalog.snapshot().document.host(id) },
            parentToken = { id -> hostCatalog.token(id)?.takeIf(String::isNotBlank) },
        )
        val repository = HostCatalogCredentialRepository(
            hostCatalog,
            environmentAuthorities = StoreEnvironmentAuthorityRegistrar(environmentAuthorityFactory),
        )
        val pushDirectory = noBackupFilesDir.resolve("push").apply { mkdirs() }
        val pushStateStore = PushClientStateStore(
            pushDirectory.resolve(PushClientStateStore.FILE_NAME),
        )
        val registration = PushRegistrationCoordinator(
            configured = BuildConfig.FIREBASE_PUSH_CONFIGURED,
            stateStore = pushStateStore,
            tokenVault = PushTokenVault(pushDirectory.resolve(PushTokenVault.FILE_NAME)),
            outbox = PushUnregisterOutbox(pushDirectory.resolve(PushUnregisterOutbox.FILE_NAME)),
            hosts = RepositoryPushHostSource(repository),
            clientFactory = PushHostGatewayFactory { endpoint, token, parentAuthority ->
                PushHostClient(endpoint, token, parentAuthority = parentAuthority)
            },
            appVersion = BuildConfig.VERSION_NAME,
            hasEndpointPermission = { endpoint -> hasEndpointPermission(endpoint) },
        )
        session = AppSession(
            credentials = repository,
            hasEndpointPermission = ::hasEndpointPermission,
            beforeHostRemoval = { id, credentials -> push.beforeHostRemoval(id, credentials) },
            remoteNotifications = RemoteUserNotificationPresentationCenter { notification ->
                deviceSettings.state.value.allowsForegroundNotification(notification.category)
            },
        )
        projects = ProjectSessionRuntime(
            appState = session.state,
            repository = repository,
            remoteFactory = ProjectRemoteGatewayFactory { endpoint, token ->
                ProjectRemoteApiClient(endpoint, token)
            },
            workspaceRemoteFactory = ProjectWorkspaceRemoteGatewayFactory { endpoint, token ->
                ProjectWorkspaceRemoteApiClient(endpoint, token)
            },
            scope = runtimeScope,
            dispatcher = Dispatchers.IO,
            refreshSnapshot = session::refreshSnapshot,
            syncPreferences = ProjectSyncPreferences(
                SharedPreferencesProjectSyncDocumentStore(this),
            ),
        )
        ports = PortForwardRuntime(
            hostLease = projects.hostLease,
            repository = repository,
            remoteFactory = PortForwardRemoteGatewayFactory { endpoint, token ->
                PortForwardRemoteApiClient(endpoint, token)
            },
            scope = runtimeScope,
            dispatcher = Dispatchers.IO,
        )
        richChatComposition = RichChatSessionComposition(
            appState = session.state,
            repository = repository,
            scope = runtimeScope,
            dispatcher = Dispatchers.IO,
        )
        richChat = richChatComposition.runtime
        threads = ThreadSessionRuntime(
            appState = session.state,
            repository = repository,
            remoteFactory = ThreadLifecycleRemoteGatewayFactory { endpoint, token ->
                ThreadLifecycleRemoteApiClient(endpoint, token)
            },
            scope = runtimeScope,
            dispatcher = Dispatchers.IO,
            refreshSnapshot = session::refreshSnapshot,
        )
        advanced = AdvancedOpsProductionComposition(
            appState = session.state,
            repository = repository,
            scope = runtimeScope,
            dispatcher = Dispatchers.IO,
        )
        settings = SettingsUiComposition(
            appState = session.state,
            repository = repository,
            scope = runtimeScope,
            ioDispatcher = Dispatchers.IO,
            environments = EnvironmentManagementController(
                repository = repository,
                pairingCoordinator = EnvironmentPairingCoordinator(
                    repository = repository,
                    authorityFactory = environmentAuthorityFactory,
                    ioDispatcher = Dispatchers.IO,
                ),
                scope = runtimeScope,
                ioDispatcher = Dispatchers.IO,
            ),
        )
        remoteIntegrations = RemoteIntegrationsComposition(
            appState = session.state,
            repository = repository,
            scope = runtimeScope,
            ioDispatcher = Dispatchers.IO,
        )
        settingsIntegrations = SettingsIntegrationsComposition(
            appState = session.state,
            repository = repository,
            scope = runtimeScope,
            ioDispatcher = Dispatchers.IO,
        )
        browserMirror = BrowserMirrorComposition(
            appState = session.state,
            repository = repository,
            scope = runtimeScope,
            dispatcher = Dispatchers.IO,
            wireSocketProvider = { session.browserMirrorWireSocket() },
            socketGenerationSupplier = { session.browserMirrorSocketGeneration()?.toLong() ?: 0L },
        )
        session.setRichChatEventSink { sequence, event ->
            richChat.applyServerEvent(sequence, event)
        }
        session.setBrowserMirrorEventSink { generation, raw ->
            browserMirror.deliverSocketFrame(generation, raw)
        }
        session.setReplaySideEffectSink { outcome ->
            richChat.handleReplaySideEffect(outcome)
        }
        session.setHeavyReviewTargetSource { heavyReviewSource.current() }
        projects.githubOperations.setHeavyReviewPresenter(heavyReviewSource)
        runtimeScope.launch {
            heavyReviewSource.state.collect { session.recomputeGitInterests() }
        }
        push = PushRuntime(
            context = this,
            stateStore = pushStateStore,
            registration = registration,
            routes = PushRouteCoordinator(
                AppSessionPushRouteSession(session),
            ) {
                val catalog = session.state.value.hostCatalog
                PushRouteHostCatalog(catalog.selectedConnectionId, catalog.hosts)
            },
        )
        registerAppForegroundCallbacks()
    }

    /**
     * Started-activity state for the app-level foreground/background fan-out.
     * Only touched from [ActivityLifecycleCallbacks] on the main thread; the
     * counting rules live in [AppForegroundTracker] so they stay unit-testable.
     */
    private val appForegroundTracker = AppForegroundTracker()

    /**
     * Drives the app-level foreground/background fan-out from the number of
     * started activities instead of any single activity's onStart/onStop.
     *
     * A per-activity observer misattributes lifecycle across a `singleTask`
     * recreate: a pairing deep link launched with FLAG_ACTIVITY_CLEAR_TASK
     * while MainActivity is already up starts the replacement instance before
     * the finishing instance stops, and that delayed onStop lands after the
     * new instance presented the pairing confirmation. Treating it as
     * "app backgrounded" closed the network gate and cleared the pending
     * pair confirmation mid-dialog, stranding the app on onboarding with the
     * confirm card gone. Counting started activities fires the fan-out only
     * on the true 0↔1 crossings, so an instance swap never leaves the app
     * backgrounded while foreground.
     */
    private fun registerAppForegroundCallbacks() {
        registerActivityLifecycleCallbacks(
            object : Application.ActivityLifecycleCallbacks {
                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
                    // A recreation carries saved state; a fresh launch does not,
                    // so it must drop a stale pending-configuration-change marker
                    // (see AppForegroundTracker.onActivityCreated).
                    appForegroundTracker.onActivityCreated(
                        isActivityRecreation = savedInstanceState != null,
                    )
                }

                override fun onActivityStarted(activity: Activity) {
                    if (appForegroundTracker.onStarted() == AppForegroundTracker.Transition.FOREGROUND) {
                        onAppReachedForeground()
                    }
                }

                override fun onActivityStopped(activity: Activity) {
                    if (appForegroundTracker.onStopped(activity.isChangingConfigurations) ==
                        AppForegroundTracker.Transition.BACKGROUND
                    ) {
                        onAppReachedBackground()
                    }
                }

                override fun onActivityDestroyed(activity: Activity) {}

                override fun onActivityPaused(activity: Activity) {}

                override fun onActivityResumed(activity: Activity) {}

                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            },
        )
    }

    private fun onAppReachedForeground() {
        session.onAppForeground()
        onAdvancedOperationsForeground()
        onThreadLifecycleForeground()
        onRichChatForeground()
        onBrowserMirrorForeground()
        push.onForeground()
        settings.onForeground()
    }

    private fun onAppReachedBackground() {
        push.onBackground()
        remoteIntegrations.cancelTransientWork()
        settingsIntegrations.onBackground()
        settings.onBackground()
        onRichChatBackground()
        ports.enterBackground()
        onAdvancedOperationsBackground()
        onBrowserMirrorBackground()
        onThreadLifecycleBackground()
        session.onAppBackground()
    }

    fun onRichChatBackground() = richChatComposition.enterBackground()

    fun onRichChatForeground() = richChatComposition.enterForeground()

    fun onThreadLifecycleBackground() = threads.enterBackground()

    fun onThreadLifecycleForeground() = threads.enterForeground()

    fun onAdvancedOperationsBackground() = advanced.enterBackground()

    fun onAdvancedOperationsForeground() = advanced.enterForeground()

    fun onBrowserMirrorBackground() = browserMirror.enterBackground()

    fun onBrowserMirrorForeground() = browserMirror.enterForeground()

    /**
     * Process teardown. Tears down the browser-mirror composition (controller observer +
     * work + frame/state) deterministically. In production the process reclaims everything
     * on death, but this hook makes cleanup explicit and is what instrumentation tests and
     * emulated environments drive. The composition's [BrowserMirrorController] also closes
     * itself when its scope is cancelled, so this is robust to either path.
     */
    override fun onTerminate() {
        super.onTerminate()
        browserMirror.close()
    }

    private fun hasEndpointPermission(endpoint: String): Boolean =
        !LocalNetworkAccess.shouldRequestPermission(
            endpoint = endpoint,
            targetSdkInt = applicationInfo.targetSdkVersion,
        ) || ContextCompat.checkSelfPermission(
            this,
            LocalNetworkAccess.PERMISSION,
        ) == PackageManager.PERMISSION_GRANTED
}
