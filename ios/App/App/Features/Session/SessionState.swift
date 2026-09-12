import Foundation

/// Canonical session phase surface observed by screens.
enum SessionPhase: Equatable, Sendable {
    case launching
    case needsPairing
    case connecting
    case ready
    /// Token rejected (HTTP 401/403 or WS 1008). Credentials retained for re-pair / retry.
    case sessionExpired
    /// Stored/resume environment is not protocol v3 (or future document). Profile+token retained until Disconnect.
    case protocolIncompatible
    /// Corrupt / unreadable credentials — user must Disconnect. Bytes preserved until then.
    case localStoreInconsistent
}

enum SessionLoadState: Equatable, Sendable {
    case idle
    case loading
    case loaded
    case empty
    case failed(String)
}

/// Open-thread domain state matching TS runtime event slice fields used by mobile.
struct RuntimeThreadDomainState: Sendable, Equatable {
    var openTurn: Bool?
    var openRequests: [RuntimeEventReducer.OpenRuntimeRequest] = []
    var contextUsage: ThreadContextUsage?
    var completedTurns: [CompletedTurnRecord] = []
    var structuralVersion: Int = 0

    mutating func reset() {
        openTurn = nil
        openRequests = []
        contextUsage = nil
        completedTurns = []
        structuralVersion = 0
    }
}

/// Provider-agnostic context-window occupancy (`context.updated` / snapshot.contextUsage).
struct ThreadContextUsage: Sendable, Equatable {
    var usedTokens: Int?
    var maxTokens: Int?
}

/// Completed turn record for open-thread domain (history hydration + turn.completed).
struct CompletedTurnRecord: Sendable, Equatable {
    var turnId: String
    var state: String
    var startedAt: Int?
    var endedAt: Int?
}

/// Browser-origin forward-entry advertising captured from exactly one
/// environment handshake, keyed to the connection whose desktop produced it
/// and to the online session epoch it was captured in.
struct BrowserForwardEntryState: Equatable, Sendable {
    var connectionID: ClientConnectionID
    var advertised: Bool
    /// Online-session epoch this handshake belongs to (the value of
    /// `SessionRuntimeState.browserForwardOnlineEpoch` when it was recorded).
    /// Authority from an older epoch never reads open: every reconnect of the
    /// selected host's socket opens a new epoch.
    var onlineEpoch: UInt64 = 0
}

/// Capability refresh in flight for one online epoch. Satisfies the connect
/// funnel's "authority already handled" check so a connect attempt and the
/// reconnect funnel never double-fetch the same epoch's handshake.
///
/// `requestToken` is the refresh task's OwnedTaskSlot install token. Cleanup
/// releases a marker only on an exact whole-struct match, so a late
/// cancelled completion can never release a newer request's reservation —
/// including the pooled-host A→B→A case where a host switch away and back
/// re-reserves the same (connection, epoch) key while the original request
/// is still suspended.
struct BrowserForwardRefreshPending: Equatable, Sendable {
    var connectionID: ClientConnectionID
    var onlineEpoch: UInt64
    var requestToken: UInt64
}

/// Mutable session domain state owned by `AppSession` and mutated by focused controllers.
@MainActor
struct SessionRuntimeState {
    var phase: SessionPhase = .launching
    var profile: ConnectionProfile?
    var accessToken: String?
    var selectedConnectionId: ClientConnectionID?
    var hosts: [HostRecord] = []
    var hostsLRU: [ClientConnectionID] = []
    var socketState: RemoteWebSocketClient.ConnectionState = .idle
    var hostSocketStates: [ClientConnectionID: RemoteWebSocketClient.ConnectionState] = [:]
    /// Newest handshake authority for browser-origin forward entry, keyed to
    /// the connection that produced it and to the online epoch it was
    /// captured in. `nil`, a foreign key, or an older epoch reads as "not
    /// advertised": browser entry stays closed until this host's own fresh
    /// handshake supplies authority. Raw TCP forwarding never consults this.
    var browserForwardEntry: BrowserForwardEntryState?
    /// Monotonic epoch of the selected host's online session. Bumped every
    /// time the selected host's socket reaches `.online` — a fresh
    /// connection, reconnect, or foreground resume — and reset on unpair.
    /// Handshake authority never crosses an epoch boundary, so a capability
    /// captured before a reconnect can never authorize actions on the new
    /// online session.
    var browserForwardOnlineEpoch: UInt64 = 0
    /// Capability refresh in flight for one epoch; `nil` when none. Dedupes
    /// the connect funnel's probe against the reconnect funnel so one epoch
    /// costs exactly one environment handshake.
    var browserForwardRefresh: BrowserForwardRefreshPending?

