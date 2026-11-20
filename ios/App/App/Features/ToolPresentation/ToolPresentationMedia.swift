import Foundation

/// Interprets generic media references; file access remains in the existing
/// thread/host-scoped media controller and is never an iPad-local file read.
enum RichToolMediaProjection {
  static func images(_ presentation: RichToolPresentation, item: RichRuntimeItem) -> [RichImagePresentation] {
    // The catalog adds references; it does not replace the existing canonical
    // message/image-reference decoder (including nested remote image handles).
    var result = RichChatPresentation.images(for: item)
    for source in presentation.mediaSources {
      let root = source.root == .payload ? item.payload : .object(item.streams.mapValues(RichJSON.string))
      collect(RichToolTextProjection.read(root, path: source.path), into: &result, depth: 0)
    }
    var seen = Set<String>()
    return result.filter { seen.insert($0.id).inserted }.prefix(8).map { $0 }
  }

  private static func collect(_ value: RichJSON?, into result: inout [RichImagePresentation], depth: Int) {
    guard let value, depth <= 4, result.count < 8 else { return }
    if let remote = RichImagePolicy.decodeRemoteReference(value) { result.append(.remote(remote)); return }
    switch value {
    case .array(let values):
      for value in values where result.count < 8 { collect(value, into: &result, depth: depth + 1) }
    case .string(let source) where !source.isEmpty:
      if let classification = RichImagePolicy.classify(source) { result.append(.inline(source: source, classification: classification)) }
      else { result.append(.local(path: source)) }
    default: break
    }
  }
}
