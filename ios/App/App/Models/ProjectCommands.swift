import Foundation

/// A JSON merge-patch field where omission, null, and a concrete value differ.
enum PatchValue<Value: Sendable>: Sendable {
    case unchanged
    case clear
    case set(Value)

    var isUnchanged: Bool {
        if case .unchanged = self { return true }
        return false
    }
}

extension PatchValue: Equatable where Value: Equatable {}
extension PatchValue: Hashable where Value: Hashable {}
extension PatchValue: Codable where Value: Codable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self = container.decodeNil() ? .clear : .set(try container.decode(Value.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .unchanged:
            throw EncodingError.invalidValue(
                self,
                .init(
                    codingPath: encoder.codingPath, debugDescription: "Omit unchanged patch fields")
            )
        case .clear:
            try container.encodeNil()
        case .set(let value):
            try container.encode(value)
        }
    }
}
struct GitHubAccountReference: Codable, Hashable, Sendable {
    var host: String
    var login: String
}
enum CloneRepoSource: Codable, Hashable, Sendable {
    case url(String)
    case github(nameWithOwner: String, account: GitHubAccountReference)

    private enum CodingKeys: String, CodingKey {
        case kind
        case url
        case nameWithOwner
        case account
    }
    private enum Kind: String, Codable {
        case url
        case github
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        switch try values.decode(Kind.self, forKey: .kind) {
        case .url:
            self = .url(try values.decode(String.self, forKey: .url))
        case .github:
            self = .github(
                nameWithOwner: try values.decode(String.self, forKey: .nameWithOwner),
                account: try values.decode(GitHubAccountReference.self, forKey: .account)
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .url(let url):
            try values.encode(Kind.url, forKey: .kind)
            try values.encode(url, forKey: .url)
        case .github(let nameWithOwner, let account):
            try values.encode(Kind.github, forKey: .kind)
            try values.encode(nameWithOwner, forKey: .nameWithOwner)
            try values.encode(account, forKey: .account)
        }
    }
}
struct ProjectPatch: Codable, Equatable, Sendable {
    var name: PatchValue<String> = .unchanged
    var scripts: PatchValue<ProjectScripts> = .unchanged
    var searchSettings: PatchValue<ProjectSearchSettings> = .unchanged
    var worktreeLocation: PatchValue<ProjectWorktreeLocation> = .unchanged
    var mcpServers: PatchValue<[ProjectMCPServer]> = .unchanged
    var disabled: PatchValue<Bool> = .unchanged

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case name
        case scripts
        case searchSettings
        case worktreeLocation
        case mcpServers
        case disabled
    }

    init(
        name: PatchValue<String> = .unchanged,
        scripts: PatchValue<ProjectScripts> = .unchanged,
        searchSettings: PatchValue<ProjectSearchSettings> = .unchanged,
        worktreeLocation: PatchValue<ProjectWorktreeLocation> = .unchanged,
        mcpServers: PatchValue<[ProjectMCPServer]> = .unchanged,
        disabled: PatchValue<Bool> = .unchanged
    ) {
        self.name = name
        self.scripts = scripts
        self.searchSettings = searchSettings
        self.worktreeLocation = worktreeLocation
        self.mcpServers = mcpServers
        self.disabled = disabled
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        name = try Self.decodeNonNullable(String.self, key: .name, from: values)
        scripts = try Self.decodeNullable(ProjectScripts.self, key: .scripts, from: values)
        searchSettings = try Self.decodeNullable(
            ProjectSearchSettings.self,
            key: .searchSettings,
            from: values
        )
        worktreeLocation = try Self.decodeNullable(
            ProjectWorktreeLocation.self,
            key: .worktreeLocation,
            from: values
        )
        mcpServers = try Self.decodeNullable(
            [ProjectMCPServer].self, key: .mcpServers, from: values)
        disabled = try Self.decodeNonNullable(Bool.self, key: .disabled, from: values)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try Self.encodeNonNullable(name, key: .name, to: &values)
        try Self.encodeNullable(scripts, key: .scripts, to: &values)
        try Self.encodeNullable(searchSettings, key: .searchSettings, to: &values)
        try Self.encodeNullable(worktreeLocation, key: .worktreeLocation, to: &values)
        try Self.encodeNullable(mcpServers, key: .mcpServers, to: &values)
        try Self.encodeNonNullable(disabled, key: .disabled, to: &values)
    }
}

