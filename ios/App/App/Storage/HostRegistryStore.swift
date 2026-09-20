import Foundation

/// Non-secret Application Support registry (`formatVersion` 2).
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

    func decodeDocument(_ data: Data) throws -> HostRegistryDocument {
        let document = try HostRegistryCoding.decode(HostRegistryDocument.self, from: data)
        return try document.validated()
    }

    func encode(_ document: HostRegistryDocument) throws -> Data {
        var copy = document
        copy.formatVersion = HostRegistryDocument.formatVersion
        return try HostRegistryCoding.encode(copy.validated())
    }
}

enum HostRegistryError: Error, Sendable, Equatable {
    case unsupportedFormat(Int)
    case duplicateHost
    case invalidLRU
    case missingSelectedHost
    case selectedHostIsNotLRUHead
    case invalidEmptySelection
}
