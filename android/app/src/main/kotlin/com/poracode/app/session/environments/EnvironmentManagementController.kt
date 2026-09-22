package com.poracode.app.session.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteEnvironmentCreateRequest
import com.poracode.app.model.RemoteEnvironmentProjection
import com.poracode.app.model.RemoteEnvironmentTrustProbeResult
import com.poracode.app.model.RemoteEnvironmentUpdatePatch
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.environments.acceptEnvironmentTrust
import com.poracode.app.transport.environments.adoptLegacyEnvironment
import com.poracode.app.transport.environments.connectEnvironment
import com.poracode.app.transport.environments.createEnvironment
import com.poracode.app.transport.environments.deleteEnvironment
import com.poracode.app.transport.environments.disconnectEnvironment
import com.poracode.app.transport.environments.listEnvironments
import com.poracode.app.transport.environments.pairEnvironment
import com.poracode.app.transport.environments.probeEnvironmentTrust
import com.poracode.app.transport.environments.updateEnvironment
import com.poracode.app.transport.environments.upgradeEnvironment
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Bound-host environment management (C1, R4).
 *
 * Management authority is exactly the bound host's client: a direct/ssh host
 * manages its own registry; an environment host manages its child registry
 * through the one-hop proxy under the child grant. The controller never
 * constructs a second proxied hop and never throws a blanket authority error —
 * insufficient parent scopes disable actions in the UI and the child answers
 * its own `missing_scope` 403. Trust accept and owner upgrade are always
 * explicit, revision-checked user actions.
 *
 * Ordering uses two independent fences. [sessionFence] is action custody: a
 * genuine session change or lease change cancels in-flight work and a
 * completion whose custody is gone can neither paint nor clear the new
 * session's transient state. [refreshGeneration] orders list requests: a
 * mutation supersedes an in-flight refresh (and re-issues it when it settles),
 * so a refresh can never discard a mutation's result and a mutation can never
 * strand a `Loading` list — the two orderings are independent.
 */
