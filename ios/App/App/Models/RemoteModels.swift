import Foundation

// MARK: - Environment & auth

struct RemoteEnvironmentDescriptor: Codable, Sendable, Equatable {
    var protocolVersion: Int
    var hostMode: String?
    var desktopId: String
    var label: String
    var appVersion: String
    var platform: String?
    var auth: Auth
    var endpoints: Endpoints
    var capabilities: Capabilities? = nil

    struct Auth: Codable, Sendable, Equatable {
        /// Optional on the wire for older helpers; validated when present.
        var policy: String?
        var bootstrapMethods: [String]
        var sessionMethods: [String]
        var scopes: [String]
    }

    struct Endpoints: Codable, Sendable, Equatable {
        var httpBaseUrl: String
        var wsBaseUrl: String
    }

    struct Capabilities: Codable, Sendable, Equatable {
        var pushRouting: VersionedCapability?
        /// Additive since browser-origin forward entry shipped. Absent on older
        /// hosts; unknown keys on newer hosts are ignored by the decoder.
        var browserForward: VersionedCapability?
        /// Additive: cursor-sync versions the host advertises (v2 = chunked
        /// terminal baselines with ack credit). Absent on older hosts.
        var terminalCursorSync: VersionedCapability?
        /// C1: host-owned environments v1. Emitted only when every environment
        /// route is usable on the host; absent hides the feature.
        var sshEnvironments: VersionedCapability?
        /// B1: durable runtime history notices v1. Advertised only by a host
        /// whose composition wires the durable gap/notice store; absence or an
        /// unknown-only version list means "not advertised here".
        var runtimeHistoryNotices: VersionedCapability?
        /// Bounded catalog-change signals v1. A declared connection receives
        /// `remote-projects-changed` as `{type, mode:"signal"}` with no rows
        /// and refreshes through the bounded catalog reads.
        var boundedCatalogChanges: VersionedCapability?
        /// Bounded project-command results v1. Advertised only by a host whose
        /// project-command route accepts the per-request result declaration;
        /// absence or an unknown-only version list means "not advertised here"
        /// and keeps the complete legacy result.
        var projectCommandResults: VersionedCapability?

        struct VersionedCapability: Codable, Sendable, Equatable {
            var versions: [Int]
        }
    }
}

extension RemoteEnvironmentDescriptor {
    /// Frozen wire version for origin-bound browser forward entry
    /// (`/forward/<id>/enter?fwt=…` two-hop exchange on the current route).
    static let browserForwardEntryVersion = 1
    /// Frozen wire version of the B1 durable history-notice capability.
    static let runtimeHistoryNoticesVersion = 1
    /// Frozen wire version of the bounded catalog-change signal capability.
    static let boundedCatalogChangesVersion = 1
    /// Frozen wire version of the bounded project-command result capability.
    static let projectCommandResultsVersion = 1

    /// True only when the environment handshake advertises browser-origin
    /// forward entry at the supported version. A positive signal only: absence
    /// or unknown versions mean "not advertised here" — never that raw TCP
    /// forwarding is unavailable (the `ports:forward` scope stays that gate)
    /// and never that entry is isolated.
    var advertisesBrowserForwardEntry: Bool {
        capabilities?.browserForward?.versions
            .contains(Self.browserForwardEntryVersion) == true
    }

    /// True only when the handshake advertises durable history notices at the
    /// supported version. Positive signal only; every failure/absence is "not
    /// advertised" and leaves transcript reads undeclared.
    var advertisesRuntimeHistoryNotices: Bool {
        capabilities?.runtimeHistoryNotices?.versions
            .contains(Self.runtimeHistoryNoticesVersion) == true
    }

    /// True only when the handshake advertises bounded catalog-change signals
    /// at the supported version.
    var advertisesBoundedCatalogChanges: Bool {
        capabilities?.boundedCatalogChanges?.versions
            .contains(Self.boundedCatalogChangesVersion) == true
    }