    var snapshot: RemoteShellSnapshot?
    /// Latest authoritative shell snapshot for each paired host. The selected
    /// host is refreshed by the live session; background hosts are refreshed
    /// over HTTP for the unified mobile thread list.
    var hostSnapshots: [ClientConnectionID: RemoteShellSnapshot] = [:]
    var projectsLoadState: SessionLoadState = .idle
    var globalError: String?

    /// Pending deep-link pairing (host only in UI; credential memory-only).
    var pendingPairing: PendingPairingState?

    var openRuntimeRequests: [RuntimeEventReducer.OpenRuntimeRequest] = []
    /// Canonical domain fields for the open thread (open-turn, context, completed turns).
    var threadDomain = RuntimeThreadDomainState()

    var openThreadId: String?
    /// Explicit open epoch — changes on every open/close even for the same id.
    var openThreadEpoch: Int = 0
    var threadSnapshot: RemoteThreadSnapshot?
    var threadItems: [PersistedRuntimeItem] = []
    var threadOlderCursor: Int?
    var threadLoadState: SessionLoadState = .idle
    var isSending = false
    var isLoadingOlder = false

    var api: (any SessionRemoteAPI)?
    var webSocket: (any SessionLiveSocket)?
    /// Always a baseline once a live session is attempted; `0` after snapshot failure.
    var lastSeenSeq: Int = 0
    /// Sequence advertised by the latest socket `ready` frame. Events at or
    /// below this boundary are replay, so transient user alerts are not shown.
    var socketReplayCeiling: Int = 0

    var isBootstrapping = false
    /// Once-per-process: SwiftUI `.task` reentry must not re-bootstrap after completion.
    var bootstrapCompleted = false
    var isResyncing = false
    /// History load tokens invalidated by successful resync.
    var historyLoadGeneration: Int = 0
    /// Background mid-resync left an authoritative refresh requirement for next foreground.
    var needsAuthoritativeRefresh = false

    var operationOwner = SessionOperationOwner()
    var threadOwnership = ThreadOpenOwnership()
    var interestCoordinator = InterestUpdateCoordinator()
    var liveLifecycle = LiveSessionLifecycle()
    var hydrationBuffer = ThreadHistoryHydrationBuffer()
    var pairingTracker = PairingCandidateTracker()
    var resyncCoordinator = ResyncCoordinator()
    /// Replayed Git/agent/lifecycle state for the *selected* host only.
    var replay = HostReplayState()
    /// Boundary buffer for sequenced events arriving during a snapshot/resync install.
    var replayInstallBuffer = ReplayInstallBuffer()
    /// Monotonic install identity; a stale install can never commit or take the buffer.
    var replayInstallGeneration: UInt64 = 0
    var gitInterestCoordinator = GitStateInterestCoordinator()
    /// Explicit Git-state interests requested by a UI surface (PR detail, PR list).
    var explicitGitInterests: [GitStateInterest] = []
    /// In-flight resync attempt identity (separate from retry scheduling task).
    var resyncAttemptId: UInt64 = 0

    var workGeneration: Int { operationOwner.workGeneration }

    var capabilities: ScopeCapabilities {
        ScopeCapabilities.from(scopes: profile?.scopes ?? [])
    }

