import Darwin
import Foundation

/// Complete-file replacement: write temp, fsync, atomic replace, exclude from backup.
/// Never mutates the destination in place. No backup copy is left behind.
struct AtomicFileStore: @unchecked Sendable {
    let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func fileExists(at url: URL) -> Bool {
        fileManager.fileExists(atPath: url.path)
    }

    func read(at url: URL) throws -> Data? {
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }

    func replace(with data: Data, at url: URL) throws {
        let directory = url.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        excludeFromBackup(directory)

        let tmp = directory.appendingPathComponent(
            ".\(url.lastPathComponent).tmp-\(UUID().uuidString)"
        )
        do {
            try data.write(to: tmp, options: .noFileProtection)
            try synchronizeFile(at: tmp)
            excludeFromBackup(tmp)
            if fileManager.fileExists(atPath: url.path) {
                _ = try fileManager.replaceItemAt(
                    url,
                    withItemAt: tmp,
                    backupItemName: nil,
                    options: []
                )
            } else {
                try fileManager.moveItem(at: tmp, to: url)
            }
            excludeFromBackup(url)
            try synchronizeDirectory(at: directory)
        } catch {
            try? fileManager.removeItem(at: tmp)
            throw error
        }
    }

    func removeIfPresent(at url: URL) throws {
        guard fileManager.fileExists(atPath: url.path) else { return }
        try fileManager.removeItem(at: url)
    }

    private func synchronizeFile(at url: URL) throws {
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        if #available(iOS 13.0, *) {
            try handle.synchronize()
        } else {
            handle.synchronizeFile()
        }
    }

    private func synchronizeDirectory(at url: URL) throws {
        let descriptor = Darwin.open(url.path, O_RDONLY)
        guard descriptor >= 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        defer { Darwin.close(descriptor) }
        guard Darwin.fsync(descriptor) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
    }

    private func excludeFromBackup(_ url: URL) {
        var mutable = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? mutable.setResourceValues(values)
    }
}

extension Data.WritingOptions {
    fileprivate static var noFileProtection: Data.WritingOptions { [] }
}