    /// True only when the handshake advertises bounded project-command results
    /// at the supported version. Positive signal only; every failure/absence is
    /// "not advertised" and keeps the complete legacy request/result.
    var advertisesProjectCommandResults: Bool {
        capabilities?.projectCommandResults?.versions
            .contains(Self.projectCommandResultsVersion) == true
    }
}

struct RemoteAccessTokenResult: Codable, Sendable, Equatable {
    var accessToken: String
    var tokenType: String
    var expiresAt: String
    var scopes: [String]
}

struct RemoteWebSocketTicketResult: Codable, Sendable, Equatable {
    var ticket: String
    var expiresAt: String
}

struct RemoteHttpErrorPayload: Codable, Sendable {
    struct ErrorBody: Codable, Sendable {
        var code: String
        var message: String
    }

    var error: ErrorBody
}

// MARK: - Shell snapshot

/// Runtime environment pinned for a provider that cannot execute natively
/// (`threadConfigSchema.executionEnvironment`, remote protocol v9). The host
/// replaces thread configs wholesale on every config-carrying mutation, so
/// this field must survive every native round-trip or a pinned distro is
/// silently reset to the host default.
struct RemoteExecutionEnvironment: Codable, Sendable, Hashable {
    var kind: String
    var distro: String
}

struct ThreadConfig: Codable, Sendable, Hashable {
    var model: String
    var effort: String?
    var contextSize: String?
    var fast: Bool?
    var thinking: Bool?
    var mode: String?
    var approvalPolicy: String?
    var approvalsReviewer: String?
    var sandboxMode: String?
    var browserMcp: Bool?
    var crossagentMcp: Bool?
    var computerUse: Bool?
    var chromeMcp: Bool?
    var executionEnvironment: RemoteExecutionEnvironment?

    static let empty = ThreadConfig(model: "default")
}

struct RemoteSlashCommand: Codable, Sendable, Hashable {
    let id: String
    let label: String
    var description: String? = nil
    var argumentHint: String? = nil
    var section: String? = nil
    var skillName: String? = nil
    var skillPath: String? = nil
    var skillInvocation: String? = nil
    var skillProvider: String? = nil
    var skillScope: String? = nil
    var pluginId: String? = nil
    var pluginName: String? = nil
}

struct RemoteThread: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var remoteServerId: String?
    var remoteId: String?
    var projectId: String
    var title: String
    var agentKind: String
    var agentInstanceId: String?
    var config: ThreadConfig
    var status: String
    var threadStatusSource: String?
    var attention: String
    var canResumeWithConfig: Bool?
    var worktreePath: String?
    var worktreeBranch: String?
    var archived: Bool?
    var done: Bool?
    var starred: Bool?
    var presentationMode: String?
    var createdAt: String
    var updatedAt: String
    var activeTurnStartedAt: String?
    var lastTurnStartedAt: String?
    var lastTurnEndedAt: String?
    var errorMessage: String?
    var slashCommands: [RemoteSlashCommand]? = nil
    var parentThreadId: String?
    var groupId: String?
    var groupName: String?

    var isArchived: Bool { archived ?? false }
    var isDone: Bool { done ?? false }
    var isStarred: Bool { starred ?? false }
}

struct RemoteRuntimeSummary: Codable, Sendable, Hashable {
    var itemCount: Int
    var latestItemId: String?
    var latestItemType: String?
    var latestItemState: String?
}

struct RemoteShellSnapshot: Codable, Sendable, Equatable {
    var snapshotSeq: Int
    var projects: [RemoteProject]
    var threads: [RemoteThread]
    var runtimeSummariesByThread: [String: RemoteRuntimeSummary]
    var updatedAt: String
    /// Additive since git summaries shipped. Absent on older hosts — kept as raw
    /// JSON so a decode failure in one entry cannot reject the whole snapshot
    /// route; strict projection happens at install time.
    var gitSummariesByThread: JSONValue?
    /// Additive normalized host-owned Git/PR state. Absent on legacy hosts.
    var gitState: JSONValue?
    /// B4 bounded-page carries. Absent on legacy hosts and absent in every
    /// in-memory snapshot assembled from a legacy response.
    var reads: String? = nil
    var threadsNextCursor: String? = nil
    var projectsNextCursor: String? = nil
}

