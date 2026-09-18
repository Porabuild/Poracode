import Foundation

struct BrowseHostDirectoryRequest: Codable, Equatable, Sendable {
    var path: String

    init(path: String = "") {
        self.path = path
    }

    private enum CodingKeys: String, CodingKey {
        case path
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        path = try values.decodeIfPresent(String.self, forKey: .path) ?? ""
    }
}

struct HostDirectoryEntry: Codable, Equatable, Hashable, Sendable, Identifiable {
    enum EntryType: String, Codable, Sendable {
        case file
        case directory
    }

    var name: String
    var path: String
    var type: EntryType

    var id: String { path }
}

struct BrowseHostDirectoryResult: Codable, Equatable, Sendable {
    static let driveListPath = "::drives::"

    var path: String
    var parentPath: String?
    var homePath: String
    /// Received ordering is authoritative (normally directories first).
    var entries: [HostDirectoryEntry]
    var truncated: Bool

    var isDriveList: Bool { path == Self.driveListPath }
}

struct DetectSetupScriptRequest: Codable, Equatable, Sendable {
    var projectLocation: ProjectLocation
}

struct DetectSetupScriptResult: Codable, Equatable, Sendable {
    var setupScript: String?
}
