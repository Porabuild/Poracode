package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.model.ThreadConfig
import com.poracode.app.storage.ConnectionMetadataStore
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.storage.SecureTokenStore
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.storage.TokenLoadOutcome
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

/** Legacy adapter fakes kept for migration tests. */
class InMemoryTokenStore : SecureTokenStore {
    @Volatile
    var token: String? = null

    @Volatile
    var failNextSave: Boolean = false

    @Volatile
    var failOnSaveNumber: Int? = null

    @Volatile
    private var saveCount: Int = 0

    fun resetSaveCount() {
        saveCount = 0
    }

    override fun saveAccessToken(token: String) {
        if (failNextSave) {
            failNextSave = false
            throw RuntimeException("token save failed")
        }
        saveCount += 1
        val target = failOnSaveNumber
        if (target != null && saveCount == target) {
            failOnSaveNumber = null
            throw RuntimeException("token rollback failed")
        }
        this.token = token
    }

    override fun loadAccessToken(): String? = token

    override fun loadAccessTokenOutcome(): TokenLoadOutcome =
        when (val t = token) {
            null -> TokenLoadOutcome.Empty
            else -> TokenLoadOutcome.Loaded(t)
        }

    override fun deleteAccessToken(): Boolean {
        token = null
        return true
    }

    override fun hasTokenFileForTests(): Boolean = token != null
}

class InMemoryConnectionStore : ConnectionMetadataStore {
    private val flow = MutableStateFlow<ConnectionProfile?>(null)

    @Volatile
    var failNextSave: Boolean = false

    override fun profileFlow(): Flow<ConnectionProfile?> = flow.asStateFlow()

    override fun hasMaterialForTests(): Boolean = flow.value != null

    override suspend fun load(): ConnectionProfile? = flow.value

    override suspend fun save(profile: ConnectionProfile) {
        if (failNextSave) {
            failNextSave = false
            throw RuntimeException("profile save failed")
        }
        flow.value = profile
    }

    override suspend fun clear(): Boolean {
        flow.value = null
        return true
    }
}