extension RemoteShellSnapshot {
    /// Strict projection of the additive git summaries. `nil` means the host
    /// omitted the field and the cached summaries must be preserved.
    func decodedGitSummaries() throws -> [String: GitThreadSummary]? {
        guard let gitSummariesByThread else { return nil }
        return try GitThreadSummary.map(wire: gitSummariesByThread)
    }

    /// Strict projection of the additive Git/PR state snapshot.
    func decodedGitState() throws -> GitStateSnapshot? {
        guard let gitState else { return nil }
        return try GitStateSnapshot(wire: gitState)
    }
}

// MARK: - B1 durable history notices

/// The durable thread-level history-incomplete notice as the transcript
/// renders it. Wire shape is the host's `remoteRuntimeHistoryNoticeSchema`;
/// `refusedEvents`/`refusedBytes` are cumulative lower bounds, never exact
/// loss totals, and the idempotence token is deliberately absent (it is a
/// server-side key, never a client credential).
struct RemoteHistoryNotice: Codable, Sendable, Equatable, Hashable {
    var kind: String
    var source: String
    var reason: String
    var refusedEvents: Int
    var refusedBytes: Int
    var acknowledgedCount: Int
    var firstAcknowledgedAt: Int
    var lastAcknowledgedAt: Int
}

/// The current unacknowledged episode's opaque precondition. `token` is echoed
/// back to the acknowledge route; `suspect` episodes come from a surviving
/// boot touch and carry a foreign boot epoch instead of a UUID.
struct RemoteHistoryGapDescriptor: Codable, Sendable, Equatable, Hashable {
    var token: String
    var source: String
    var reason: String
    var refusedEvents: Int
    var refusedBytes: Int
    var createdAt: Int
}

/// `GET /api/threads/{threadId}/runtime/gap` result.
struct RemoteHistoryGapRead: Equatable, Sendable {
    var gap: RemoteHistoryGapDescriptor?
    var notice: RemoteHistoryNotice?
}

/// The acknowledgement outcome projection. `applied` records the notice and
/// clears the matching episode; `already` replays a previously recorded
/// acknowledgement (zero writes); `stale` means the echoed token no longer
/// matches the current episode — `current` is the truthful state, which may be
/// clean (`nil`). A client never auto-acknowledges the replacement.
enum RemoteHistoryGapAcknowledgeOutcome: Equatable, Sendable {
    case applied(notice: RemoteHistoryNotice, supersededAcceptedEvents: Int)
    case already(notice: RemoteHistoryNotice)
    case stale(current: RemoteHistoryGapDescriptor?)
}

// MARK: - Thread history

struct PersistedRuntimeItem: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var type: String
    var state: String
    var payload: JSONValue?
    var streams: [String: String]
    var parentItemId: String?

    /// Best-effort text for transcript rows (canonical streams + payload content blocks).
    var displayText: String {
        TranscriptText.displayText(for: self)
    }
}

struct RemoteThreadSnapshot: Codable, Sendable, Equatable {
    var snapshotSeq: Int
    var thread: RemoteThread
    var runtimeItems: [PersistedRuntimeItem]
    var runtimeNextCursor: Int?
    var completedTurns: [JSONValue]
    var contextUsage: JSONValue?
    var terminalScrollback: String?
    var updatedAt: String
    /// Tri-state follow-up queue: `followUpQueuePresent == false` means the
    /// wire field was absent (supervisor read failed — callers preserve the
    /// projected queue); explicit null clears; an object carries queue state.
    var followUpQueue: JSONValue?
    var followUpQueuePresent: Bool = false
    /// B4: `ct1.` continuation for older completed turns. Absent on legacy
    /// hosts and on legacy responses; additive on declared hosts.
    var completedTurnsNextCursor: String? = nil
    /// B4 capability echo; present only on bounded declared-host responses.
    var reads: String? = nil
    /// B1 durable history notice. Optional on the wire and absent on hosts
    /// without the feature; an omitted field never clears a retained notice.
    var runtimeNotice: RemoteHistoryNotice? = nil

