package com.poracode.app

import android.app.Application
import android.content.pm.PackageManager
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
import com.poracode.app.push.RepositoryPushHostSource
import com.poracode.app.session.AppSession
import com.poracode.app.session.HeavyReviewInterestSource
import com.poracode.app.session.advancedops.AdvancedOpsProductionComposition
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.richchat.RichChatSessionComposition
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.transport.ProjectRemoteApiClient
import com.poracode.app.transport.ProjectRemoteGatewayFactory
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
    private lateinit var richChatComposition: RichChatSessionComposition
    private val heavyReviewSource = HeavyReviewInterestSource()
    private val runtimeScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onCreate() {
        super.onCreate()
        PushChannels.create(this)
        val repository = HostCatalogCredentialRepository(HostCatalog(this))
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
            clientFactory = PushHostGatewayFactory { endpoint, token ->
                PushHostClient(endpoint, token)
            },
            appVersion = BuildConfig.VERSION_NAME,
            hasEndpointPermission = { endpoint -> hasEndpointPermission(endpoint) },
        )
        session = AppSession(
            credentials = repository,
            hasEndpointPermission = ::hasEndpointPermission,
            beforeHostRemoval = { id, credentials -> push.beforeHostRemoval(id, credentials) },
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
