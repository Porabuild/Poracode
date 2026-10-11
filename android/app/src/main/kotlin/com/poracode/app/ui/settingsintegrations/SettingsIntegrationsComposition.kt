package com.poracode.app.ui.settingsintegrations

import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteProject
import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceRequest
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryRequest
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.SkillEntry
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.session.AppSession
import com.poracode.app.session.settingsintegrations.GeneratedSettingsIntegrationsSessionGateway
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsController
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsLease
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.settingsintegrations.RepositorySettingsIntegrationsProvider
import com.poracode.app.transport.settingsintegrations.SettingsIntegrationsRemoteApiClient
import com.poracode.app.transport.settingsintegrations.SettingsIntegrationsRemoteGatewayFactory
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SettingsIntegrationsProjectOption(
    val id: String,
    val name: String,
    val location: ProjectLocation,
)

/** App-lifetime composition root; navigation and Activity lifecycle stay outside the controller. */
class SettingsIntegrationsComposition(
    appState: StateFlow<AppSession.UiState>,
    repository: MultiHostCredentialRepository,
    scope: CoroutineScope,
    ioDispatcher: CoroutineDispatcher,
    remoteFactory: SettingsIntegrationsRemoteGatewayFactory =
        SettingsIntegrationsRemoteGatewayFactory { endpoint, token ->
            SettingsIntegrationsRemoteApiClient(endpoint, token)
        },
) {
    private val owner = SupervisorJob(scope.coroutineContext[Job])
    private val runtimeScope = CoroutineScope(scope.coroutineContext + owner)
    private val activeJobs = ConcurrentHashMap.newKeySet<Job>()
    private val leaseSource = SettingsIntegrationsLeaseSource(appState.value)
    val lease: StateFlow<SettingsIntegrationsLease?> = leaseSource.state
    val projects: StateFlow<List<SettingsIntegrationsProjectOption>> = leaseSource.projects
    val selectedProjectId: StateFlow<String?> = leaseSource.selectedProjectId
    private val provider = RepositorySettingsIntegrationsProvider(
        repository,
        remoteFactory,
        ioDispatcher,
    )
    private val gateway = GeneratedSettingsIntegrationsSessionGateway(lease, provider)
    val controller = SettingsIntegrationsController(lease, gateway, runtimeScope)
    private val observation = runtimeScope.launch {
        appState.collect { state ->
            val previous = lease.value?.key
            leaseSource.update(state)
            if (previous != lease.value?.key) {
                cancelTransientWork()
                controller.onLeaseChanged()
            }
        }
    }

    fun selectProject(projectId: String?) {
        val previous = lease.value?.key
        leaseSource.selectProject(projectId)
        if (previous != lease.value?.key) {
            cancelTransientWork()
            controller.onLeaseChanged()
        }
    }

    fun refreshInitial(owner: SkillOwner) {
        refreshSkills(owner)
        refreshOauth(owner)
    }

    fun refreshSkills(owner: SkillOwner) = launchTracked { controller.scanSkills(owner) }
    fun setSkillEnabled(owner: SkillOwner, skill: SkillEntry, enabled: Boolean) = launchTracked {
        controller.setSkillEnabled(owner, skill.absolutePath, enabled)
    }
    fun deleteSkill(owner: SkillOwner, skill: SkillEntry) = launchTracked {
        controller.deleteSkill(owner, skill.absolutePath)
    }
    fun importSkill(item: SkillImportItem) = launchTracked {
        controller.importSkills(listOf(item))
    }
    fun searchMarketplace(request: MarketplaceRequest) = launchTracked {
        controller.listSkillMarketplace(request)
    }
    fun installMarketplaceSkill(request: MarketplaceInstallRequest) = launchTracked {
        controller.installMarketplaceSkill(request)
    }
    fun discoverMcp(request: McpDiscoveryRequest) = launchTracked {
        controller.discoverExternalMcpServers(request)
    }
    fun probeMcp(owner: SkillOwner, server: McpServer) = launchTracked {
        controller.probeMcpServer(owner, server)
    }
    fun beginOauth(owner: SkillOwner, server: McpServer) = launchTracked {
        controller.beginMcpServerOauth(owner, server)
    }
    fun launchOauth(owner: SkillOwner): String? = controller.launchOauthAndWait(owner)
    fun clearOauth(owner: SkillOwner, url: String) = launchTracked {
        controller.clearMcpServerOauth(owner, url)
    }
    fun refreshOauth(owner: SkillOwner) = launchTracked { controller.getMcpOauthStatus(owner) }

    fun onBackground() {
        cancelTransientWork()
        controller.onBackground()
    }

    fun close() {
        onBackground()
        observation.cancel()
        runtimeScope.cancel()
    }

    private fun cancelTransientWork() {
        activeJobs.toList().forEach { it.cancel() }
        activeJobs.clear()
    }

    private fun launchTracked(block: suspend () -> Unit): Job {
        lateinit var job: Job
        job = runtimeScope.launch(start = CoroutineStart.LAZY) { block() }
        activeJobs += job
        job.invokeOnCompletion { activeJobs -= job }
        job.start()
        return job
    }
}