class FakeApiGateway(
    var endpoint: String = "https://host-a.test",
    private var accessToken: String? = null,
) : RemoteApiGateway {
    var environmentResponse: RemoteEnvironmentDescriptor = defaultEnvironment()
    var tokenResult: RemoteAccessTokenResult = RemoteAccessTokenResult(
        accessToken = "access-a",
        tokenType = "Bearer",
        expiresAt = "2099-01-01T00:00:00.000Z",
        scopes = listOf("session:read", "session:operate"),
    )
    var shellSnapshot: RemoteShellSnapshot = defaultShell(snapshotSeq = 10)
    var threadHistory: RemoteThreadSnapshot = defaultHistory(snapshotSeq = 10)
    var runtimePage: RemoteRuntimeItemsPage = RemoteRuntimeItemsPage(
        items = emptyList(),
        nextCursor = null,
    )

    var snapshotCalls = AtomicInteger(0)
    var historyCalls = AtomicInteger(0)
    var sendCalls = AtomicInteger(0)
    var interruptCalls = AtomicInteger(0)
    var ticketCalls = AtomicInteger(0)
    var environmentCalls = AtomicInteger(0)

    var snapshotError: Exception? = null
    var historyError: Exception? = null
    var sendError: Exception? = null
    var interruptError: Exception? = null
    var ticketError: Exception? = null
    var environmentError: Exception? = null
    var exchangeError: Exception? = null

    var snapshotErrorAfterCalls: Int? = null
    var snapshotErrorThen: Exception? = null

    /** Barrier: suspend operation until completed (race tests). */
    @Volatile
    var snapshotHold: CompletableDeferred<Unit>? = null
    @Volatile
    var historyHold: CompletableDeferred<Unit>? = null
    @Volatile
    var sendHold: CompletableDeferred<Unit>? = null
    @Volatile
    var interruptHold: CompletableDeferred<Unit>? = null
    @Volatile
    var ticketHold: CompletableDeferred<Unit>? = null
    @Volatile
    var environmentHold: CompletableDeferred<Unit>? = null
    @Volatile
    var exchangeHold: CompletableDeferred<Unit>? = null

    @Volatile
    var snapshotReachedHold: CompletableDeferred<Unit>? = null
    @Volatile
    var historyReachedHold: CompletableDeferred<Unit>? = null
    @Volatile
    var ticketReachedHold: CompletableDeferred<Unit>? = null
    @Volatile
    var sendReachedHold: CompletableDeferred<Unit>? = null
    @Volatile
    var interruptReachedHold: CompletableDeferred<Unit>? = null

    @Volatile
    var cancelledSnapshot: Boolean = false
    @Volatile
    var cancelledHistory: Boolean = false
    @Volatile
    var cancelledTicket: Boolean = false
    @Volatile
    var cancelledSend: Boolean = false
    @Volatile
    var cancelledInterrupt: Boolean = false

    override fun setAccessToken(token: String?) {
        accessToken = token
    }

    override suspend fun environment(): RemoteEnvironmentDescriptor {
        environmentCalls.incrementAndGet()
        val hold = environmentHold
        if (hold != null) {
            hold.await()
        }
        environmentError?.let { throw it }
        return environmentResponse
    }

    override suspend fun exchangePairingCredential(
        credential: String,
        scopes: List<String>,
    ): RemoteAccessTokenResult {
        exchangeHold?.await()
        exchangeError?.let { throw it }
        return tokenResult.copy(scopes = scopes.ifEmpty { tokenResult.scopes })
    }

    override suspend fun snapshot(): RemoteShellSnapshot {
        val n = snapshotCalls.incrementAndGet()
        val hold = snapshotHold
        if (hold != null) {
            snapshotReachedHold?.complete(Unit)
            try {
                hold.await()
            } catch (e: kotlinx.coroutines.CancellationException) {
                cancelledSnapshot = true
                throw e
            }
        }
        val after = snapshotErrorAfterCalls
        if (after != null && n >= after) {
            snapshotErrorThen?.let { throw it }
        }
        snapshotError?.let { throw it }
        return shellSnapshot
    }

    override suspend fun threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int?,
    ): RemoteThreadSnapshot {
        historyCalls.incrementAndGet()
        val hold = historyHold
        if (hold != null) {
            historyReachedHold?.complete(Unit)
            try {
                hold.await()
            } catch (e: kotlinx.coroutines.CancellationException) {
                cancelledHistory = true
                throw e
            }
        }
        historyError?.let { throw it }
        return threadHistory.copy(
            thread = threadHistory.thread.copy(id = threadId),
        )
    }

    override suspend fun threadRuntimeItemsPage(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
    ): RemoteRuntimeItemsPage {
        historyError?.let { throw it }
        return runtimePage
    }

    override suspend fun sendThreadInput(
        threadId: String,
        prompt: String,
        config: ThreadConfig,
        segments: JsonArray?,
        userMessageItemId: String?,
    ) {
        sendCalls.incrementAndGet()
        val hold = sendHold
        if (hold != null) {
            sendReachedHold?.complete(Unit)
            try {
                hold.await()
            } catch (e: kotlinx.coroutines.CancellationException) {
                cancelledSend = true
                throw e
            }
        }
        sendError?.let { throw it }
    }

    override suspend fun interruptThread(threadId: String) {
        interruptCalls.incrementAndGet()
        val hold = interruptHold
        if (hold != null) {
            interruptReachedHold?.complete(Unit)
            try {
                hold.await()
            } catch (e: kotlinx.coroutines.CancellationException) {
                cancelledInterrupt = true
                throw e
            }
        }
        interruptError?.let { throw it }
    }

    override suspend fun websocketTicket(): String {
        ticketCalls.incrementAndGet()
        val hold = ticketHold
        if (hold != null) {
            ticketReachedHold?.complete(Unit)
            try {
                hold.await()
            } catch (e: kotlinx.coroutines.CancellationException) {
                cancelledTicket = true
                throw e
            }
        }
        ticketError?.let { throw it }
        return "ticket"
    }

    override fun websocketUrl(
        ticket: String,
        lastSeenSeq: Int?,
        threadItemInterests: List<String>?,
    ): String = "wss://example.test/ws?ticket=$ticket"

    companion object {
        fun defaultEnvironment(
            desktopId: String = "desktop-a",
            label: String = "Host A",
            scopes: List<String> = listOf(
                "session:read",
                "session:operate",
                "terminal:read",
                "terminal:operate",
                "requests:resolve",
                "projects:manage",
                "ports:forward",
            ),
        ): RemoteEnvironmentDescriptor =
            RemoteEnvironmentDescriptor(
                protocolVersion = 8,
                hostMode = "desktop",
                desktopId = desktopId,
                label = label,
                appVersion = "1.0.0",
                platform = "darwin",
                auth = RemoteEnvironmentDescriptor.Auth(
                    policy = "remote-reachable",
                    scopes = scopes,
                ),
                endpoints = RemoteEnvironmentDescriptor.Endpoints(
                    httpBaseUrl = "https://host-a.test/",
                    wsBaseUrl = "wss://host-a.test/",
                ),
            )

        fun defaultShell(snapshotSeq: Int = 10): RemoteShellSnapshot =
            RemoteShellSnapshot(
                snapshotSeq = snapshotSeq,
                projects = listOf(
                    RemoteProject(
                        id = "p1",
                        name = "Project",
                        location = com.poracode.app.model.ProjectLocation(
                            kind = "posix",
                            path = "/tmp",
                        ),
                        createdAt = "2026-01-01T00:00:00.000Z",
                    ),
                ),
                threads = listOf(
                    RemoteThread(
                        id = "t1",
                        projectId = "p1",
                        title = "Thread",
                        agentKind = "codex",
                        config = ThreadConfig(model = "gpt-5"),
                        status = "idle",
                        attention = "none",
                        presentationMode = "gui",
                        createdAt = "2026-01-01T00:00:00.000Z",
                        updatedAt = "2026-01-01T00:00:00.000Z",
                    ),
                    RemoteThread(
                        id = "term-1",
                        projectId = "p1",
                        title = "Terminal",
                        agentKind = "codex",
                        config = ThreadConfig(model = "gpt-5"),
                        status = "idle",
                        attention = "none",
                        presentationMode = "terminal",
                        createdAt = "2026-01-01T00:00:00.000Z",
                        updatedAt = "2026-01-01T00:00:00.000Z",
                    ),
                ),
                runtimeSummariesByThread = emptyMap(),
                updatedAt = "2026-01-01T00:00:00.000Z",
            )

        fun defaultHistory(snapshotSeq: Int = 10): RemoteThreadSnapshot =
            RemoteThreadSnapshot(
                snapshotSeq = snapshotSeq,
                thread = RemoteThread(
                    id = "t1",
                    projectId = "p1",
                    title = "Thread",
                    agentKind = "codex",
                    config = ThreadConfig(model = "gpt-5"),
                    status = "idle",
                    attention = "none",
                    presentationMode = "gui",
                    createdAt = "2026-01-01T00:00:00.000Z",
                    updatedAt = "2026-01-01T00:00:00.000Z",
                ),
                runtimeItems = listOf(
                    PersistedRuntimeItem(
                        id = "hist-1",
                        type = "user_message",
                        state = "completed",
                        payload = null,
                        streams = mapOf("user_text" to "hello"),
                    ),
                ),
                runtimeNextCursor = null,
                updatedAt = "2026-01-01T00:00:00.000Z",
            )
    }
}