    var canRead: Bool { capabilities.canRead }
    var canOperate: Bool { capabilities.canOperate }

    var projects: [RemoteProject] {
        guard canRead else { return [] }
        return (snapshot?.projects ?? []).filter { !($0.disabled ?? false) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    mutating func clearThreadSurface() {
        openThreadId = nil
        threadSnapshot = nil
        threadItems = []
        threadOlderCursor = nil
        openRuntimeRequests = []
        threadDomain.reset()
        threadLoadState = .idle
        isSending = false
        isLoadingOlder = false
    }

    /// Records browser-origin forward-entry advertising from a completed
    /// environment handshake, keyed to the connection that produced it (so a
    /// host switch can never serve one desktop's capability to another) and
    /// stamped with the current online epoch (so a result can never outlive
    /// the online session it was fetched in). A nil connection or descriptor
    /// clears the slot.
    mutating func noteBrowserForwardEntry(
        _ descriptor: RemoteEnvironmentDescriptor?, connectionID: ClientConnectionID?
    ) {
        guard let connectionID else {
            browserForwardEntry = nil
            return
        }
        browserForwardEntry = BrowserForwardEntryState(
            connectionID: connectionID,
            advertised: descriptor?.advertisesBrowserForwardEntry == true,
            onlineEpoch: browserForwardOnlineEpoch
        )
    }

    /// Whether fresh handshake authority exists for exactly this connection
    /// in the current online epoch — either a completed environment result or
    /// a refresh still in flight for this epoch (any request token). Authority
    /// retained from an older epoch (any socket reconnect, suspend, or
    /// failure) never satisfies a new connection attempt.
    func hasBrowserForwardAuthority(for connectionID: ClientConnectionID) -> Bool {
        if let refresh = browserForwardRefresh,
          refresh.connectionID == connectionID,
          refresh.onlineEpoch == browserForwardOnlineEpoch
        {
            return true
        }
        let entry = browserForwardEntry
        return entry?.connectionID == connectionID
            && entry?.onlineEpoch == browserForwardOnlineEpoch
    }

    /// The selected host's socket left `.online` (reconnect, suspend,
    /// failure, stop): retained handshake authority is dropped immediately so
    /// browser entry reads closed for the remainder of this connection
    /// attempt. Raw list/start/stop never consult this.
    mutating func invalidateBrowserForwardAuthority() {
        browserForwardEntry = nil
    }

    /// The selected host's socket reached `.online` again: open a new epoch
    /// and drop everything captured before it. The caller then refetches the
    /// environment exactly once for this epoch (the reconnect funnel).
    mutating func beginBrowserForwardOnlineEpoch() {
        browserForwardOnlineEpoch &+= 1
        browserForwardEntry = nil
    }

    mutating func resetForUnpair() {
        api = nil
        accessToken = nil
        profile = nil
        selectedConnectionId = nil
        hosts = []
        hostsLRU = []
        hostSocketStates = [:]
        browserForwardEntry = nil
        browserForwardOnlineEpoch = 0
        browserForwardRefresh = nil
        snapshot = nil
        hostSnapshots = [:]
        clearThreadSurface()
        threadOwnership.invalidate()
        openThreadEpoch = threadOwnership.epoch
        lastSeenSeq = 0
        socketReplayCeiling = 0
        isResyncing = false
        needsAuthoritativeRefresh = false
        resyncCoordinator.reset()
        resyncAttemptId = 0
        liveLifecycle.clearAllPending()
        pairingTracker.reset()
        interestCoordinator.reset()
        replay = HostReplayState()
        replayInstallBuffer.discard()
        replayInstallGeneration &+= 1
        gitInterestCoordinator.reset()
        explicitGitInterests = []
        pendingPairing = nil
        hydrationBuffer.discard()
        historyLoadGeneration += 1
        phase = .needsPairing
        socketState = .idle
        projectsLoadState = .idle
        globalError = nil
    }
}