internal class SettingsIntegrationsLeaseSource(initial: AppSession.UiState) {
    private data class HostBinding(
        val connectionId: com.poracode.app.model.ClientConnectionId,
        val endpoint: String,
        val pairedAtEpochMs: Long,
        val protocolVersion: Int,
        val tokenExpiresAt: String?,
        val scopes: Set<String>,
    )

    private data class ProjectBinding(val id: String, val location: ProjectLocation)

    private val mutableState = MutableStateFlow<SettingsIntegrationsLease?>(null)
    val state: StateFlow<SettingsIntegrationsLease?> = mutableState.asStateFlow()
    private val mutableProjects = MutableStateFlow<List<SettingsIntegrationsProjectOption>>(emptyList())
    val projects: StateFlow<List<SettingsIntegrationsProjectOption>> = mutableProjects.asStateFlow()
    private val mutableSelectedProjectId = MutableStateFlow<String?>(null)
    val selectedProjectId: StateFlow<String?> = mutableSelectedProjectId.asStateFlow()
    private var latest = initial
    private var hostBinding: HostBinding? = null
    private var projectBinding: ProjectBinding? = null
    private var sessionGeneration = 0L
    private var workGeneration = 0L

    init {
        update(initial)
    }

    @Synchronized
    fun update(state: AppSession.UiState) {
        latest = state
        val host = selectedHost(state)
        val nextHost = host?.let {
            HostBinding(
                it.connectionId,
                it.httpBaseUrl,
                it.pairedAtEpochMs,
                it.protocolVersion,
                it.tokenExpiresAt,
                it.scopes.toSet(),
            )
        }
        val hostChanged = hostBinding != nextHost
        val ready = state.phase == AppSession.Phase.Ready && !state.sessionExpired
        val online = ready && state.socketState == RemoteWebSocketClient.ConnectionState.Online
        val previous = mutableState.value
        if (hostChanged || previous?.ready == true && !ready || previous?.online == true && !online) {
            sessionGeneration += 1
        }
        if (nextHost == null) {
            if (projectBinding != null) workGeneration += 1
            hostBinding = null
            projectBinding = null
            mutableSelectedProjectId.value = null
            mutableProjects.value = emptyList()
            mutableState.value = null
            return
        }
        if (sessionGeneration == 0L) sessionGeneration = 1L
        if (hostChanged) mutableSelectedProjectId.value = null
        hostBinding = nextHost
        val nextProjects = state.snapshot?.projects.orEmpty().map(RemoteProject::asIntegrationOption)
        mutableProjects.value = nextProjects
        val selected = nextProjects.firstOrNull { it.id == mutableSelectedProjectId.value }
        if (mutableSelectedProjectId.value != null && selected == null) {
            mutableSelectedProjectId.value = null
        }
        val nextProject = selected?.let { ProjectBinding(it.id, it.location) }
        if (projectBinding != nextProject || workGeneration == 0L) workGeneration += 1
        projectBinding = nextProject
        publish(nextHost, ready, online, selected)
    }

    @Synchronized
    fun selectProject(projectId: String?) {
        val selected = projectId?.let { id -> mutableProjects.value.firstOrNull { it.id == id } }
        val normalized = selected?.id
        if (normalized == mutableSelectedProjectId.value) return
        mutableSelectedProjectId.value = normalized
        projectBinding = selected?.let { ProjectBinding(it.id, it.location) }
        workGeneration += 1
        val host = hostBinding ?: return
        val ready = latest.phase == AppSession.Phase.Ready && !latest.sessionExpired
        val online = ready && latest.socketState == RemoteWebSocketClient.ConnectionState.Online
        publish(host, ready, online, selected)
    }

    private fun publish(
        host: HostBinding,
        ready: Boolean,
        online: Boolean,
        project: SettingsIntegrationsProjectOption?,
    ) {
        mutableState.value = SettingsIntegrationsLease(
            connectionId = host.connectionId,
            sessionGeneration = sessionGeneration,
            workGeneration = workGeneration,
            protocolVersion = host.protocolVersion,
            scopes = host.scopes,
            online = online,
            ready = ready,
            selectedProject = project?.let {
                SkillOwner(it.id, it.location, workGeneration)
            },
        )
    }

    private fun selectedHost(state: AppSession.UiState) =
        state.hostCatalog.selectedConnectionId?.let { id ->
            state.hostCatalog.hosts.firstOrNull { it.connectionId == id }
        }
}

private fun RemoteProject.asIntegrationOption() = SettingsIntegrationsProjectOption(
    id = id,
    name = name,
    location = location,
)
