import Foundation

struct ProjectAction: Codable, Equatable, Hashable, Sendable {
    var id: String
    var name: String
    var command: String
    var icon: String?
}

struct ProjectScripts: Codable, Equatable, Hashable, Sendable {
    var setupScript: String?
    var cleanupScript: String?
    var worktreeCopyPatterns: [String]?
    var actions: [ProjectAction]

    init(
        setupScript: String? = nil,
        cleanupScript: String? = nil,
        worktreeCopyPatterns: [String]? = nil,
        actions: [ProjectAction] = []
    ) {
        self.setupScript = setupScript
        self.cleanupScript = cleanupScript
        self.worktreeCopyPatterns = worktreeCopyPatterns
        self.actions = actions
    }

    private enum CodingKeys: String, CodingKey {
        case setupScript
        case cleanupScript
        case worktreeCopyPatterns
        case actions
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        setupScript = try values.decodeIfPresent(String.self, forKey: .setupScript)
        cleanupScript = try values.decodeIfPresent(String.self, forKey: .cleanupScript)
        worktreeCopyPatterns = try values.decodeIfPresent(
            [String].self, forKey: .worktreeCopyPatterns)
        actions = try values.decodeIfPresent([ProjectAction].self, forKey: .actions) ?? []
    }
}

struct ProjectSearchSettings: Codable, Equatable, Hashable, Sendable {
    var useIgnoreFiles: Bool?
    var exclude: [String: Bool]?
}

struct ProjectWorktreeLocation: Codable, Equatable, Hashable, Sendable {
    enum Mode: String, Codable, Sendable {
        case global
        case projectRelative = "project-relative"
    }

    var mode: Mode?
    var basePath: String?
}

/// A wire dictionary whose ordinary string and debug representations redact values.
struct SensitiveStringMap: Codable, Equatable, Hashable, Sendable,
    CustomStringConvertible, CustomDebugStringConvertible
{
    private let storage: [String: String]

    init(_ storage: [String: String] = [:]) {
        self.storage = storage
    }

    var count: Int { storage.count }
    var keys: [String] { storage.keys.sorted() }

    func secretValue(forKey key: String) -> String? {
        storage[key]
    }

    var description: String {
        "SensitiveStringMap(keys: \(keys), values: <redacted>)"
    }

    var debugDescription: String { description }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        storage = try container.decode([String: String].self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(storage)
    }
}

enum ProjectMCPTransport: Codable, Equatable, Hashable, Sendable,
    CustomStringConvertible, CustomDebugStringConvertible
{
    case stdio(command: String, args: [String], env: SensitiveStringMap, cwd: String?)
    case http(url: String, headers: SensitiveStringMap)
    case sse(url: String, headers: SensitiveStringMap)

    private enum CodingKeys: String, CodingKey {
        case type
        case command
        case args
        case env
        case cwd
        case url
        case headers
    }

    private enum Kind: String, Codable {
        case stdio
        case http
        case sse
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        switch try values.decode(Kind.self, forKey: .type) {
        case .stdio:
            self = .stdio(
                command: try values.decode(String.self, forKey: .command),
                args: try values.decodeIfPresent([String].self, forKey: .args) ?? [],
                env: try values.decodeIfPresent(SensitiveStringMap.self, forKey: .env) ?? .init(),
                cwd: try values.decodeIfPresent(String.self, forKey: .cwd)
            )
        case .http:
            self = .http(
                url: try values.decode(String.self, forKey: .url),
                headers: try values.decodeIfPresent(SensitiveStringMap.self, forKey: .headers)
                    ?? .init()
            )
        case .sse:
            self = .sse(
                url: try values.decode(String.self, forKey: .url),
                headers: try values.decodeIfPresent(SensitiveStringMap.self, forKey: .headers)
                    ?? .init()
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .stdio(let command, let args, let env, let cwd):
            try values.encode(Kind.stdio, forKey: .type)
            try values.encode(command, forKey: .command)
            try values.encode(args, forKey: .args)
            try values.encode(env, forKey: .env)
            try values.encodeIfPresent(cwd, forKey: .cwd)
        case .http(let url, let headers):
            try values.encode(Kind.http, forKey: .type)
            try values.encode(url, forKey: .url)
            try values.encode(headers, forKey: .headers)
        case .sse(let url, let headers):
            try values.encode(Kind.sse, forKey: .type)
            try values.encode(url, forKey: .url)
            try values.encode(headers, forKey: .headers)
        }
    }

    var description: String {
        switch self {
        case .stdio(let command, let args, _, let cwd):
            "ProjectMCPTransport.stdio(command: \(command), args: \(args), env: <redacted>, cwd: \(cwd ?? "nil"))"
        case .http(let url, _):
            "ProjectMCPTransport.http(url: \(url), headers: <redacted>)"
        case .sse(let url, _):
            "ProjectMCPTransport.sse(url: \(url), headers: <redacted>)"
        }
    }

    var debugDescription: String { description }
}

struct ProjectMCPServer: Codable, Equatable, Hashable, Sendable,
    CustomStringConvertible, CustomDebugStringConvertible
{
    var id: String
    var name: String
    var descriptionText: String
    var enabled: Bool
    var timeoutMs: Int
    var disabledTools: [String]?
    var transport: ProjectMCPTransport

    init(
        id: String,
        name: String,
        descriptionText: String = "",
        enabled: Bool = true,
        timeoutMs: Int = 30_000,
        disabledTools: [String]? = nil,
        transport: ProjectMCPTransport
    ) {
        self.id = id
        self.name = name
        self.descriptionText = descriptionText
        self.enabled = enabled
        self.timeoutMs = timeoutMs
        self.disabledTools = disabledTools
        self.transport = transport
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case descriptionText = "description"
        case enabled
        case timeoutMs
        case disabledTools
        case transport
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        name = try values.decode(String.self, forKey: .name)
        descriptionText = try values.decodeIfPresent(String.self, forKey: .descriptionText) ?? ""
        enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        timeoutMs = try values.decodeIfPresent(Int.self, forKey: .timeoutMs) ?? 30_000
        disabledTools = try values.decodeIfPresent([String].self, forKey: .disabledTools)
        transport = try values.decode(ProjectMCPTransport.self, forKey: .transport)
    }

    var description: String {
        "ProjectMCPServer(id: \(id), name: \(name), transport: <redacted>)"
    }

    var debugDescription: String { description }
}

struct ProjectSettings: Codable, Equatable, Sendable {
    var mcpServers: [ProjectMCPServer]?
}