    private enum CodingKeys: String, CodingKey {
        case snapshotSeq, thread, runtimeItems, runtimeNextCursor, completedTurns
        case contextUsage, terminalScrollback, updatedAt, followUpQueue
        case completedTurnsNextCursor, reads, runtimeNotice
    }

    init(
        snapshotSeq: Int,
        thread: RemoteThread,
        runtimeItems: [PersistedRuntimeItem],
        runtimeNextCursor: Int? = nil,
        completedTurns: [JSONValue],
        contextUsage: JSONValue? = nil,
        terminalScrollback: String? = nil,
        updatedAt: String,
        followUpQueue: JSONValue? = nil,
        followUpQueuePresent: Bool = false,
        completedTurnsNextCursor: String? = nil,
        reads: String? = nil,
        runtimeNotice: RemoteHistoryNotice? = nil
    ) {
        self.snapshotSeq = snapshotSeq
        self.thread = thread
        self.runtimeItems = runtimeItems
        self.runtimeNextCursor = runtimeNextCursor
        self.completedTurns = completedTurns
        self.contextUsage = contextUsage
        self.terminalScrollback = terminalScrollback
        self.updatedAt = updatedAt
        self.followUpQueue = followUpQueue
        self.followUpQueuePresent = followUpQueuePresent
        self.completedTurnsNextCursor = completedTurnsNextCursor
        self.reads = reads
        self.runtimeNotice = runtimeNotice
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        snapshotSeq = try container.decode(Int.self, forKey: .snapshotSeq)
        thread = try container.decode(RemoteThread.self, forKey: .thread)
        runtimeItems = try container.decode([PersistedRuntimeItem].self, forKey: .runtimeItems)
        runtimeNextCursor = try container.decodeIfPresent(Int.self, forKey: .runtimeNextCursor)
        completedTurns = try container.decode([JSONValue].self, forKey: .completedTurns)
        contextUsage = try container.decodeIfPresent(JSONValue.self, forKey: .contextUsage)
        terminalScrollback = try container.decodeIfPresent(String.self, forKey: .terminalScrollback)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        if container.contains(.followUpQueue) {
            followUpQueuePresent = true
            followUpQueue = try container.decodeIfPresent(JSONValue.self, forKey: .followUpQueue)
        } else {
            followUpQueuePresent = false
            followUpQueue = nil
        }
        completedTurnsNextCursor = try container.decodeIfPresent(
            String.self, forKey: .completedTurnsNextCursor
        )
        reads = try container.decodeIfPresent(String.self, forKey: .reads)
        runtimeNotice = try container.decodeIfPresent(RemoteHistoryNotice.self, forKey: .runtimeNotice)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(snapshotSeq, forKey: .snapshotSeq)
        try container.encode(thread, forKey: .thread)
        try container.encode(runtimeItems, forKey: .runtimeItems)
        try container.encodeIfPresent(runtimeNextCursor, forKey: .runtimeNextCursor)
        try container.encode(completedTurns, forKey: .completedTurns)
        try container.encodeIfPresent(contextUsage, forKey: .contextUsage)
        try container.encodeIfPresent(terminalScrollback, forKey: .terminalScrollback)
        try container.encode(updatedAt, forKey: .updatedAt)
        if followUpQueuePresent {
            try container.encode(followUpQueue, forKey: .followUpQueue)
        }
        try container.encodeIfPresent(completedTurnsNextCursor, forKey: .completedTurnsNextCursor)
        try container.encodeIfPresent(reads, forKey: .reads)
        try container.encodeIfPresent(runtimeNotice, forKey: .runtimeNotice)
    }
}

struct RemoteRuntimeItemsPage: Codable, Sendable, Equatable {
    var items: [PersistedRuntimeItem]
    var nextCursor: Int?
    /// B1 additive notice carry on item pages. Absent leaves a retained notice
    /// untouched; the turns page deliberately carries no notice field.
    var runtimeNotice: RemoteHistoryNotice? = nil
}