class EnvironmentManagementController(
    private val repository: MultiHostCredentialRepository,
    private val pairingCoordinator: EnvironmentPairingCoordinator,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher,
) {
    enum class LoadState { Idle, Loading, Loaded, Failed }

    enum class BusyKind {
        Load,
        Create,
        Update,
        Delete,
        Connect,
        Disconnect,
        Upgrade,
        TrustProbe,
        TrustAccept,
        AdoptLegacy,
        Pair,
    }

    data class EnvironmentAccess(
        val canRead: Boolean,
        val canUse: Boolean,
        val canManage: Boolean,
    )

    data class EnvironmentCallError(
        val code: String,
        val status: Int = 0,
        val fingerprint: String? = null,
    )

    data class PendingTrust(
        val environmentId: String,
        val revision: Int,
        val fingerprint: String,
        val keyType: String,
    )

    data class LocalEnvironmentRecord(
        val connectionId: ClientConnectionId,
        val reference: EnvironmentHostReference,
    )

    data class EnvironmentUiState(
        val boundConnectionId: ClientConnectionId? = null,
        val hostLabel: String? = null,
        val capabilityAvailable: Boolean = false,
        val directParent: Boolean = true,
        val access: EnvironmentAccess = EnvironmentAccess(false, false, false),
        val loadState: LoadState = LoadState.Idle,
        val environments: List<RemoteEnvironmentProjection> = emptyList(),
        val localRecords: List<LocalEnvironmentRecord> = emptyList(),
        val busy: BusyKind? = null,
        val busyEnvironmentId: String? = null,
        val listError: EnvironmentCallError? = null,
        val actionError: EnvironmentCallError? = null,
        val actionNotice: String? = null,
        val pendingTrust: PendingTrust? = null,
    ) {
        /**
         * Local record for one host-minted environment id **under the bound
         * parent**. `environmentId` alone is not a local key: two parents can
         * hold a copied id, and a lookup without the parent can select the
         * wrong server. Returns null when the bound parent has no record.
         */
        fun localRecordFor(environmentId: String): ClientConnectionId? =
            localRecords.firstOrNull {
                it.reference.environmentId == environmentId &&
                    it.reference.parentConnectionId == boundConnectionId
            }?.connectionId
    }

    private val clientFactory = EnvironmentClientFactory(repository, ioDispatcher)

    private val mutableState = MutableStateFlow(EnvironmentUiState())
    val state: StateFlow<EnvironmentUiState> = mutableState.asStateFlow()

    /**
     * Session/lease custody: bumped on a genuine session change and on a lease
     * change. Action results apply only while the fence they started under is
     * current, so a completion from a replaced session cannot paint or clear
     * the new session's transient state.
     */
    private var sessionFence = 0L

    /**
     * List-request ordering, independent of [sessionFence]: bumped on every
     * refresh and whenever an in-flight refresh is superseded. A refresh result
     * applies only when it is still the newest request under the same custody,
     * so a stale list never overwrites a newer one.
     */
    private var refreshGeneration = 0L
    private var refreshJob: Job? = null
    private var localRecordsJob: Job? = null
    private val actions = EnvironmentActionTracker(scope)

    @Volatile
    private var bound: HostRecord? = null

    /**
     * Rebinds the controller to the selected record.
     *
     * A repeated bind of the **same** record is a live app-state emission, not
     * a session change: derived fields (capability/access/environments/load
     * state) refresh, but transient action state (`busy`, `pendingTrust`,
     * `actionError`, `actionNotice`, `listError`) is preserved, so an in-flight
     * action or a pending trust dialog cannot disappear mid-flight and a second
     * mutation cannot start concurrently.
     *
     * A genuine session change (different record, or no record) cancels and
     * fences every in-flight action and clears the obsolete transient state.
     */
    fun bind(record: HostRecord?) {
        bound = record
        val current = mutableState.value
        val same = record != null && current.boundConnectionId == record.connectionId
        if (!same) {
            cancelInFlight()
            sessionFence += 1
        }
        val next = if (record == null) {
            EnvironmentUiState()
        } else {
            current.copy(
                boundConnectionId = record.connectionId,
                hostLabel = record.label,
                capabilityAvailable = record.sshEnvironmentsVersions.contains(
                    com.poracode.app.model.RemoteEnvironmentDescriptor.SSH_ENVIRONMENTS_VERSION,
                ),
                directParent = record.environment == null,
                access = environmentAccessFor(record.scopes),
                environments = if (same) current.environments else emptyList(),
                listError = if (same) current.listError else null,
                actionError = if (same) current.actionError else null,
                actionNotice = if (same) current.actionNotice else null,
                pendingTrust = if (same) current.pendingTrust else null,
                busy = if (same) current.busy else null,
                busyEnvironmentId = if (same) current.busyEnvironmentId else null,
                loadState = if (same) current.loadState else LoadState.Idle,
            )
        }
        mutableState.value = next
        // Local records back the per-row pair/use actions for the bound parent
        // and are independent of the remote list fetch.
        refreshLocalRecords()
        if (record != null && next.capabilityAvailable && next.access.canRead &&
            (!same || current.loadState == LoadState.Idle)
        ) {
            refresh()
        }
    }

    fun refresh() {
        val record = boundRecord() ?: return
        // A mutation owns the pane while it is in flight: the retry tap is
        // dropped instead of superseding it, and the mutation re-issues the
        // list request when it settles.
        if (mutableState.value.busy != null) return
        if (!mutableState.value.capabilityAvailable || !mutableState.value.access.canRead) return
        val generation = ++refreshGeneration
        val fence = sessionFence
        refreshJob?.cancel()
        refreshJob = scope.launch {
            mutableState.value = mutableState.value.copy(loadState = LoadState.Loading, listError = null)
            val result = environmentCall {
                withContext(ioDispatcher) {
                    val client = clientFactory.clientFor(record) ?: error("missing_parent")
                    client.listEnvironments()
                }
            }
            if (generation != refreshGeneration || fence != sessionFence) return@launch
            result.fold(
                onSuccess = { list ->
                    mutableState.value = mutableState.value.copy(
                        loadState = LoadState.Loaded,
                        environments = list,
                        listError = null,
                    )
                    refreshLocalRecords()
                },
                onFailure = { error ->
                    mutableState.value = mutableState.value.copy(
                        loadState = LoadState.Failed,
                        listError = environmentCallError(error),
                    )
                },
            )
        }
    }

    fun create(request: RemoteEnvironmentCreateRequest) = mutate(null, BusyKind.Create) { client ->
        client.createEnvironment(request)
    }

    fun update(
        environmentId: String,
        expectedRevision: Int,
        patch: RemoteEnvironmentUpdatePatch,
    ) = mutate(environmentId, BusyKind.Update) { client ->
        client.updateEnvironment(environmentId, expectedRevision, patch)
    }

    fun delete(environmentId: String, expectedRevision: Int) = mutate(environmentId, BusyKind.Delete) { client ->
        client.deleteEnvironment(environmentId, expectedRevision)
        null
    }

    fun connect(environmentId: String) = mutate(environmentId, BusyKind.Connect) { client ->
        client.connectEnvironment(environmentId)
    }

    fun disconnect(environmentId: String) = mutate(environmentId, BusyKind.Disconnect) { client ->
        client.disconnectEnvironment(environmentId)
    }

    fun upgrade(environmentId: String, expectedRevision: Int) =
        mutate(environmentId, BusyKind.Upgrade) { client ->
            client.upgradeEnvironment(environmentId, expectedRevision)
        }

    fun adoptLegacy(environmentId: String, expectedRevision: Int, legacyConnectionId: String) =
        mutate(environmentId, BusyKind.AdoptLegacy) { client ->
            client.adoptLegacyEnvironment(environmentId, expectedRevision, legacyConnectionId)
        }

    /** Opens a network dial only; acceptance is a separate explicit user action. */
    fun probeTrust(environmentId: String) {
        val record = boundRecord() ?: return
        if (mutableState.value.busy != null) return
        val fence = sessionFence
        mutableState.value = mutableState.value.copy(
            busy = BusyKind.TrustProbe,
            busyEnvironmentId = environmentId,
            actionError = null,
        )
        actions.track {
            val result = environmentCall {
                withContext(ioDispatcher) {
                    val client = clientFactory.clientFor(record) ?: error("missing_parent")
                    client.probeEnvironmentTrust(environmentId)
                }
            }
            if (fence != sessionFence) return@track
            result.fold(
                onSuccess = { probe: RemoteEnvironmentTrustProbeResult ->
                    mutableState.value = mutableState.value.withTrustProbe(environmentId, probe)
                },
                onFailure = { error ->
                    mutableState.value = mutableState.value.withActionFailure(error)
                },
            )
        }
    }

    fun acceptPendingTrust() {
        val pending = mutableState.value.pendingTrust ?: return
        mutableState.value = mutableState.value.copy(pendingTrust = null)
        mutate(pending.environmentId, BusyKind.TrustAccept) { client ->
            client.acceptEnvironmentTrust(
                pending.environmentId,
                pending.revision,
                pending.fingerprint,
            )
        }
    }

    fun dismissPendingTrust() {
        mutableState.value = mutableState.value.copy(pendingTrust = null)
    }

    /**
     * Explicit device pairing. The parent mints a one-time child credential and
     * the local record keeps only that child grant; use remains a separate,
     * visible host selection.
     */
    fun pairDevice(
        environment: RemoteEnvironmentProjection,
        onPaired: (ClientConnectionId) -> Unit = {},
    ) {
        val record = boundRecord() ?: return
        if (!mutableState.value.access.canUse || mutableState.value.busy != null) return
        if (!mutableState.value.directParent) {
            mutableState.value = mutableState.value.copy(
                actionError = EnvironmentCallError(code = "environment_nested_parent_unsupported"),
            )
            return
        }
        val fence = sessionFence
        mutableState.value = mutableState.value.copy(
            busy = BusyKind.Pair,
            busyEnvironmentId = environment.environmentId,
            actionError = null,
            actionNotice = null,
        )
        actions.track {
            val result = environmentCall {
                withContext(ioDispatcher) {
                    val client = clientFactory.clientFor(record)
                        ?: return@withContext EnvironmentPairingCoordinator.Outcome.Failed(
                            EnvironmentPairingCoordinator.Failure.ParentNotPaired,
                        )
                    val pairing = client.pairEnvironment(environment.environmentId)
                    pairingCoordinator.pairDevice(record, pairing, environment.label)
                }
            }
            if (fence != sessionFence) return@track
            result.fold(
                onSuccess = { outcome ->
                    mutableState.value = mutableState.value.withPairingOutcome(outcome)
                    if (outcome is EnvironmentPairingCoordinator.Outcome.Paired) {
                        refreshLocalRecords()
                        onPaired(outcome.connectionId)
                    }
                },
                onFailure = { error ->
                    mutableState.value = mutableState.value.withActionFailure(error)
                },
            )
        }
    }

    fun clearActionMessages() {
        mutableState.value = mutableState.value.copy(actionError = null, actionNotice = null)
    }

    /**
     * The bound session was replaced (host lease change). Old actions are
     * cancelled and fenced, and their transient UI state is cleared so a
     * discarded result can neither paint nor keep an action spinner alive.
     */
    fun onLeaseChanged() {
        val supersededRefresh = cancelRefresh()
        actions.cancelAll()
        sessionFence += 1
        mutableState.value = mutableState.value.copy(
            busy = null,
            busyEnvironmentId = null,
            pendingTrust = null,
            actionError = null,
            actionNotice = null,
            listError = null,
        )
        // A list request that was in flight is re-issued under the new custody
        // instead of leaving the pane on a spinner forever.
        if (supersededRefresh) refresh()
    }

    private fun mutate(
        environmentId: String?,
        kind: BusyKind,
        block: suspend (RemoteApiClient) -> RemoteEnvironmentProjection?,
    ) {
        val record = boundRecord()
        if (record == null) {
            mutableState.value = mutableState.value.copy(
                actionError = EnvironmentCallError(code = "environment_parent_missing"),
            )
            return
        }
        if (mutableState.value.busy != null) return
        val canMutate = when (kind) {
            BusyKind.Create, BusyKind.Update, BusyKind.Delete, BusyKind.Upgrade,
            BusyKind.TrustAccept, BusyKind.AdoptLegacy,
            -> mutableState.value.access.canManage
            BusyKind.Connect, BusyKind.Disconnect -> mutableState.value.access.canUse
            else -> false
        }
        if (!canMutate) {
            mutableState.value = mutableState.value.copy(
                actionError = EnvironmentCallError(code = "missing_scope"),
            )
            return
        }
        val fence = sessionFence
        // The mutation supersedes an in-flight list refresh and re-issues it
        // when it settles, so neither ordering can strand the other.
        val refreshWasInFlight = cancelRefresh()
        mutableState.value = mutableState.value.copy(
            busy = kind,
            busyEnvironmentId = environmentId,
            actionError = null,
            actionNotice = null,
        )
        actions.track {
            val result = environmentCall {
                withContext(ioDispatcher) {
                    val client = clientFactory.clientFor(record) ?: error("missing_parent")
                    block(client)
                }
            }
            if (fence != sessionFence) return@track
            result.fold(
                onSuccess = { projection ->
                    mutableState.value =
                        mutableState.value.withMutationProjection(environmentId, projection)
                },
                onFailure = { error ->
                    mutableState.value = mutableState.value.withActionFailure(error)
                },
            )
            if (refreshWasInFlight) refresh()
        }
    }

    private fun boundRecord(): HostRecord? =
        bound?.takeIf { it.connectionId == mutableState.value.boundConnectionId }

    /** Cancels refresh and every tracked action; callers bump [sessionFence]. */
    private fun cancelInFlight() {
        cancelRefresh()
        actions.cancelAll()
    }

    /**
     * Cancels an active list refresh and invalidates its generation so a late
     * result cannot apply; returns true when one was actually superseded.
     */
    private fun cancelRefresh(): Boolean {
        val job = refreshJob ?: return false
        refreshJob = null
        if (!job.isActive) return false
        job.cancel()
        refreshGeneration += 1
        return true
    }

    private fun refreshLocalRecords() {
        localRecordsJob?.cancel()
        localRecordsJob = scope.launch {
            val records = readLocalEnvironmentRecords(repository, ioDispatcher) ?: return@launch
            mutableState.value = mutableState.value.copy(localRecords = records)
        }
    }

    companion object {
        fun accessFor(scopes: List<String>): EnvironmentAccess = environmentAccessFor(scopes)
    }
}