class FakeSocket : RemoteEventSocket {
    private val listenerRef = AtomicReference<RemoteEventSocket.Listener?>(null)
    private val applied = AtomicReference<Int?>(null)
    @Volatile
    var resyncPendingFlag: Boolean = false
    @Volatile
    var started: Boolean = false
    @Volatile
    var suspended: Boolean = false
    @Volatile
    var destroyed: Boolean = false
    @Volatile
    var startCount: Int = 0
    @Volatile
    var armSuspendedCount: Int = 0
    @Volatile
    var unauthorizedCount: Int = 0
    @Volatile
    var resumeAfterResyncCount: Int = 0
    @Volatile
    var recoverFailureCount: Int = 0
    @Volatile
    var lastStartSeq: Int? = null
    val interestsHistory = CopyOnWriteArrayList<List<String>>()
    val gitInterestsHistory = CopyOnWriteArrayList<List<com.poracode.app.protocol.git.GitInterest>>()
    val stateHistory = CopyOnWriteArrayList<RemoteWebSocketClient.ConnectionState>()

    override fun setListener(listener: RemoteEventSocket.Listener?) {
        listenerRef.set(listener)
    }

    override fun appliedSeq(): Int? = applied.get()

    override val resyncPending: Boolean
        get() = resyncPendingFlag