// MARK: - WebSocket envelopes

enum RemoteWebSocketServerMessage: Sendable, Equatable {
    case ready(seq: Int)
    case event(seq: Int, event: JSONValue)
    case resyncRequired(seq: Int, reason: String)
    case pong(id: String?, sentAt: Double?, receivedAt: Double)
    case terminalOutput(id: String, data: String)
    case unknown(type: String, raw: JSONValue)

    static func decode(from data: Data) throws -> RemoteWebSocketServerMessage {
        let canonical = try GeneratedRemoteV3Contract.serverWebSocketMessage(data)
        let root = try JSONDecoding.decode(JSONValue.self, from: canonical)
        guard case .object(let object) = root,
            case .string(let type)? = object["type"]
        else {
            throw RemoteClientError.invalidResponse("WebSocket message missing type.")
        }

        switch type {
        case "ready":
            guard let seq = object["seq"]?.numberInt else {
                throw RemoteClientError.invalidResponse("ready missing seq")
            }
            return .ready(seq: seq)
        case "event":
            guard let seq = object["seq"]?.numberInt,
                let event = object["event"]
            else {
                throw RemoteClientError.invalidResponse("event missing fields")
            }
            return .event(seq: seq, event: event)
        case "resync-required":
            guard let seq = object["seq"]?.numberInt,
                let reason = object["reason"]?.stringValue
            else {
                throw RemoteClientError.invalidResponse("resync-required missing fields")
            }
            return .resyncRequired(seq: seq, reason: reason)
        case "pong":
            let id = object["id"]?.stringValue
            let sentAt = object["sentAt"]?.numberValue
            guard let receivedAt = object["receivedAt"]?.numberValue else {
                throw RemoteClientError.invalidResponse("pong missing receivedAt")
            }
            return .pong(id: id, sentAt: sentAt, receivedAt: receivedAt)
        case "terminal-output":
            guard let id = object["id"]?.stringValue,
                let data = object["data"]?.stringValue
            else {
                throw RemoteClientError.invalidResponse("terminal-output missing fields")
            }
            return .terminalOutput(id: id, data: data)
        default:
            return .unknown(type: type, raw: root)
        }
    }
}

extension JSONValue {
    var numberValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    /// Exact JSON integer only — rejects fractional, NaN, and infinite values (no Int truncation).
    var numberInt: Int? {
        guard let number = numberValue, number.isFinite else { return nil }
        guard number.rounded(.towardZero) == number else { return nil }
        guard number >= Double(Int.min), number <= Double(Int.max) else { return nil }
        return Int(number)
    }
}

// MARK: - Client errors

struct RemoteClientError: LocalizedError, Sendable, Equatable {
    var message: String
    var status: Int
    var code: String
    /// Allowlisted response headers captured for a failed request (C1 R1).
    /// Only evidence a caller explicitly asked for is ever retained.
    var responseEvidence: [String: String]?

    var errorDescription: String? { message }

    static func invalidResponse(_ message: String) -> RemoteClientError {
        RemoteClientError(message: message, status: 500, code: "invalid_response")
    }

    static func protocolMismatch(found: Int?) -> RemoteClientError {
        RemoteClientError(
            message: PairingError.protocolVersionMismatch(found: found).errorDescription
                ?? "Protocol mismatch",
            status: 409,
            code: "protocol_version_mismatch"
        )
    }

    static var certificateMismatch: RemoteClientError {
        RemoteClientError(
            message: TlsCertPin.mismatchMessage,
            status: 502,
            code: TlsCertPin.mismatchCode
        )
    }

    /// Unsupported auth policy / bootstrap / session method literals (terminal incompatible).
    static func unsupportedEnvironment(_ message: String) -> RemoteClientError {
        RemoteClientError(message: message, status: 409, code: "unsupported_environment")
    }

    var isUnauthorized: Bool { status == 401 || status == 403 }
    var isNotFound: Bool { status == 404 }
    var isTransportFailure: Bool {
        status == 0 || status == 502 || status == 504 || code == "timeout" || code == "network"
    }
}
