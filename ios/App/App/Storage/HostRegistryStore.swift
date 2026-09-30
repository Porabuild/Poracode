import Foundation

/// Non-secret Application Support registry (`formatVersion` current).
/// Complete-file atomic / no-backup replacement only.
struct HostRegistryStore: Sendable {
    static let fileName = "registry.json"
    static let directoryName = "hosts"

    let directory: URL
    let fileStore: AtomicFileStore

    var registryURL: URL {
        directory.appendingPathComponent(Self.fileName)
    }

    init(directory: URL, fileStore: AtomicFileStore = AtomicFileStore()) {
        self.directory = directory
        self.fileStore = fileStore
    }

    static func productionDirectory() throws -> URL {
        let appSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return appSupport
            .appendingPathComponent("Poracode", isDirectory: true)
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    var fileExists: Bool {
        fileStore.fileExists(at: registryURL)
    }

    func readRaw() throws -> Data? {
        try fileStore.read(at: registryURL)
    }

    /// Write caller-supplied exact bytes. Recovery must not re-encode.
    func writeExact(_ data: Data) throws {
        try fileStore.replace(with: data, at: registryURL)
    }

    func remove() throws {
        try fileStore.removeIfPresent(at: registryURL)
    }

    func loadDocument() throws -> HostRegistryDocument? {
        guard let data = try readRaw() else { return nil }
        return try decodeDocument(data)
    }

    /// Versioned read boundary. A version 2 (direct-only) document is migrated
    /// in memory to the current shape with `environment == nil` on every
    /// record; direct records keep every field byte-for-byte. Future versions
    /// and corrupt payloads refuse without rewriting the file.
    func decodeDocument(_ data: Data) throws -> HostRegistryDocument {
        try Self.migratedDocument(data)
    }

    static func migratedDocument(_ data: Data) throws -> HostRegistryDocument {
        let probe = try HostRegistryCoding.decode(HostRegistryFormatProbe.self, from: data)
        if probe.formatVersion == HostRegistryDocument.formatVersion {
            return try HostRegistryCoding.decode(HostRegistryDocument.self, from: data).validated()
        }
        if probe.formatVersion == HostRegistryDocument.legacyDirectFormatVersion {
            let legacy = try HostRegistryCoding.decode(
                LegacyDirectHostRegistryDocument.self,
                from: data
            )
            let migrated = HostRegistryDocument(
                formatVersion: HostRegistryDocument.formatVersion,
                selectedConnectionId: legacy.selectedConnectionId,
                lru: legacy.lru,
                hosts: legacy.hosts
            )
            return try migrated.validated()
        }
        throw HostRegistryError.unsupportedFormat(probe.formatVersion)
    }

    func encode(_ document: HostRegistryDocument) throws -> Data {
        var copy = document
        copy.formatVersion = HostRegistryDocument.formatVersion
        return try HostRegistryCoding.encode(copy.validated())
    }
}

/// Raw version probe for the registry file. Never trusts the rest of the shape.
struct HostRegistryFormatProbe: Codable, Sendable, Equatable {
    var formatVersion: Int
}

/// Version 2 on-disk registry shape (direct/device-local records only).
/// Decoded only by the explicit migration above; never written.
struct LegacyDirectHostRegistryDocument: Codable, Sendable, Equatable {
    var formatVersion: Int
    var selectedConnectionId: ClientConnectionID?
    var lru: [ClientConnectionID]
    var hosts: [HostRecord]
}

enum HostRegistryError: Error, Sendable, Equatable {
    case unsupportedFormat(Int)
    case duplicateHost
    case invalidLRU
    case missingSelectedHost
    case selectedHostIsNotLRUHead
    case invalidEmptySelection
}
