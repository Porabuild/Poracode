import SwiftUI
import UniformTypeIdentifiers

struct CustomThemeFile: FileDocument {
  static let readableContentTypes: [UTType] = [.json]
  let data: Data

  init(document: CustomThemeDocument) throws { data = try document.export() }
  init(configuration: ReadConfiguration) throws {
    guard let bytes = configuration.file.regularFileContents else { throw CustomThemeFailure.invalidDocument }
    _ = try CustomThemeDocument.parse(bytes)
    data = bytes
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }

  static func imported(from url: URL) throws -> CustomThemeDocument {
    let access = url.startAccessingSecurityScopedResource()
    defer { if access { url.stopAccessingSecurityScopedResource() } }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var bytes = Data()
    while bytes.count <= CustomThemeDocument.maximumBytes {
      let chunk = try handle.read(upToCount: CustomThemeDocument.maximumBytes + 1 - bytes.count) ?? Data()
      if chunk.isEmpty { break }
      bytes.append(chunk)
    }
    return try CustomThemeDocument.parse(bytes)
  }
}
