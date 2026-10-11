package com.poracode.app.ui.settings

import com.poracode.app.model.McpServer
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.settings.GlobalMcpOauthResult
import com.poracode.app.model.settings.GlobalMcpProbeResult
import com.poracode.app.model.settings.GlobalMcpSettingsCommand
import com.poracode.app.model.settings.GlobalMcpSettingsOperation
import com.poracode.app.model.settings.GlobalMcpSettingsOperationResult
import com.poracode.app.model.settings.GlobalMcpSettingsScope
import com.poracode.app.session.settings.SettingsCapability
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.session.settings.SettingsOperationFailure
import com.poracode.app.session.settings.SettingsSessionGateway
import com.poracode.app.session.settings.asSettingsFailure
import com.poracode.app.session.settings.currentSettingsLease
import java.net.URI
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class GlobalMcpProject(val id: String, val name: String)

enum class McpScopedMutationResult { Applied, Uncertain, Failed, Stale }

enum class GlobalMcpOauthLifecycle {
    Idle,
    Checking,
    Ready,
    Starting,
    OpeningBrowser,
    Waiting,
    Authorized,
    Failed,
    Paused,
}

data class GlobalMcpSettingsUiState(
    val servers: List<McpServer> = emptyList(),
    val loading: Boolean = false,
    val loaded: Boolean = false,
    val mutating: Boolean = false,
    val failure: SettingsOperationFailure? = null,
    val mutationUncertain: Boolean = false,
    val probes: Map<String, GlobalMcpProbeResult> = emptyMap(),
    val probingServerId: String? = null,
    val authenticatedServerIds: Set<String> = emptySet(),
    val oauthLifecycle: GlobalMcpOauthLifecycle = GlobalMcpOauthLifecycle.Idle,
    val authorizationUrl: String? = null,
)

