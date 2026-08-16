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

        struct VersionedCapability: Codable, Sendable, Equatable {
            var versions: [Int]
        }
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

    static let empty = ThreadConfig(model: "default")
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
    var parentThreadId: String?

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
}

struct RemoteRuntimeItemsPage: Codable, Sendable, Equatable {
    var items: [PersistedRuntimeItem]
    var nextCursor: Int?
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