extension ProjectPatch {
    private static func decodeNullable<Value: Codable & Sendable>(
        _ type: Value.Type,
        key: CodingKeys,
        from values: KeyedDecodingContainer<CodingKeys>
    ) throws -> PatchValue<Value> {
        guard values.contains(key) else { return .unchanged }
        return try values.decodeNil(forKey: key) ? .clear : .set(values.decode(type, forKey: key))
    }

    private static func decodeNonNullable<Value: Codable & Sendable>(
        _ type: Value.Type,
        key: CodingKeys,
        from values: KeyedDecodingContainer<CodingKeys>
    ) throws -> PatchValue<Value> {
        guard values.contains(key) else { return .unchanged }
        guard try !values.decodeNil(forKey: key) else {
            throw DecodingError.valueNotFound(
                type,
                .init(
                    codingPath: values.codingPath + [key],
                    debugDescription: "Patch field cannot be null")
            )
        }
        return .set(try values.decode(type, forKey: key))
    }

    private static func encodeNullable<Value: Codable & Sendable>(
        _ value: PatchValue<Value>,
        key: CodingKeys,
        to values: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        switch value {
        case .unchanged: break
        case .clear: try values.encodeNil(forKey: key)
        case .set(let concrete): try values.encode(concrete, forKey: key)
        }
    }

    private static func encodeNonNullable<Value: Codable & Sendable>(
        _ value: PatchValue<Value>,
        key: CodingKeys,
        to values: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        guard case .clear = value else {
            try encodeNullable(value, key: key, to: &values)
            return
        }
        throw EncodingError.invalidValue(
            value,
            .init(
                codingPath: values.codingPath + [key],
                debugDescription: "Patch field cannot be null")
        )
    }
}

enum ProjectCommand: Codable, Equatable, Sendable {
    case addExisting(path: String, name: String?)
    case create(parentPath: String, name: String)
    case clone(parentPath: String, name: String, source: CloneRepoSource)
    case update(projectId: String, patch: ProjectPatch)
    case relocate(projectId: String, path: String)
    case remove(projectId: String)

    private enum CodingKeys: String, CodingKey {
        case kind
        case path
        case parentPath
        case name
        case source
        case projectId
        case patch
    }

    private enum Kind: String, Codable {
        case addExisting = "add-existing"
        case create
        case clone
        case update
        case relocate
        case remove
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        switch try values.decode(Kind.self, forKey: .kind) {
        case .addExisting:
            self = .addExisting(
                path: try values.decode(String.self, forKey: .path),
                name: try values.decodeIfPresent(String.self, forKey: .name)
            )
        case .create:
            self = .create(
                parentPath: try values.decode(String.self, forKey: .parentPath),
                name: try values.decode(String.self, forKey: .name)
            )
        case .clone:
            self = .clone(
                parentPath: try values.decode(String.self, forKey: .parentPath),
                name: try values.decode(String.self, forKey: .name),
                source: try values.decode(CloneRepoSource.self, forKey: .source)
            )
        case .update:
            self = .update(
                projectId: try values.decode(String.self, forKey: .projectId),
                patch: try values.decode(ProjectPatch.self, forKey: .patch)
            )
        case .relocate:
            self = .relocate(
                projectId: try values.decode(String.self, forKey: .projectId),
                path: try values.decode(String.self, forKey: .path)
            )
        case .remove:
            self = .remove(projectId: try values.decode(String.self, forKey: .projectId))
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .addExisting(let path, let name):
            try values.encode(Kind.addExisting, forKey: .kind)
            try values.encode(path, forKey: .path)
            try values.encodeIfPresent(name, forKey: .name)
        case .create(let parentPath, let name):
            try values.encode(Kind.create, forKey: .kind)
            try values.encode(parentPath, forKey: .parentPath)
            try values.encode(name, forKey: .name)
        case .clone(let parentPath, let name, let source):
            try values.encode(Kind.clone, forKey: .kind)
            try values.encode(parentPath, forKey: .parentPath)
            try values.encode(name, forKey: .name)
            try values.encode(source, forKey: .source)
        case .update(let projectId, let patch):
            try values.encode(Kind.update, forKey: .kind)
            try values.encode(projectId, forKey: .projectId)
            try values.encode(patch, forKey: .patch)
        case .relocate(let projectId, let path):
            try values.encode(Kind.relocate, forKey: .kind)
            try values.encode(projectId, forKey: .projectId)
            try values.encode(path, forKey: .path)
        case .remove(let projectId):
            try values.encode(Kind.remove, forKey: .kind)
            try values.encode(projectId, forKey: .projectId)
        }
    }
}

struct ProjectCommandResult: Codable, Equatable, Sendable {
    var projects: [RemoteProject]
    var project: RemoteProject?
}