    override fun noteAuthoritativeSnapshot(seq: Int) {
        val cur = applied.get()
        applied.set(if (cur == null) seq else maxOf(cur, seq))
    }

    override fun replaceAppliedSeq(seq: Int) {
        applied.set(seq)
        resyncPendingFlag = true
    }

    override fun clearResyncPending() {
        resyncPendingFlag = false
    }

    override fun markResyncPending() {
        resyncPendingFlag = true
    }

    override fun markSnapshotFailed() {
        if (applied.get() == null) {
            applied.set(0)
            resyncPendingFlag = true
        }
    }

    override fun resumeAfterResync(fromSeq: Int) {
        applied.set(fromSeq)
        resyncPendingFlag = false
        resumeAfterResyncCount += 1
        started = true
        emitState(RemoteWebSocketClient.ConnectionState.Online)
    }

    override fun recoverAfterResyncFailure() {
        resyncPendingFlag = true
        recoverFailureCount += 1
    }

    override fun noteHttpUnauthorized(reason: String) {
        unauthorizedCount += 1
        resyncPendingFlag = true
        started = false
        emitState(RemoteWebSocketClient.ConnectionState.SessionExpired, reason)
        listenerRef.get()?.onSessionExpired(reason)
    }

    override fun start(lastSeenSeq: Int?) {
        started = true
        suspended = false
        destroyed = false
        startCount += 1
        lastStartSeq = lastSeenSeq
        if (lastSeenSeq != null) applied.set(lastSeenSeq)
        emitState(RemoteWebSocketClient.ConnectionState.Connecting)
        emitState(RemoteWebSocketClient.ConnectionState.Online)
        listenerRef.get()?.onMessage(
            RemoteWebSocketServerMessage.Ready(seq = lastSeenSeq ?: 0),
        )
    }

    override fun armSuspended(lastSeenSeq: Int?) {
        armSuspendedCount += 1
        started = false
        suspended = true
        lastStartSeq = lastSeenSeq
        if (lastSeenSeq != null) applied.set(lastSeenSeq)
        emitState(RemoteWebSocketClient.ConnectionState.Suspended)
    }

    override fun stop() {
        started = false
        suspended = false
        resyncPendingFlag = false
        emitState(RemoteWebSocketClient.ConnectionState.Idle)
    }

    override fun suspendForBackground() {
        started = false
        suspended = true
        emitState(RemoteWebSocketClient.ConnectionState.Suspended)
    }

    override fun resumeFromForeground() {
        if (destroyed) return
        suspended = false
        start(lastStartSeq)
    }

    override fun setThreadItemInterests(threadIds: List<String>) {
        interestsHistory.add(threadIds)
    }

    override fun setGitInterests(interests: List<com.poracode.app.protocol.git.GitInterest>) {
        gitInterestsHistory.add(interests)
    }

    override fun destroy() {
        destroyed = true
        started = false
        listenerRef.set(null)
    }

    fun emitState(state: RemoteWebSocketClient.ConnectionState, detail: String? = null) {
        stateHistory.add(state)
        listenerRef.get()?.onStateChanged(state, detail)
    }

    fun emitEvent(seq: Int, event: JsonElement) {
        listenerRef.get()?.onMessage(RemoteWebSocketServerMessage.Event(seq = seq, event = event))
    }

    fun emitResyncRequired(seq: Int, reason: String = "gap") {
        resyncPendingFlag = true
        applied.set(seq)
        listenerRef.get()?.onResyncRequired(reason)
    }

    fun listener(): RemoteEventSocket.Listener? = listenerRef.get()
}

class FakeSocketFactory {
    val sockets = CopyOnWriteArrayList<FakeSocket>()

    fun create(): FakeSocket {
        val s = FakeSocket()
        sockets.add(s)
        return s
    }

    val latest: FakeSocket?
        get() = sockets.lastOrNull()
}

/** Build a test session with the atomic credential repository. */
fun testCredentials(
    seed: SessionCredentials? = null,
): InMemorySessionCredentialRepository =
    InMemorySessionCredentialRepository().also { if (seed != null) {
        // Synchronous seed via field for tests before any suspend.
        // Use commit in coroutines when possible.
    } }