/** Exact-host, revision-owned controller for the global redacted MCP settings document. */
class GlobalMcpSettingsController internal constructor(
    private val lease: StateFlow<SettingsHostLease?>,
    private val gateway: SettingsSessionGateway,
    private val scope: CoroutineScope,
) {
    private val mutableState = MutableStateFlow(GlobalMcpSettingsUiState())
    val state: StateFlow<GlobalMcpSettingsUiState> = mutableState.asStateFlow()
    private val mutationMutex = Mutex()
    private val sessionRevision = AtomicLong()
    private val documentRevision = AtomicLong()
    private var transientJob: Job? = null
    private var oauthFlowId: String? = null
    private var oauthServerId: String? = null

    fun refresh() {
        val requestRevision = documentRevision.incrementAndGet()
        val (captured, failure) = lease.currentSettingsLease(SettingsCapability.ProjectsManage)
        if (captured == null || failure != null) {
            mutableState.update { it.copy(loading = false, failure = failure) }
            return
        }
        mutableState.update { it.copy(loading = true, failure = null, mutationUncertain = false) }
        scope.launch {
            try {
                val response = gateway.readGlobalMcpSettings(captured)
                if (!ownsDocument(captured, requestRevision)) return@launch
                mutableState.update {
                    it.copy(servers = response.servers, loading = false, loaded = true, failure = null)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!ownsDocument(captured, requestRevision)) return@launch
                mutableState.update {
                    it.copy(
                        loading = false,
                        failure = error.asSettingsFailure(SettingsCapability.ProjectsManage, false),
                    )
                }
            }
        }
    }

    fun upsert(server: McpServer) = mutate(
        GlobalMcpSettingsCommand.Upsert(GlobalMcpSettingsScope.Global, server),
    )

    fun remove(serverId: String) = mutate(
        GlobalMcpSettingsCommand.Remove(GlobalMcpSettingsScope.Global, serverId),
    )

    fun move(serverId: String, projectId: String) = mutate(
        GlobalMcpSettingsCommand.Move(
            GlobalMcpSettingsScope.Global,
            GlobalMcpSettingsScope.Project(projectId),
            serverId,
        ),
    )

    fun upsertProject(
        projectId: String,
        server: McpServer,
        onSettled: (McpScopedMutationResult) -> Unit = {},
    ) = mutate(
        GlobalMcpSettingsCommand.Upsert(GlobalMcpSettingsScope.Project(projectId), server),
        onSettled,
    )

    fun upsertProject(
        identity: ProjectIdentity,
        server: McpServer,
        onSettled: (McpScopedMutationResult) -> Unit = {},
    ) = mutate(
        GlobalMcpSettingsCommand.Upsert(
            GlobalMcpSettingsScope.Project(identity.projectId),
            server,
        ),
        onSettled,
        identity.connectionId,
    )

    fun removeProject(
        identity: ProjectIdentity,
        serverId: String,
        onSettled: (McpScopedMutationResult) -> Unit = {},
    ) = mutate(
        GlobalMcpSettingsCommand.Remove(
            GlobalMcpSettingsScope.Project(identity.projectId),
            serverId,
        ),
        onSettled,
        identity.connectionId,
    )

    fun moveProjectToGlobal(
        identity: ProjectIdentity,
        serverId: String,
        onSettled: (McpScopedMutationResult) -> Unit = {},
    ) = mutate(
        GlobalMcpSettingsCommand.Move(
            GlobalMcpSettingsScope.Project(identity.projectId),
            GlobalMcpSettingsScope.Global,
            serverId,
        ),
        onSettled,
        identity.connectionId,
    )

    private fun mutate(
        command: GlobalMcpSettingsCommand,
        onSettled: (McpScopedMutationResult) -> Unit = {},
        expectedConnectionId: ClientConnectionId? = null,
    ) {
        if (mutableState.value.mutating) {
            onSettled(McpScopedMutationResult.Failed)
            return
        }
        transientJob?.cancel()
        transientJob = null
        val requestRevision = documentRevision.incrementAndGet()
        val (captured, failure) = lease.currentSettingsLease(SettingsCapability.ProjectsManage)
        if (captured == null || failure != null) {
            mutableState.update { it.copy(failure = failure) }
            onSettled(McpScopedMutationResult.Failed)
            return
        }
        if (expectedConnectionId != null && captured.connectionId != expectedConnectionId) {
            onSettled(McpScopedMutationResult.Stale)
            return
        }
        mutableState.update {
            it.copy(mutating = true, failure = null, mutationUncertain = false)
        }
        scope.launch {
            mutationMutex.withLock {
                var result = McpScopedMutationResult.Stale
                try {
                    val response = gateway.commandGlobalMcpSettings(captured, command)
                    if (lease.value?.key == captured.key) {
                        if (ownsDocument(captured, requestRevision)) {
                            mutableState.update {
                                it.copy(servers = response.servers, mutating = false, loaded = true)
                            }
                        } else {
                            mutableState.update { it.copy(mutating = false) }
                        }
                        result = McpScopedMutationResult.Applied
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    if (lease.value?.key == captured.key) {
                        val mapped = error.asSettingsFailure(SettingsCapability.ProjectsManage, true)
                        if (mapped.isAmbiguousMutation()) {
                            reconcileAmbiguous(captured, requestRevision)
                            if (!ownsDocument(captured, requestRevision)) {
                                mutableState.update {
                                    it.copy(mutating = false, mutationUncertain = true)
                                }
                            }
                            result = McpScopedMutationResult.Uncertain
                        } else {
                            if (ownsDocument(captured, requestRevision)) {
                                mutableState.update { it.copy(mutating = false, failure = mapped) }
                            } else {
                                mutableState.update { it.copy(mutating = false) }
                            }
                            result = McpScopedMutationResult.Failed
                        }
                    }
                } finally {
                    onSettled(result)
                }
            }
        }
    }

    private suspend fun reconcileAmbiguous(captured: SettingsHostLease, requestRevision: Long) {
        try {
            val response = gateway.readGlobalMcpSettings(captured)
            if (!ownsDocument(captured, requestRevision)) return
            mutableState.update {
                it.copy(
                    servers = response.servers,
                    mutating = false,
                    loaded = true,
                    mutationUncertain = true,
                )
            }
        } catch (_: CancellationException) {
            throw CancellationException()
        } catch (_: Throwable) {
            if (ownsDocument(captured, requestRevision)) {
                mutableState.update { it.copy(mutating = false, mutationUncertain = true) }
            }
        }
    }

    fun probe(serverId: String) = operate(
        GlobalMcpSettingsOperation.Probe(GlobalMcpSettingsScope.Global, serverId),
        mutating = false,
        before = { it.copy(probingServerId = serverId, failure = null) },
    ) { result, prior ->
        val probe = result as? GlobalMcpSettingsOperationResult.Probe
            ?: error("Unexpected MCP probe response")
        prior.copy(
            probes = prior.probes + (serverId to probe.result),
            probingServerId = null,
        )
    }

    fun refreshOauthStatus() = operate(
        GlobalMcpSettingsOperation.OauthStatus(GlobalMcpSettingsScope.Global),
        mutating = false,
        before = { it.copy(oauthLifecycle = GlobalMcpOauthLifecycle.Checking, failure = null) },
    ) { result, prior ->
        val status = result as? GlobalMcpSettingsOperationResult.OauthStatus
            ?: error("Unexpected MCP OAuth status response")
        prior.copy(
            authenticatedServerIds = status.authenticatedServerIds,
            oauthLifecycle = GlobalMcpOauthLifecycle.Ready,
        )
    }

    fun beginOauth(serverId: String) = operate(
        GlobalMcpSettingsOperation.OauthBegin(GlobalMcpSettingsScope.Global, serverId),
        mutating = true,
        before = {
            oauthFlowId = null
            oauthServerId = serverId
            it.copy(
                oauthLifecycle = GlobalMcpOauthLifecycle.Starting,
                authorizationUrl = null,
                failure = null,
            )
        },
    ) { result, prior ->
        val begin = result as? GlobalMcpSettingsOperationResult.OauthBegin
            ?: error("Unexpected MCP OAuth begin response")
        when (val oauth = begin.result) {
            GlobalMcpOauthResult.Authorized -> {
                prior.copy(
                    authenticatedServerIds = prior.authenticatedServerIds + serverId,
                    oauthLifecycle = GlobalMcpOauthLifecycle.Authorized,
                )
            }
            is GlobalMcpOauthResult.Redirect -> {
                checkAuthorizationUrl(oauth.authorizationUrl)
                oauthFlowId = oauth.flowId
                prior.copy(
                    oauthLifecycle = GlobalMcpOauthLifecycle.OpeningBrowser,
                    authorizationUrl = oauth.authorizationUrl,
                )
            }
            GlobalMcpOauthResult.Error -> prior.copy(oauthLifecycle = GlobalMcpOauthLifecycle.Failed)
        }
    }

    /** Called only after the platform browser accepted the validated HTTPS URL. */
    fun continueOauthAfterBrowserOpened() {
        val flowId = oauthFlowId ?: return
        waitForOauth(flowId)
    }

    private fun waitForOauth(flowId: String) = operate(
        GlobalMcpSettingsOperation.OauthWait(GlobalMcpSettingsScope.Global, flowId),
        mutating = true,
        before = { it.copy(oauthLifecycle = GlobalMcpOauthLifecycle.Waiting, authorizationUrl = null) },
    ) { result, prior ->
        val wait = result as? GlobalMcpSettingsOperationResult.OauthWait
            ?: error("Unexpected MCP OAuth wait response")
        oauthFlowId = null
        if (wait.result == GlobalMcpOauthResult.Authorized) {
            prior.copy(
                authenticatedServerIds = oauthServerId?.let {
                    prior.authenticatedServerIds + it
                } ?: prior.authenticatedServerIds,
                oauthLifecycle = GlobalMcpOauthLifecycle.Authorized,
            )
        } else prior.copy(oauthLifecycle = GlobalMcpOauthLifecycle.Failed)
    }

    fun clearOauth(serverId: String) = operate(
        GlobalMcpSettingsOperation.OauthClear(GlobalMcpSettingsScope.Global, serverId),
        mutating = true,
        before = { it.copy(oauthLifecycle = GlobalMcpOauthLifecycle.Starting) },
    ) { result, prior ->
        check(result == GlobalMcpSettingsOperationResult.OauthClear)
        prior.copy(
            authenticatedServerIds = prior.authenticatedServerIds - serverId,
            oauthLifecycle = GlobalMcpOauthLifecycle.Ready,
        )
    }

    private fun operate(
        operation: GlobalMcpSettingsOperation,
        mutating: Boolean,
        before: (GlobalMcpSettingsUiState) -> GlobalMcpSettingsUiState,
        apply: (GlobalMcpSettingsOperationResult, GlobalMcpSettingsUiState) -> GlobalMcpSettingsUiState,
    ) {
        if (mutableState.value.mutating) return
        val requestRevision = sessionRevision.get()
        val captured = lease.value ?: return
        val (_, failure) = lease.currentSettingsLease(SettingsCapability.ProjectsManage)
        if (failure != null) {
            mutableState.update { it.copy(failure = failure) }
            return
        }
        mutableState.update { before(it).copy(mutating = true) }
        transientJob = scope.launch {
            try {
                val result = gateway.operateGlobalMcpSettings(captured, operation)
                if (!ownsSession(captured, requestRevision)) return@launch
                mutableState.update { apply(result, it).copy(mutating = false, failure = null) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!ownsSession(captured, requestRevision)) return@launch
                mutableState.update {
                    it.copy(
                        mutating = false,
                        probingServerId = null,
                        oauthLifecycle = GlobalMcpOauthLifecycle.Failed,
                        failure = error.asSettingsFailure(SettingsCapability.ProjectsManage, mutating),
                    )
                }
            }
        }
    }

    fun onLeaseChanged() {
        sessionRevision.incrementAndGet()
        documentRevision.incrementAndGet()
        transientJob?.cancel()
        transientJob = null
        oauthFlowId = null
        oauthServerId = null
        mutableState.value = GlobalMcpSettingsUiState()
    }

    fun onBackground() {
        if (mutableState.value.oauthLifecycle == GlobalMcpOauthLifecycle.Waiting) {
            transientJob?.cancel()
            transientJob = null
            mutableState.update { it.copy(oauthLifecycle = GlobalMcpOauthLifecycle.Paused) }
        }
    }

    fun onForeground() {
        if (mutableState.value.oauthLifecycle == GlobalMcpOauthLifecycle.Paused) {
            oauthFlowId?.let(::waitForOauth)
        }
    }

    private fun ownsDocument(captured: SettingsHostLease, requestRevision: Long): Boolean =
        documentRevision.get() == requestRevision && lease.value?.key == captured.key

    private fun ownsSession(captured: SettingsHostLease, requestRevision: Long): Boolean =
        sessionRevision.get() == requestRevision && lease.value?.key == captured.key
}

internal fun checkAuthorizationUrl(value: String): URI {
    val uri = runCatching { URI(value) }.getOrNull() ?: error("Invalid OAuth URL")
    check(uri.scheme.equals("https", ignoreCase = true))
    check(!uri.host.isNullOrBlank())
    check(uri.userInfo == null)
    return uri
}
